import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Company, Account, User, Tag } from '../models';
import { CompanyStatus, UserRole } from '../types/enums';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../config/redis';  // Add this line
import bcrypt from 'bcryptjs';

class CompanyController {
  async createCompany(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { company_name } = req.body;
      const accountId = req.user!.account_id || req.user!.id; // Fallback to user id for backward compatability

      const subdomain = company_name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const company = await Company.create({
        account_id: accountId,
        name: company_name,
        subdomain: `${subdomain}-${Date.now()}`,
        sip_domain: `${subdomain}.pbx.crc.com`,
        status: CompanyStatus.TRIAL,
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      } as any);

      // Create admin user for this company
      const account = await Account.findByPk(accountId);
      const user = await User.create({
        account_id: accountId,
        company_id: company.id,
        email: account!.email,
        password_hash: account!.password_hash,
        first_name: account!.first_name,
        last_name: account!.last_name,
        role: UserRole.ADMIN
      } as any);

      // Create default tags
      const defaultTags = [
        { name: 'new', color: '#10B981', description: 'First time Contact' },
        { name: 'customer', color: '#3B82F6', description: 'Existing customer' },
        { name: 'quote', color: '#6366F1', description: 'Quote inquiry' }
      ];

      for (const tag of defaultTags) {
        await Tag.create({
          ...tag,
          company_id: company.id,
          created_by: user.id
        } as any);
      }

      res.status(201).json({ company, user });
    } catch (error) {
      console.error('Company creation error:', error);
      res.status(500).json({ error: 'Failed to create company' });
    }
  }

  // Add to CompanyController class:
  async inviteUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { email, role = UserRole.USER } = req.body;
      const companyId = req.user!.company_id;

      // Check if user is admin/manager
      if (req.user!.role !== UserRole.ADMIN && req.user!.role !== UserRole.MANAGER) {
        res.status(403).json({ error: 'Only admins and managers can invite users' });
        return;
      }

      // Check if account exists
      let account = await Account.findOne({ where: { email } });

      // Check if user already has access to this company
      if (account) {
        const existingUser = await User.findOne({
          where: { account_id: account.id, company_id: companyId }
        });

        if (existingUser) {
          res.status(400).json({ error: 'User already has access to this company' });
          return;
        }
      }

      const company = await Company.findByPk(companyId);
      const inviteToken = uuidv4();

      // Store invitation in cache/database
      await redisClient.setEx(
        `invite:${inviteToken}`,
        7 * 24 * 60 * 60, // 7 days
        JSON.stringify({
          email,
          company_id: companyId,
          company_name: company!.name,
          role,
          invited_by: req.user!.id,
          created_at: new Date()
        })
      );

      // TODO: Send email with invitation link
      console.log(`Invitation link: ${process.env.FRONTEND_URL}/invite/${inviteToken}`);

      res.json({
        message: 'Invitation sent',
        invite_token: inviteToken // Remove in production
      });
    } catch (error) {
      console.error('Invitation error:', error);
      res.status(500).json({ error: 'Failed to send invitation' });
    }
  }

  async acceptInvitation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { invite_token, password, first_name, last_name } = req.body;

      // Get invitation details
      const inviteData = await redisClient.get(`invite:${invite_token}`);
      if (!inviteData) {
        res.status(400).json({ error: 'Invalid or expired invitation' });
        return;
      }

      const invite = JSON.parse(inviteData);

      // Find or create account
      let account = await Account.findOne({ where: { email: invite.email } });

      if (!account) {
        // Create new account
        account = await Account.create({
          email: invite.email,
          password_hash: await bcrypt.hash(password, 10),
          first_name,
          last_name
        } as any);
      }

      // Create user for the company
      const user = await User.create({
        account_id: account.id,
        company_id: invite.company_id,
        email: invite.email,
        password_hash: account.password_hash,
        first_name: account.first_name,
        last_name: account.last_name,
        role: invite.role
      } as any);

      // Delete invitation
      await redisClient.del(`invite:${invite_token}`);

      res.json({
        message: 'Invitation accepted',
        company_name: invite.company_name
      });
    } catch (error) {
      console.error('Accept invitation error:', error);
      res.status(500).json({ error: 'Failed to accept invitation' });
    }
  }
}

export default new CompanyController();