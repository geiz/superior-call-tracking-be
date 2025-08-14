// backend/src/controllers/AuthController.ts
import { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User';
import Account from '../models/Account';
import Company from '../models/Company';
import Tag from '../models/Tag';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../types/enums';
import AgentSessionService from '../services/AgentSessionService';
import MailjetService from '../services/MailjetService';
import { signToken } from '../config/jwt';


interface RegisterRequest extends Request {
  body: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    company_name: string;
    phone?: string;
    plan_type?: 'starter' | 'professional' | 'enterprise';
  };
}

interface LoginRequest extends Request {
  body: {
    email: string;
    password: string;
    remember_me?: boolean;
  };
}
class AuthController {
  /**
   * User login
   */
// Update login to handle account-level admins
async login(req: LoginRequest, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    // First check if it's an account-level login
    const account = await Account.findOne({ 
      where: { email },
      include: [Company]
    });

    if (account && await account.validatePassword(password)) {
      // Account-level admin login
      const selectedCompanyId = account.companies?.[0]?.id || null;
      
      const token = signToken({
        id: account.id,
        email: account.email,
        role: UserRole.ADMIN,
        account_id: account.id,
        company_id: selectedCompanyId
      });

      res.json({
        token,
        account: {
          id: account.id,
          email: account.email,
          first_name: account.first_name,
          last_name: account.last_name,
          role: UserRole.ADMIN,
          companies: account.companies
        }
      });
      return;
    }

    // Then check company-level users
    const user = await User.findOne({ 
      where: { email },
      include: [Company]
    });

    if (!user || !await user.validatePassword(password)) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Company-level user login
    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      account_id: user.account_id,
      company_id: user.company_id,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        company: user.company
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

  /**
   * User registration with email notification
   */
  async register(req: RegisterRequest, res: Response): Promise<void> {
  try {
    const { email, password, first_name, last_name, phone } = req.body;

    // Check if account exists
    const existingAccount = await Account.findOne({ where: { email } });
    if (existingAccount) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Create account (admin level)
    const account = await Account.create({
      uuid: uuidv4(),
      email,
      password_hash: password, // Will be hashed in BeforeCreate hook
      first_name,
      last_name,
      phone,
      plan_type: 'trial',
      subscription_status: 'trialing',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      is_active: true
    } as any);

      // No company or user created at this point
    // Admin will create companies after login

    const token = signToken({
      id: account.id,
      email: account.email,
      role: UserRole.ADMIN,
      account_id: account.id,
      company_id: null // No company yet
    });

    res.status(201).json({
      token,
      account: {
        id: account.id,
        email: account.email,
        first_name: account.first_name,
        last_name: account.last_name,
        plan_type: account.plan_type,
        trial_ends_at: account.trial_ends_at
      },
      message: 'Account created successfully. Please create a company to get started.'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

  /**
   * Send welcome email with account details
   */
  private async sendWelcomeEmail(params: {
    user: User;
    company: Company;
    password: string;
    isNewAccount: boolean;
  }): Promise<void> {
    const { user, company, password, isNewAccount } = params;

    try {
      const subject = isNewAccount 
        ? `Welcome to CallRail Clone - Account Created`
        : `Your CallRail Clone Account Details`;

      const textContent = `
Hi ${user.first_name}!

Welcome to CallRail Clone! Your account has been successfully created.

Company: ${company.name}

Your Login Credentials:
------------------------
Email: ${user.email}
Password: ${password}

You can log in at: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login

Best regards,
The CallRail Clone Team
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to CallRail Clone!</h1>
    </div>
    <div class="content">
      <h2>Hi ${user.first_name}! 👋</h2>
      <p>Your account has been successfully created.</p>
      <p><strong>Email:</strong> ${user.email}<br>
      <strong>Password:</strong> ${password}</p>
    </div>
  </div>
</body>
</html>
      `.trim();

      await MailjetService.sendEmail({
        to: user.email,
        toName: `${user.first_name} ${user.last_name}`,
        subject,
        textContent,
        htmlContent,
        from: process.env.MAILJET_FROM_EMAIL || 'noreply@callrail-clone.com',
        fromName: process.env.MAILJET_FROM_NAME || 'CallRail Clone'
      });

      console.log(`✅ Welcome email sent to ${user.email}`);
    } catch (error) {
      console.error('❌ Failed to send welcome email:', error);
      throw error;
    }
  }

  /**
   * Logout
   */
  async logout(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (req.user && req.user.session_id) {
        await AgentSessionService.endSession(req.user.session_id);
      }

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }

  /**
   * Get current user
   */
  async me(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = await User.findByPk(req.user!.id, {
        attributes: { exclude: ['password_hash'] },
        include: [Company]
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(user);
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user data' });
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Use the jwt config function for consistency
      const newToken = signToken({
        id: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
        company_id: req.user!.company_id,
        session_id: req.user!.session_id
      });

      res.json({ token: newToken });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  }

  async changePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { current_password, new_password } = req.body;

      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const user = await User.findByPk(req.user.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Verify current password
      if (!(await user.validatePassword(current_password))) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }

      // Set new password
      await user.setPassword(new_password);
      await user.save();

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      const user = await User.findOne({ where: { email } });
      if (!user) {
        // Don't reveal if email exists
        res.json({ message: 'If the email exists, a reset link has been sent' });
        return;
      }

      // TODO: Implement email sending with reset token
      // For now, just log it
      const resetToken = uuidv4();
      console.log(`Password reset token for ${email}: ${resetToken}`);

      res.json({ message: 'If the email exists, a reset link has been sent' });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, new_password } = req.body;

      // TODO: Implement token validation and password reset
      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
}

export default new AuthController();