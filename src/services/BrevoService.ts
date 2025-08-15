// backend/src/services/BrevoService.ts
import axios from 'axios';

/** ---------- High-level email DTOs for convenience flows ---------- */
interface BaseEmailData {
  to: string;
  toName?: string;
}

interface WelcomeEmailData extends BaseEmailData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName?: string;
}

interface InvitationEmailData extends BaseEmailData {
  companyName: string;
  role: string;
  email: string;
  password: string;
  to: string;
  toName: string;
}

interface PasswordResetEmailData extends BaseEmailData {
  firstName: string;
  tempPassword: string;
}

/** ---------- Generic email DTOs ---------- */
interface EmailData {
  to: string; // email
  toName?: string;
  subject: string;
  textContent?: string;
  htmlContent?: string;
  from?: string; // email
  fromName?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    contentType: string;
    filename: string;
    base64Content: string;
  }>;
  headers?: Record<string, string>;
  tags?: string[];
  companyName?: string;
  role?: string;
  password?: string;
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
    content: string; // base64
    name: string;    // filename
  }>;
  headers?: Record<string, string>;
  tags?: string[];
}

class BrevoService {
  private apiKey: string;
  private apiUrl: string = 'https://api.brevo.com/v3';
  private enabled: boolean;
  private defaultSender: { email: string; name: string };
  private frontendUrl: string;

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || '';
    this.enabled = !!this.apiKey;

    this.defaultSender = {
      email: process.env.BREVO_FROM_EMAIL || 'noreply@superiorplumbing.ca',
      name: process.env.BREVO_FROM_NAME || 'Superior Call Tracking',
    };

    this.frontendUrl = process.env.FRONTEND_URL || 'https://superior-call-track.web.app';

