// backend/src/services/MailjetService.ts
import Mailjet from 'node-mailjet';

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

class MailjetService {
  private client: any;
  private enabled: boolean;

  constructor() {
    this.enabled = !!(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY);
    
    if (this.enabled) {
      this.client = new Mailjet({
        apiKey: process.env.MAILJET_API_KEY,
        apiSecret: process.env.MAILJET_SECRET_KEY
      });
    } else {
      console.warn('⚠️  Mailjet not configured. Emails will not be sent.');
    }
  }

  async sendEmail(data: EmailData): Promise<any> {
    if (!this.enabled) {
      console.log('📧 Email would be sent to:', data.to);
      console.log('Subject:', data.subject);
      console.log('Content:', data.textContent || data.htmlContent);
      return { mock: true, success: true };
    }

    try {
      const request = this.client
        .post('send', { version: 'v3.1' })
        .request({
          Messages: [
            {
              From: {
                Email: data.from || process.env.MAILJET_FROM_EMAIL || 'noreply@superiorplumbing.ca',
                Name: data.fromName || process.env.MAILJET_FROM_NAME || 'CallRail Clone'
              },
              To: [
                {
                  Email: data.to,
                  Name: data.toName || data.to
                }
              ],
              Subject: data.subject,
              TextPart: data.textContent,
              HTMLPart: data.htmlContent,
              ReplyTo: data.replyTo ? { Email: data.replyTo } : undefined,
              Cc: data.cc?.map(email => ({ Email: email })),
              Bcc: data.bcc?.map(email => ({ Email: email })),
              Attachments: data.attachments?.map(att => ({
                ContentType: att.contentType,
                Filename: att.filename,
                Base64Content: att.base64Content
              }))
            }
          ]
        });

      const result = await request;
      console.log('✅ Email sent successfully to:', data.to);
      return result.body;
    } catch (error: any) {
      console.error('❌ Failed to send email:', error.statusCode || error.message);
      throw error;
    }
  }

  async sendBulkEmails(emails: EmailData[]): Promise<any> {
    if (!this.enabled) {
      console.log('📧 Bulk emails would be sent:', emails.length);
      return { mock: true, success: true };
    }

    try {
      const messages = emails.map(data => ({
        From: {
          Email: data.from || process.env.MAILJET_FROM_EMAIL || 'noreply@callrail-clone.com',
          Name: data.fromName || process.env.MAILJET_FROM_NAME || 'CallRail Clone'
        },
        To: [
          {
            Email: data.to,
            Name: data.toName || data.to
          }
        ],
        Subject: data.subject,
        TextPart: data.textContent,
        HTMLPart: data.htmlContent
      }));

      const request = this.client
        .post('send', { version: 'v3.1' })
        .request({ Messages: messages });

      const result = await request;
      console.log(`✅ ${emails.length} emails sent successfully`);
      return result.body;
    } catch (error: any) {
      console.error('❌ Failed to send bulk emails:', error.statusCode || error.message);
      throw error;
    }
  }

  async sendSMS(to: string, message: string): Promise<any> {
    // Mailjet also supports SMS, but requires additional setup
    console.log('SMS feature not implemented yet');
    return { mock: true, to, message };
  }

  async getEmailStats(): Promise<any> {
    if (!this.enabled) {
      return { mock: true, stats: {} };
    }

    try {
      const request = this.client
        .get('statcounters')
        .request();

      return await request;
    } catch (error) {
      console.error('Failed to get email stats:', error);
      throw error;
    }
  }

  async validateEmail(email: string): Promise<boolean> {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isConfigured(): boolean {
    return this.enabled;
  }
}

export default new MailjetService();