import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Company, Account, User, Tag } from '../models';
import { CompanyStatus, UserRole } from '../types/enums';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../config/redis';  // Add this line
import bcrypt from 'bcryptjs';
import { signToken } from '../config/jwt';
import BrevoService from '../services/BrevoService';
import { generateRandomPassword } from "../utils/helpers";
import UserCompany from '../models/UserCompany'; // adjust path if needed

class CompanyController {
  async createCompany(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { company_name, subdomain } = req.body;

      // Only account-level admins can create companies
      if (req.user!.role !== UserRole.ADMIN) {
        res.status(403).json({ error: 'Only account admins can create companies' });
        return;
      }

      const account = await Account.findByPk(req.user!.account_id, {
        include: [Company]
      });

      if (!account) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }

      // Check company limit
      if (!account.canCreateCompany()) {
        res.status(400).json({
          error: 'Company limit reached',
          limit: account.max_companies,
          current: account.companies?.length || 0
        });
        return;
      }

      const company = await Company.create({
        account_id: account.id,
        name: company_name,
        subdomain: subdomain || `${company_name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        sip_domain: `${subdomain}.pbx.crc.com`,
        status: CompanyStatus.ACTIVE,
        timezone: 'America/New_York',
        settings: {
          caller_id_lookup: true,
          spam_detection: true,
          call_scoring: true
        }
      } as any);

      res.status(201).json({ company });
    } catch (error) {
      console.error('Company creation error:', error);
      res.status(500).json({ error: 'Failed to create company' });
    }
  }

  // Add to CompanyController class:
  async inviteUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { email, role = UserRole } = req.body;
      const companyId = req.user!.company_id;

      // Check if user is admin/manager
      if (![UserRole.ADMIN, UserRole.MANAGER].includes(req.user!.role)) {
        res.status(403).json({ error: 'Only admins and managers can invite users' });
        return;
      }

      // Check if user already has access to this company
      const company = await Company.findByPk(companyId);
      if (!company) {
        res.status(404).json({ error: 'Company not found' });
        return;
      }

      // Does an account already exist for this email?
      const account = await Account.findOne({ where: { email } });

      if (account) {
        // If there's already a user row for this account (any company), get it
        const existingUserForAccount = await User.findOne({ where: { account_id: account.id } });

        if (existingUserForAccount) {
          // Check pivot to see if they already have access to this company
          const existingAccess = await UserCompany.findOne({
            where: { user_id: existingUserForAccount.id, company_id: companyId, is_active: true }
          });

          if (existingAccess) {
            res.status(400).json({ error: 'User already has access to this company' });
            return;
          }
        }
      }

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

      // Generate a temporary password to include in the email
      const tempPassword = generateRandomPassword(12);

      // Send invitation via Brevo
      try {
        await BrevoService.sendInvitationEmail({
          to: email,
          toName: `${req.body.first_name || ''} ${req.body.last_name || ''}`.trim(),
          companyName: company.name,
          role: role,
          email: email,
          password: tempPassword
        });
      } catch (e) {
        console.error(`Error while sending Brevo company invitation:`, e);
        // Optional: return 502 if email is mandatory
        // res.status(502).json({ error: 'Failed to send invitation email' }); return;
      }

      res.json({
        message: 'Invitation sent',
        invite_token: inviteToken // TODO: remove in production
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