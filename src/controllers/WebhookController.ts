import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Webhook, WebhookDelivery } from '../models';
import { WebhookStatus, WebhookEvent } from '../types/enums';
import WebhookService from '../services/WebhookService';
import crypto from 'crypto';

class WebhookController {
  async getWebhooks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const webhooks = await Webhook.findAll({
        where: { company_id: req.user!.company_id },
        order: [['created_at', 'DESC']]
      });

      res.json(webhooks);
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      res.status(500).json({ error: 'Failed to fetch webhooks' });
    }
  }

  async createWebhook(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        name,
        url,
        events,
        auth_type,
        auth_credentials,
        custom_headers
      } = req.body;

      // Validate URL
      const isValid = await WebhookService.validateWebhookUrl(url);
      if (!isValid) {
        res.status(400).json({ error: 'Invalid webhook URL' });
        return;
      }

      // Generate signing secret
      const signingSecret = crypto.randomBytes(32).toString('hex');

      const webhook = await Webhook.create({
        company_id: req.user!.company_id,
        name,
        url,
        events: events || Object.values(WebhookEvent),
        auth_type,
        auth_credentials,
        signing_secret: signingSecret,
        custom_headers: custom_headers || {},
        status: WebhookStatus.ACTIVE
      } as any);

      res.status(201).json({
        ...webhook.toJSON(),
        signing_secret: signingSecret // Only show on creation
      });
    } catch (error) {
      console.error('Error creating webhook:', error);
      res.status(500).json({ error: 'Failed to create webhook' });
    }
  }

  async updateWebhook(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const webhook = await Webhook.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      // Don't allow updating signing secret
      delete updates.signing_secret;

      // Validate new URL if provided
      if (updates.url && updates.url !== webhook.url) {
        const isValid = await WebhookService.validateWebhookUrl(updates.url);
        if (!isValid) {
          res.status(400).json({ error: 'Invalid webhook URL' });
          return;
        }
      }

      await webhook.update(updates);
      res.json(webhook);
    } catch (error) {
      console.error('Error updating webhook:', error);
      res.status(500).json({ error: 'Failed to update webhook' });
    }
  }

  async deleteWebhook(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const webhook = await Webhook.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      await webhook.destroy();
      res.json({ message: 'Webhook deleted successfully' });
    } catch (error) {
      console.error('Error deleting webhook:', error);
      res.status(500).json({ error: 'Failed to delete webhook' });
    }
  }

  async testWebhook(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const webhook = await Webhook.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      await WebhookService.testWebhook(webhook);
      res.json({ message: 'Test webhook sent' });
    } catch (error) {
      console.error('Error testing webhook:', error);
      res.status(500).json({ error: 'Failed to test webhook' });
    }
  }

  async getDeliveries(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { limit = 100 } = req.query;

      const webhook = await Webhook.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      const deliveries = await WebhookService.getDeliveryHistory(
        webhook.id,
        parseInt(limit as string)
      );

      const stats = await WebhookService.getWebhookStats(webhook.id);

      res.json({
        deliveries,
        stats
      });
    } catch (error) {
      console.error('Error fetching deliveries:', error);
      res.status(500).json({ error: 'Failed to fetch deliveries' });
    }
  }

  async retryDelivery(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { deliveryId } = req.params;

      const delivery = await WebhookDelivery.findByPk(parseInt(deliveryId), {
        include: [{
          model: Webhook,
          where: { company_id: req.user!.company_id }
        }]
      });

      if (!delivery) {
        res.status(404).json({ error: 'Delivery not found' });
        return;
      }

      await WebhookService.retryDelivery(delivery.id);
      res.json({ message: 'Retry queued' });
    } catch (error) {
      console.error('Error retrying delivery:', error);
      res.status(500).json({ error: 'Failed to retry delivery' });
    }
  }
}

export default new WebhookController();