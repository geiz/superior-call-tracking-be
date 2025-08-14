// backend/src/controllers/InvitationController.ts
import { Request, Response } from 'express';
import { User, Company, UserInvitation, UserCompany } from '../models';
import { UserRole } from '../types/enums';
import { InvitationStatus } from '../models/UserInvitation';
import { AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';
import MailjetService from '../services/MailjetService';

interface InviteUserRequest extends AuthRequest {
  body: {
    email: string;
    first_name: string;
    last_name: string;
    password: string;
    role: UserRole;
    company_ids: number[];
    default_company_id: number;
    phone?: string;
    personal_note?: string;
    send_email?: boolean;
  };
}

export class InvitationController {
  /**
   * Create and send invitation
   */
 async inviteUser(req: InviteUserRequest, res: Response): Promise<void> {
  try {
    const {
      email,
      first_name,
      last_name,
      password,
      role,
      phone,
      company_ids, // Array of company IDs to grant access to
      default_company_id // Which company should be default
    } = req.body;

    // Check if user already exists
    let user = await User.findOne({ where: { email } });

    if (!user) {
      // Create new user
      user = await User.create({
        uuid: uuidv4(),
        account_id: req.user!.account_id,
        email,
        password_hash: password,
        first_name,
        last_name,
        phone,
        is_active: true
      } as any);
    }

    // Add user to companies
    const companyIds = company_ids || [req.user!.company_id];
    
    for (const companyId of companyIds) {
      const company = await Company.findOne({
        where: {
          id: companyId,
          account_id: req.user!.account_id
        }
      });

      if (!company) continue;

      // Check if user already has access
      const existing = await UserCompany.findOne({
        where: {
          user_id: user.id,
          company_id: companyId
        }
      });

      if (existing) {
        // Update role if needed
        await existing.update({ 
          role,
          is_active: true,
          is_default: companyId === (default_company_id || companyIds[0])
        });
      } else {
        // Add new access
        await UserCompany.create({
          user_id: user.id,
          company_id: companyId,
          role,
          is_default: companyId === (default_company_id || companyIds[0]),
          invited_by: req.user!.id
        } as any);
      }
    }

    // Send invitation email...
    
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        companies: companyIds
      },
      message: 'User invited successfully'
    });
  } catch (error) {
    console.error('Error inviting user:', error);
    res.status(500).json({ error: 'Failed to invite user' });
  }
}
  /**
   * Get all invitations
   */
  async getInvitations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { status, page = 1, limit = 50 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      const where: any = {
        company_id: req.user!.company_id
      };

      if (status) {
        where.status = status;
      }

      const { count, rows: invitations } = await UserInvitation.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'inviter',
            attributes: ['id', 'email', 'first_name', 'last_name']
          },
          {
            model: User,
            as: 'acceptedByUser',
            attributes: ['id', 'email', 'first_name', 'last_name'],
            required: false
          }
        ],
        limit: Number(limit),
        offset,
        order: [['created_at', 'DESC']]
      });

      // Separate pending and accepted invitations
      const pending = invitations.filter(inv => inv.status === InvitationStatus.PENDING);
      const accepted = invitations.filter(inv => inv.status === InvitationStatus.ACCEPTED);
      const expired = invitations.filter(inv => inv.status === InvitationStatus.EXPIRED || 
                                                (inv.status === InvitationStatus.PENDING && inv.isExpired()));
      const cancelled = invitations.filter(inv => inv.status === InvitationStatus.CANCELLED);

      res.json({
        invitations: {
          all: invitations,
          pending,
          accepted,
          expired,
          cancelled
        },
        pagination: {
          total: count,
          pages: Math.ceil(count / Number(limit)),
          current_page: Number(page),
          per_page: Number(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching invitations:', error);
      res.status(500).json({ error: 'Failed to fetch invitations' });
    }
  }

  /**
   * Accept invitation and activate user
   */
  async acceptInvitation(req: Request, res: Response): Promise<void> {
    try {
      const { uuid } = req.params;
      const { email, password } = req.body;

      const invitation = await UserInvitation.findOne({
        where: { uuid },
        include: [Company]
      });

      if (!invitation) {
        res.status(404).json({ error: 'Invitation not found' });
        return;
      }

      if (!invitation.canBeAccepted()) {
        res.status(400).json({ 
          error: invitation.isExpired() ? 'Invitation has expired' : 'Invitation is no longer valid' 
        });
        return;
      }

      // Verify credentials
      if (invitation.email !== email) {
        res.status(400).json({ error: 'Email does not match invitation' });
        return;
      }

      const validPassword = await bcrypt.compare(password, invitation.temp_password);
      if (!validPassword) {
        res.status(400).json({ error: 'Invalid password' });
        return;
      }

      // Find and activate the user
      const user = await User.findOne({
        where: { 
          id: invitation.user_id,
          email: invitation.email 
        }
      });

      if (!user) {
        res.status(404).json({ error: 'User account not found' });
        return;
      }

      // Activate the user account
      await user.update({
        is_active: true,
        last_login: new Date()
      });

      // Update invitation status
      await invitation.update({
        status: InvitationStatus.ACCEPTED,
        accepted_by: user.id,
        accepted_at: new Date()
      });

      res.json({
        message: 'Invitation accepted successfully',
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(500).json({ error: 'Failed to accept invitation' });
    }
  }

  /**
   * Cancel invitation
   */
  async cancelInvitation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const invitation = await UserInvitation.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!invitation) {
        res.status(404).json({ error: 'Invitation not found' });
        return;
      }

      if (invitation.status !== InvitationStatus.PENDING) {
        res.status(400).json({ error: 'Only pending invitations can be cancelled' });
        return;
      }

      await invitation.update({
        status: InvitationStatus.CANCELLED
      });

      res.json({ message: 'Invitation cancelled successfully' });
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      res.status(500).json({ error: 'Failed to cancel invitation' });
    }
  }

  /**
   * Resend invitation email
   */
  async resendInvitation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { new_password } = req.body;

      const invitation = await UserInvitation.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!invitation) {
        res.status(404).json({ error: 'Invitation not found' });
        return;
      }

      if (invitation.status !== InvitationStatus.PENDING) {
        res.status(400).json({ error: 'Can only resend pending invitations' });
        return;
      }

      // Update password if provided
      let password = new_password;
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await invitation.update({ temp_password: hashedPassword });
      } else {
        // Generate new password for resend
        password = this.generateTempPassword();
        const hashedPassword = await bcrypt.hash(password, 10);
        await invitation.update({ temp_password: hashedPassword });
      }

      // Extend expiration
      await invitation.update({
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        email_send_attempts: invitation.email_send_attempts + 1
      });

      // Resend email
      await this.sendInvitationEmail(invitation, password, req.user!);
      
      await invitation.update({
        email_sent: true,
        email_sent_at: new Date()
      });

      res.json({ 
        message: 'Invitation resent successfully',
        new_password: password 
      });
    } catch (error) {
      console.error('Error resending invitation:', error);
      res.status(500).json({ error: 'Failed to resend invitation' });
    }
  }

  /**
   * Get invitation statistics
   */
  async getInvitationStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const total = await UserInvitation.count({
        where: { company_id: req.user!.company_id }
      });

      const pending = await UserInvitation.count({
        where: {
          company_id: req.user!.company_id,
          status: InvitationStatus.PENDING,
          expires_at: { [Op.gt]: new Date() }
        }
      });

      const accepted = await UserInvitation.count({
        where: {
          company_id: req.user!.company_id,
          status: InvitationStatus.ACCEPTED
        }
      });

      const expired = await UserInvitation.count({
        where: {
          company_id: req.user!.company_id,
          [Op.or]: [
            { status: InvitationStatus.EXPIRED },
            {
              status: InvitationStatus.PENDING,
              expires_at: { [Op.lte]: new Date() }
            }
          ]
        }
      });

      res.json({
        total,
        pending,
        accepted,
        expired,
        acceptance_rate: total > 0 ? (accepted / total * 100).toFixed(2) + '%' : '0%'
      });
    } catch (error) {
      console.error('Error fetching invitation stats:', error);
      res.status(500).json({ error: 'Failed to fetch invitation statistics' });
    }
  }

  // Helper methods
  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private async sendInvitationEmail(invitation: UserInvitation, password: string, inviter: any): Promise<void> {
    try {
      const company = await Company.findByPk(invitation.company_id);
      
      await MailjetService.sendEmail({
        to: invitation.email,
        toName: `${invitation.first_name} ${invitation.last_name}`,
        subject: `You've been invited to join ${company?.name || 'CallRail Clone'}`,
        textContent: `
          Hi ${invitation.first_name},

          ${inviter.first_name} ${inviter.last_name} has invited you to join ${company?.name || 'CallRail Clone'} as a ${invitation.role}.

          Your login credentials:
          Email: ${invitation.email}
          Password: ${password}

          Please log in at: ${process.env.FRONTEND_URL}/login

          This invitation will expire in 7 days.

          Best regards,
          The ${company?.name || 'CallRail Clone'} Team
        `,
        htmlContent: `
          <h2>Welcome to ${company?.name || 'CallRail Clone'}!</h2>
          <p>Hi ${invitation.first_name},</p>
          <p>${inviter.first_name} ${inviter.last_name} has invited you to join <strong>${company?.name || 'CallRail Clone'}</strong> as a <strong>${invitation.role}</strong>.</p>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Your Login Credentials:</h3>
            <p><strong>Email:</strong> ${invitation.email}<br>
            <strong>Password:</strong> ${password}</p>
          </div>
          
          <p><a href="${process.env.FRONTEND_URL}/login" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Login Now</a></p>
          
          <p><em>This invitation will expire in 7 days.</em></p>
          
          <p>Best regards,<br>
          The ${company?.name || 'CallRail Clone'} Team</p>
        `
      });
    } catch (error) {
      console.error('Failed to send invitation email:', error);
      throw error;
    }
  }
}

const controller = new InvitationController();

export default {
  inviteUser: controller.inviteUser.bind(controller),
  getInvitations: controller.getInvitations.bind(controller),
  acceptInvitation: controller.acceptInvitation.bind(controller),
  cancelInvitation: controller.cancelInvitation.bind(controller),
  resendInvitation: controller.resendInvitation.bind(controller),
  getInvitationStats: controller.getInvitationStats.bind(controller)
};