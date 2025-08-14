import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import Bull from 'bull';
import { Op } from 'sequelize';
import { Webhook, WebhookDelivery } from '../models';
import { WebhookEvent, WebhookStatus, DeliveryStatus } from '../types/enums';
import redisClient from '../config/redis';

interface WebhookPayload {
  event: WebhookEvent;
  event_id: string;
  timestamp: string;
  data: Record<string, any>;
}

interface DeliveryMetrics {
  dns_lookup_ms?: number;
  tcp_connect_ms?: number;
  tls_handshake_ms?: number;
  response_time_ms?: number;
}

export class WebhookService {
  private deliveryQueue: Bull.Queue;
  private retryQueue: Bull.Queue;

  constructor() {
    // Initialize Bull queues
    this.deliveryQueue = new Bull('webhook-delivery', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      }
    });

    this.retryQueue = new Bull('webhook-retry', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      }
    });

    this.setupQueueProcessors();
  }

  private setupQueueProcessors(): void {
    // Process webhook deliveries
    this.deliveryQueue.process(async (job) => {
      const { deliveryId } = job.data;
      await this.processDelivery(deliveryId);
    });

    // Process retries
    this.retryQueue.process(async (job) => {
      const { deliveryId } = job.data;
      await this.processDelivery(deliveryId);
    });

    // Error handling
    this.deliveryQueue.on('failed', (job, err) => {
      console.error(`Webhook delivery job ${job.id} failed:`, err);
    });

    this.retryQueue.on('failed', (job, err) => {
      console.error(`Webhook retry job ${job.id} failed:`, err);
    });
  }

  async triggerWebhooks(
    companyId: number, 
    event: WebhookEvent | string, 
    eventId: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      // Find all active webhooks for this company and event
      const webhooks = await Webhook.findAll({
        where: {
          company_id: companyId,
          status: WebhookStatus.ACTIVE,
          events: {
            [Op.contains]: [event]
          }
        }
      });

      const payload: WebhookPayload = {
        event: event as WebhookEvent,
        event_id: eventId,
        timestamp: new Date().toISOString(),
        data
      };

      // Create delivery records and queue them
      for (const webhook of webhooks) {
        // Check circuit breaker
        if (webhook.isCircuitOpen()) {
          console.log(`Circuit breaker open for webhook ${webhook.id}, skipping`);
          continue;
        }

        const delivery = await WebhookDelivery.create({
          webhook_id: webhook.id,
          event_type: event,
          event_id: eventId,
          payload,
          status: DeliveryStatus.PENDING
        } as any);

        // Queue for immediate delivery
        await this.deliveryQueue.add(
          { deliveryId: delivery.id },
          {
            attempts: webhook.max_retries + 1,
            backoff: {
              type: 'exponential',
              delay: 5000
            },
            removeOnComplete: true,
            removeOnFail: false
          }
        );
      }
    } catch (error) {
      console.error('Error triggering webhooks:', error);
    }
  }

  private async processDelivery(deliveryId: number): Promise<void> {
    const delivery = await WebhookDelivery.findByPk(deliveryId, {
      include: [Webhook]
    });

    if (!delivery || !delivery.webhook) {
      throw new Error(`Delivery ${deliveryId} not found`);
    }

    const webhook = delivery.webhook;
    const startTime = Date.now();
    const metrics: DeliveryMetrics = {};

    try {
      // Update status to in progress
      await delivery.update({ 
        status: DeliveryStatus.IN_PROGRESS,
        request_sent_at: new Date()
      });

      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'CRC-Webhook/1.0',
        'X-Webhook-ID': webhook.id.toString(),
        'X-Webhook-Event': delivery.event_type,
        'X-Webhook-Event-ID': delivery.event_id || '',
        'X-Webhook-Timestamp': new Date().toISOString(),
        'X-Webhook-Delivery-ID': delivery.delivery_id,
        ...webhook.custom_headers
      };

      // Add authentication
      this.addAuthentication(webhook, headers);

      // Add signature
      if (!webhook.signing_secret) {
        throw new Error(`Webhook ${webhook.id} is missing a signing secret`);
      }

      const signature = this.generateSignature(
        webhook.signing_secret,
        JSON.stringify(delivery.payload)
      );
      headers['X-Webhook-Signature'] = signature;

      // Make the request
      const response = await axios({
        method: 'POST',
        url: webhook.url,
        data: delivery.payload,
        headers,
        timeout: webhook.timeout_seconds * 1000,
        validateStatus: () => true, // Don't throw on non-2xx
        maxRedirects: 5,
        onDownloadProgress: (progressEvent) => {
          metrics.response_time_ms = Date.now() - startTime;
        }
      });

      const responseTime = Date.now() - startTime;

      // Update delivery record
      await delivery.update({
        status: this.isSuccessStatus(response.status) 
          ? DeliveryStatus.SUCCESS 
          : DeliveryStatus.FAILED,
        response_received_at: new Date(),
        response_status_code: response.status,
        response_headers: response.headers,
        response_body: this.truncateResponseBody(response.data),
        response_time_ms: responseTime,
        attempt_number: delivery.attempt_number + 1,
        ...metrics
      });

      // Update webhook stats
      await this.updateWebhookStats(webhook, response.status);

      // Handle non-success status
      if (!this.isSuccessStatus(response.status)) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      await this.handleDeliveryError(delivery, webhook, error as Error);
      throw error; // Re-throw to trigger retry
    }
  }

  private addAuthentication(webhook: Webhook, headers: Record<string, string>): void {
    if (!webhook.auth_type || !webhook.auth_credentials) return;

    switch (webhook.auth_type) {
      case 'basic':
        headers['Authorization'] = `Basic ${webhook.auth_credentials}`;
        break;
      case 'bearer':
        headers['Authorization'] = `Bearer ${webhook.auth_credentials}`;
        break;
      case 'api_key':
        headers['X-API-Key'] = webhook.auth_credentials;
        break;
    }
  }

  private generateSignature(secret: string, payload: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  private isSuccessStatus(status: number): boolean {
    return status >= 200 && status < 300;
  }

  private truncateResponseBody(data: any): string {
    try {
      const body = typeof data === 'string' ? data : JSON.stringify(data);
      return body.length > 1000 ? body.substring(0, 1000) + '...' : body;
    } catch {
      return '[Unable to serialize response]';
    }
  }

  private async handleDeliveryError(
    delivery: WebhookDelivery, 
    webhook: Webhook, 
    error: Error
  ): Promise<void> {
    const errorMessage = error.message;
    const isNetworkError = error instanceof AxiosError && !error.response;

    await delivery.update({
      status: DeliveryStatus.FAILED,
      error_message: errorMessage,
      error_details: {
        type: error.name,
        message: errorMessage,
        network_error: isNetworkError,
        timestamp: new Date().toISOString()
      }
    });

    // Update webhook failure count
    webhook.consecutive_failures += 1;
    webhook.last_triggered_at = new Date();
    await webhook.save();

    // Check if we should retry
    if (delivery.attempt_number < webhook.max_retries && webhook.retry_on_failure) {
      const retryDelay = this.calculateRetryDelay(delivery.attempt_number);
      
      await delivery.update({
        status: DeliveryStatus.RETRY,
        retry_after: new Date(Date.now() + retryDelay)
      });

      // Queue for retry
      await this.retryQueue.add(
        { deliveryId: delivery.id },
        { delay: retryDelay }
      );
    }

    // Open circuit breaker if too many failures
    if (webhook.consecutive_failures >= webhook.circuit_breaker_threshold) {
      webhook.circuit_opened_at = new Date();
      webhook.status = WebhookStatus.FAILED;
      await webhook.save();
      
      console.error(`Circuit breaker opened for webhook ${webhook.id}`);
    }
  }

  private calculateRetryDelay(attemptNumber: number): number {
    // Exponential backoff: 5s, 10s, 20s, 40s, etc.
    return Math.min(5000 * Math.pow(2, attemptNumber), 300000); // Max 5 minutes
  }

  private async updateWebhookStats(webhook: Webhook, statusCode: number): Promise<void> {
    webhook.last_triggered_at = new Date();
    webhook.last_status_code = statusCode;
    webhook.total_deliveries += 1;

    if (this.isSuccessStatus(statusCode)) {
      webhook.successful_deliveries += 1;
      webhook.consecutive_failures = 0;
      
      // Reset circuit breaker if it was open
      if (webhook.circuit_opened_at) {
        webhook.circuit_opened_at = null;
        webhook.status = WebhookStatus.ACTIVE;
      }
    } else {
      webhook.consecutive_failures += 1;
    }

    await webhook.save();
  }

  async getDeliveryHistory(
    webhookId: number, 
    limit: number = 100
  ): Promise<WebhookDelivery[]> {
    return WebhookDelivery.findAll({
      where: { webhook_id: webhookId },
      order: [['created_at', 'DESC']],
      limit
    });
  }

  async retryDelivery(deliveryId: number): Promise<void> {
    const delivery = await WebhookDelivery.findByPk(deliveryId, {
      include: [Webhook]
    });
    
    if (!delivery) {
      throw new Error('Delivery not found');
    }

    // Reset status and queue for retry
    await delivery.update({
      status: DeliveryStatus.PENDING,
      retry_after: null as any
    });

    await this.deliveryQueue.add({
      deliveryId: delivery.id
    });
  }

  async testWebhook(webhook: Webhook): Promise<void> {
    const testPayload = {
      test: true,
      webhook_id: webhook.id,
      webhook_name: webhook.name,
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook delivery'
    };

    await this.triggerWebhooks(
      webhook.company_id,
      'test.webhook',
      `test-${Date.now()}`,
      testPayload
    );
  }

  // Validate webhook URL
  async validateWebhookUrl(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        validateStatus: () => true
      });
      
      return response.status < 500;
    } catch (error) {
      return false;
    }
  }

  // Get webhook statistics
  async getWebhookStats(webhookId: number, days: number = 7): Promise<any> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const deliveries = await WebhookDelivery.findAll({
      where: {
        webhook_id: webhookId,
        created_at: { $gte: since }
      },
      attributes: [
        'status',
        'response_status_code',
        'response_time_ms'
      ]
    });

    const stats = {
      total: deliveries.length,
      successful: 0,
      failed: 0,
      pending: 0,
      retrying: 0,
      avg_response_time: 0,
      status_codes: {} as Record<string, number>
    };

    let totalResponseTime = 0;
    let responseCount = 0;

    deliveries.forEach(delivery => {
      switch (delivery.status) {
        case DeliveryStatus.SUCCESS:
          stats.successful++;
          break;
        case DeliveryStatus.FAILED:
          stats.failed++;
          break;
        case DeliveryStatus.PENDING:
          stats.pending++;
          break;
        case DeliveryStatus.RETRY:
          stats.retrying++;
          break;
      }

      if (delivery.response_status_code) {
        const code = delivery.response_status_code.toString();
        stats.status_codes[code] = (stats.status_codes[code] || 0) + 1;
      }

      if (delivery.response_time_ms) {
        totalResponseTime += delivery.response_time_ms;
        responseCount++;
      }
    });

    if (responseCount > 0) {
      stats.avg_response_time = Math.round(totalResponseTime / responseCount);
    }

    return stats;
  }
}

export default new WebhookService();