    if (this.enabled) {
      console.log('✅ Brevo email service configured');
    } else {
      console.warn('⚠️  Brevo not configured. Emails will not be sent.');
      console.warn('Please set BREVO_API_KEY in your environment variables');
    }
  }

  /** ===================== Convenience flows ===================== */

  /** Send account creation welcome email */
  async sendWelcomeEmail(data: WelcomeEmailData): Promise<any> {
    const subject = 'Welcome to Superior Call Tracking - Account Created';

    const textContent = `
Hi ${data.firstName}!

Welcome to Superior Call Tracking! Your account has been successfully created.

Your Login Credentials:
------------------------
Email: ${data.email}
Password: ${data.password}

You can log in at: ${this.frontendUrl}/login

Next steps:
1. Log in to your account
2. Create your first company
3. Set up tracking numbers
4. Start tracking calls!

Best regards,
The Superior Call Tracking Team
    `.trim();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
    .credentials { background: #fff; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .button { background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
    .steps { margin: 20px 0; padding-left: 20px; }
    .steps li { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Superior Call Tracking!</h1>
    </div>
    <div class="content">
      <h2>Hi ${data.firstName}! 👋</h2>
      <p>Your account has been successfully created. You're now ready to start tracking calls and optimizing your marketing!</p>

      <div class="credentials">
        <h3>Your Login Credentials:</h3>
        <p><strong>Email:</strong> ${data.email}<br>
        <strong>Password:</strong> ${data.password}</p>
      </div>

      <h3>Next Steps:</h3>
      <ol class="steps">
        <li>Log in to your account</li>
        <li>Create your first company</li>
        <li>Set up tracking numbers</li>
        <li>Start tracking calls!</li>
      </ol>

      <a href="${this.frontendUrl}/login" class="button">Login to Your Account</a>
    </div>
  </div>
</body>
</html>
    `.trim();

    return this.sendEmail({
      to: data.to,
      toName: `${data.firstName} ${data.lastName}`,
      subject,
      textContent,
      htmlContent,
      tags: ['welcome'],
    });
  }

  /** Send user invitation email */
  async sendInvitationEmail(data: InvitationEmailData): Promise<any> {
    const subject = `You've been invited to join ${data.companyName}`;

    const textContent = `
Hi ${data.toName},

You have been invited you to join ${data.companyName} as a ${data.role}.

Your login credentials:
Email: ${data.email}
Password: ${data.password}

Please log in at: ${this.frontendUrl}/login

This invitation will expire in 7 days.

Best regards,
The ${data.companyName} Team
    `.trim();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
    .credentials { background: #fff; padding: 20px; border-radius: 5px; margin: 20px 0; border: 2px solid #4F46E5; }
    .button { background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
    .warning { color: #dc2626; font-style: italic; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>You're Invited!</h1>
    </div>
    <div class="content">
      <h2>Hi ${data.toName}!</h2>
      <p><strong>You have been invited to join <strong>${data.companyName}</strong> as a <strong>${data.role}</strong>.</p>

      <div class="credentials">
        <h3>Your Login Credentials:</h3>
        <p>
          <strong>Email:</strong> ${data.email}<br>
          <strong>Password:</strong> ${data.password}
        </p>
      </div>

      <p class="warning">⏰ This invitation will expire in 7 days.</p>

      <a href="${this.frontendUrl}/login" class="button">Accept Invitation & Login</a>
    </div>
  </div>
</body>
</html>
    `.trim();

    return this.sendEmail({
      to: data.to,
      toName: `${data.toName}`,
      subject,
      textContent,
      htmlContent,
      tags: ['invitation'],
    });
  }

  /** Send password reset email */
  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<any> {
    const subject = 'Your Password Has Been Reset';

    const textContent = `
Hi ${data.firstName},

Your password has been reset. Here is your new temporary password:

Temporary Password: ${data.tempPassword}

Please log in and change your password as soon as possible.

Login at: ${this.frontendUrl}/login

If you didn't request this password reset, please contact support immediately.

Best regards,
The Superior Call Tracking Team
    `.trim();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
    .password-box { background: #fff; padding: 20px; border-radius: 5px; margin: 20px 0; border: 2px solid #dc2626; }
    .button { background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
    .warning { background: #fef2f2; border: 1px solid #dc2626; padding: 15px; border-radius: 5px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset</h1>
    </div>
    <div class="content">
      <h2>Hi ${data.firstName},</h2>
      <p>Your password has been reset. Here is your new temporary password:</p>

      <div class="password-box">
        <h3>Temporary Password:</h3>
        <p style="font-size: 18px; font-weight: bold; color: #4F46E5;">${data.tempPassword}</p>
      </div>

      <p><strong>Please log in and change your password as soon as possible.</strong></p>

      <a href="${this.frontendUrl}/login" class="button">Login Now</a>

      <div class="warning">
        <p>⚠️ <strong>Security Notice:</strong> If you didn't request this password reset, please contact support immediately.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();

    return this.sendEmail({
      to: data.to,
      toName: data.firstName,
      subject,
      textContent,
      htmlContent,
      tags: ['password-reset'],
    });
  }

  /** ===================== Generic capabilities ===================== */

  /** Send a single email using Brevo API */
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
          name: data.fromName || this.defaultSender.name,
        },
        to: [{ email: data.to, name: data.toName || data.to }],
        subject: data.subject,
        textContent: data.textContent,
        htmlContent: data.htmlContent,
        headers: data.headers,
        tags: data.tags,
      };

      if (data.replyTo) payload.replyTo = { email: data.replyTo };
      if (data.cc?.length) payload.cc = data.cc.map((email) => ({ email }));
      if (data.bcc?.length) payload.bcc = data.bcc.map((email) => ({ email }));
      if (data.attachments?.length) {
        payload.attachment = data.attachments.map((att) => ({
          content: att.base64Content,
          name: att.filename,
        }));
      }

      const response = await axios.post(`${this.apiUrl}/smtp/email`, payload, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      console.log('✅ Email sent successfully to:', data.to);
      console.log('Brevo Message ID:', response.data.messageId);

      return {
        success: true,
        messageId: response.data.messageId,
        ...response.data,
      };
    } catch (error: any) {
      console.error('❌ Failed to send email via Brevo:', error.response?.data || error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  /** Send bulk emails (simple parallel, or swap to Brevo batch endpoint later) */
  async sendBulkEmails(emails: EmailData[]): Promise<any> {
    if (!this.enabled) {
      console.log('📧 Bulk emails would be sent:', emails.length);
      return { mock: true, success: true };
    }

    const results = await Promise.allSettled(emails.map((e) => this.sendEmail(e)));
    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - successful;

    console.log(`✅ Bulk email results: ${successful} sent, ${failed} failed`);
    return { success: failed === 0, sent: successful, failed, results };
  }

  /** Transactional SMS */
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
          tag: tag || 'notification',
        },
        { headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' } }
      );

      console.log('✅ SMS sent successfully to:', to);
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to send SMS:', error.response?.data || error.message);
      throw error;
    }
  }

  /** Create or update a contact */
  async createOrUpdateContact(email: string, attributes?: Record<string, any>, listIds?: number[]): Promise<any> {
    if (!this.enabled) {
      console.log('👤 Contact would be created/updated:', email);
      return { mock: true, email };
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/contacts`,
        { email, attributes, listIds, updateEnabled: true },
        { headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' } }
      );

      console.log('✅ Contact created/updated:', email);
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to create/update contact:', error.response?.data || error.message);
      throw error;
    }
  }

  /** Get SMTP event stats */
  async getEmailStats(limit: number = 50, offset: number = 0): Promise<any> {
    if (!this.enabled) return { mock: true, stats: {} };

    try {
      const response = await axios.get(`${this.apiUrl}/smtp/statistics/events`, {
        params: { limit, offset },
        headers: { 'api-key': this.apiKey },
      });
      return response.data;
    } catch (error: any) {
      console.error('Failed to get email stats:', error.response?.data || error.message);
      throw error;
    }
  }

  /** Basic email validation (format only) */
  async validateEmail(email: string): Promise<boolean> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /** Send a template email (Brevo SMTP API supports templateId use) */
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
        { templateId, to: [{ email: to }], params: params || {} },
        { headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' } }
      );

      console.log('✅ Template email sent successfully to:', to);
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to send template email:', error.response?.data || error.message);
      throw error;
    }
  }

  /** Health checks */
  isConfigured(): boolean {
    return this.enabled;
  }

  async testConnection(): Promise<boolean> {
    if (!this.enabled) {
      console.log('⚠️ Brevo not configured for testing');
      return false;
    }

    try {
      const response = await axios.get(`${this.apiUrl}/account`, {
        headers: { 'api-key': this.apiKey },
      });
      console.log('✅ Brevo connection test successful');
      console.log('Account email:', response.data.email);
      console.log('Account plan:', response.data.plan);
      return true;
    } catch (error: any) {
      console.error('❌ Brevo connection test failed:', error.response?.data || error.message);
      return false;
    }
  }

  async getAccountInfo(): Promise<any> {
    if (!this.enabled) return { mock: true, message: 'Brevo not configured' };

    try {
      const response = await axios.get(`${this.apiUrl}/account`, {
        headers: { 'api-key': this.apiKey },
      });
      return response.data;
    } catch (error: any) {
      console.error('Failed to get account info:', error.response?.data || error.message);
      throw error;
    }
  }
}

// Export singleton instance
export default new BrevoService();
