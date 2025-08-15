// backend/src/services/BrevoService.ts
import axios from 'axios';

interface EmailData {
  to: string;
  toName?: string;
  subject: string;
  textContent?: string;
  htmlContent?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    contentType: string;
    filename: string;
    base64Content: string;
  }>;
}

interface BrevoEmailPayload {
  sender: {
    email: string;
    name?: string;
  };
  to: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  textContent?: string;
  htmlContent?: string;
  replyTo?: {
    email: string;
    name?: string;
  };
  cc?: Array<{
    email: string;
    name?: string;
  }>;
  bcc?: Array<{
    email: string;
    name?: string;
  }>;
  attachment?: Array<{
    content: string;
    name: string;
  }>;
  headers?: Record<string, string>;
  tags?: string[];
}

class BrevoService {
  private apiKey: string;
  private apiUrl: string = 'https://api.brevo.com/v3';
  private enabled: boolean;
  private defaultSender: { email: string; name: string };

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || '';
    this.enabled = !!this.apiKey;
    
    this.defaultSender = {
      email: process.env.BREVO_FROM_EMAIL || 'noreply@superiorplumbing.ca',
      name: process.env.BREVO_FROM_NAME || 'Superior Call Tracking'
    };
    
    if (this.enabled) {
      console.log('✅ Brevo email service configured');
    } else {
      console.warn('⚠️  Brevo not configured. Emails will not be sent.');
      console.warn('Please set BREVO_API_KEY in your environment variables');
    }
  }

  /**
   * Send a single email using Brevo API
   */
  async sendEmail(data: EmailData): Promise<any> {
    if (!this.enabled) {
      console.log('📧 Email would be sent to:', data.to);
      console.log('Subject:', data.subject);
      console.log('Content:', data.textContent || data.htmlContent);
      return { mock: true, success: true };
    }

    try {
      const payload: BrevoEmailPayload = {
        sender: {
          email: data.from || this.defaultSender.email,
          name: data.fromName || this.defaultSender.name
        },
        to: [{
          email: data.to,
          name: data.toName || data.to
        }],
        subject: data.subject,
        textContent: data.textContent,
        htmlContent: data.htmlContent
      };

      // Add optional fields
      if (data.replyTo) {
        payload.replyTo = { email: data.replyTo };
      }

      if (data.cc && data.cc.length > 0) {
        payload.cc = data.cc.map(email => ({ email }));
      }

      if (data.bcc && data.bcc.length > 0) {
        payload.bcc = data.bcc.map(email => ({ email }));
      }

      if (data.attachments && data.attachments.length > 0) {
        payload.attachment = data.attachments.map(att => ({
          content: att.base64Content,
          name: att.filename
        }));
      }

      const response = await axios.post(
        `${this.apiUrl}/smtp/email`,
        payload,
        {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      console.log('✅ Email sent successfully to:', data.to);
      console.log('Brevo Message ID:', response.data.messageId);
      
      return {
        success: true,
        messageId: response.data.messageId,
        ...response.data
      };
    } catch (error: any) {
      console.error('❌ Failed to send email via Brevo:', error.response?.data || error.message);
      
      // Log more detailed error information
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      throw error;
    }
  }

  /**
   * Send bulk emails using Brevo API
   */
  async sendBulkEmails(emails: EmailData[]): Promise<any> {
    if (!this.enabled) {
      console.log('📧 Bulk emails would be sent:', emails.length);
      return { mock: true, success: true };
    }

    try {
      // Brevo supports bulk sending through their batch endpoint
      // For simplicity, we'll send them individually in parallel
      const promises = emails.map(emailData => this.sendEmail(emailData));
      
      const results = await Promise.allSettled(promises);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`✅ Bulk email results: ${successful} sent, ${failed} failed`);
      
      return {
        success: true,
        sent: successful,
        failed: failed,
        results: results
      };
    } catch (error: any) {
      console.error('❌ Failed to send bulk emails:', error.message);
      throw error;
    }
  }

  /**
   * Send transactional SMS (Brevo supports SMS)
   */
  async sendSMS(to: string, message: string, tag?: string): Promise<any> {
    if (!this.enabled) {
      console.log('📱 SMS would be sent to:', to);
      console.log('Message:', message);
      return { mock: true, to, message };
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/transactionalSMS/sms`,
        {
          sender: process.env.BREVO_SMS_SENDER || 'SCT',
          recipient: to,
          content: message,
          tag: tag || 'notification'
        },
        {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ SMS sent successfully to:', to);
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to send SMS:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create or update a contact in Brevo
   */
  async createOrUpdateContact(email: string, attributes?: Record<string, any>, listIds?: number[]): Promise<any> {
    if (!this.enabled) {
      console.log('👤 Contact would be created/updated:', email);
      return { mock: true, email };
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/contacts`,
        {
          email,
          attributes,
          listIds,
          updateEnabled: true
        },
        {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Contact created/updated:', email);
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to create/update contact:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get email campaign statistics
   */
  async getEmailStats(limit: number = 50, offset: number = 0): Promise<any> {
    if (!this.enabled) {
      return { mock: true, stats: {} };
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/smtp/statistics/events`,
        {
          params: {
            limit,
            offset
          },
          headers: {
            'api-key': this.apiKey
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Failed to get email stats:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Validate email address (basic validation)
   */
  async validateEmail(email: string): Promise<boolean> {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(email)) {
      return false;
    }

    // If Brevo is enabled, we could use their validation API
    // For now, just return true if basic validation passes
    return true;
  }

  /**
   * Send a transactional email using a template
   */
  async sendTemplateEmail(templateId: number, to: string, params?: Record<string, any>): Promise<any> {
    if (!this.enabled) {
      console.log('📧 Template email would be sent to:', to);
      console.log('Template ID:', templateId);
      console.log('Parameters:', params);
      return { mock: true, success: true };
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/smtp/email`,
        {
          templateId,
          to: [{ email: to }],
          params: params || {}
        },
        {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Template email sent successfully to:', to);
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to send template email:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Check if the service is configured
   */
  isConfigured(): boolean {
    return this.enabled;
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.enabled) {
      console.log('⚠️ Brevo not configured for testing');
      return false;
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/account`,
        {
          headers: {
            'api-key': this.apiKey
          }
        }
      );

      console.log('✅ Brevo connection test successful');
      console.log('Account email:', response.data.email);
      console.log('Account plan:', response.data.plan);
      
      return true;
    } catch (error: any) {
      console.error('❌ Brevo connection test failed:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<any> {
    if (!this.enabled) {
      return { mock: true, message: 'Brevo not configured' };
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/account`,
        {
          headers: {
            'api-key': this.apiKey
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Failed to get account info:', error.response?.data || error.message);
      throw error;
    }
  }
}

// Export singleton instance
export default new BrevoService();