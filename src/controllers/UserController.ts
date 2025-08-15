// backend/src/controllers/UsersController.ts
import { Request, Response } from 'express';
import { User, Company, UserInvitation, UserCompany } from '../models';
import { UserRole } from '../types/enums';
import { InvitationStatus } from '../models/UserInvitation';
import { AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import BrevoService from '../services/BrevoService';

interface CreateUserRequest extends AuthRequest {
  body: {
    email: string;
    password?: string;
    first_name: string;
    last_name: string;
    role: UserRole;
    phone?: string;
    personal_note?: string;
    send_welcome_email?: boolean;
  };
}

interface UpdateUserRequest extends AuthRequest {
  params: {
    id: string;
  };
  body: {
    email?: string;
    first_name?: string;
    last_name?: string;
    role?: UserRole;
    phone?: string;
    personal_note?: string;
    is_active?: boolean;
  };
}

export class UsersController {
  /**
   * Get all users in the company
   */
  async getUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { role, is_active, search, page = 1, limit = 50, include_pending = 'true' } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      const userCompanies = await UserCompany.findAll({
        where: { company_id: req.user!.company_id, is_active: true },
        attributes: ['user_id']
      });
      const userIds = userCompanies.map(uc => uc.user_id);

      const where: any = {
        id: { [Op.in]: userIds }
      };

      // Include or exclude pending users (inactive with invitation)
      if (include_pending === 'false') {
        where.is_active = true;
      } else if (is_active !== undefined) {
        where.is_active = is_active === 'true';
      }

      if (role) {
        where.role = role;
      }

      if (search) {
        where[Op.or] = [
          { email: { [Op.iLike]: `%${search}%` } },
          { first_name: { [Op.iLike]: `%${search}%` } },
          { last_name: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows: users } = await User.findAndCountAll({
        where,
        attributes: { exclude: ['password_hash'] },
        include: [
          {
            model: UserInvitation,
            as: 'invitation',
            required: false,
            where: { status: InvitationStatus.PENDING }
          }
        ],
        limit: Number(limit),
        offset,
        order: [['created_at', 'DESC']]
      });

      // Add status indicator for each user
      const usersWithStatus = users.map(user => {
        const userData = user.toJSON();
        return {
          ...userData,
          status: user.is_active ? 'active' : 'pending',
          invitation_pending: !user.is_active && userData.invitation
        };
      });

      res.json({
        users: usersWithStatus,
        pagination: {
          total: count,
          pages: Math.ceil(count / Number(limit)),
          current_page: Number(page),
          per_page: Number(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: `Failed to fetch users ${error}` });
    }
  }

  /**
   * Get a single user by ID
   */
  /**
   * Get a single user by ID
   */
  async getUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Find the user by ID
      const user = await User.findByPk(parseInt(id), {
        attributes: { exclude: ['password_hash'] }
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Verify they have access to the requesting company
      const hasAccess = await user.hasAccessToCompany(req.user!.company_id);
      if (!hasAccess) {
        res.status(403).json({ error: 'Access to Company is denied' });
        return;
      }

      res.json(user);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }


  /**
   * Create a new user
   */
  async createUser(req: CreateUserRequest, res: Response): Promise<void> {
    try {
      const {
        email,
        password,
        first_name,
        last_name,
        role,
        phone,
        personal_note,
        send_welcome_email = true
      } = req.body;

      // Check if user can create users (only ADMINs)
      if (req.user!.role !== UserRole.ADMIN) {
        res.status(403).json({ error: 'Only ADMINs can create users' });
        return;
      }

      // Check if user with this email already exists
      const existingUser = await User.findOne({
        where: { email }
      });

      if (existingUser) {
        // Check if the existing user has access to this company
        const existingUserCompany = await UserCompany.findOne({
          where: {
            user_id: existingUser.id,
            company_id: req.user!.company_id
          }
        });

        if (existingUserCompany) {
          // User already exists in this company
          if (existingUserCompany.is_active) {
            res.status(400).json({ error: 'Email already exists and is active in this company' });
            return;
          } else {
            // Reactivate the existing user for this company
            await existingUser.update({
              first_name,
              last_name,
              phone,
              personal_note,
              is_active: true
            });

            // Update password if provided
            const tempPassword = password || this.generateTempPassword();
            await existingUser.setPassword(tempPassword);
            await existingUser.save();

            // Reactivate and update the UserCompany relationship
            await existingUserCompany.update({
              role,
              is_active: true
            });

            // Send welcome email if requested
            if (send_welcome_email) {
              await BrevoService.sendWelcomeEmail({
                to: existingUser.email,
                firstName: existingUser.first_name || '',
                lastName: existingUser.last_name || '',
                email: existingUser.email,
                password: tempPassword
              });
            }

            res.status(200).json({
              user: existingUser,
              temp_password: !password ? tempPassword : undefined,
              message: 'User reactivated for this company'
            });
            return;
          }
        } else {
          // User exists but not in this company - add them to this company
          await UserCompany.create({
            user_id: existingUser.id,
            company_id: req.user!.company_id,
            role,
            is_active: true,
            invited_by: req.user!.id,
            joined_at: new Date()
          } as any);

          // Update user details if they're inactive
          if (!existingUser.is_active) {
            await existingUser.update({
              first_name,
              last_name,
              phone,
              personal_note,
              is_active: true
            });

            // Update password
            const tempPassword = password || this.generateTempPassword();
            await existingUser.setPassword(tempPassword);
            await existingUser.save();

            if (send_welcome_email) {
              await BrevoService.sendWelcomeEmail({
                to: existingUser.email,
                firstName: existingUser.first_name || '',
                lastName: existingUser.last_name || '',
                email: existingUser.email,
                password: tempPassword
              });
            }

            res.status(200).json({
              user: existingUser,
              temp_password: !password ? tempPassword : undefined,
              message: 'User added to this company'
            });
          } else {
            // User is active in another company, just add them to this one
            res.status(200).json({
              user: existingUser,
              message: 'User added to this company (already active in another company)'
            });
          }
          return;
        }
      }

      // Generate a temporary password if not provided
      const tempPassword = password || this.generateTempPassword();

      // Create new user (first time in system)
      const user = await User.create({
        uuid: uuidv4(),
        account_id: req.user!.account_id,
        email,
        password_hash: tempPassword, // Will be hashed in BeforeCreate hook
        first_name,
        last_name,
        phone,
        personal_note,
        is_active: true
      } as any);

      // Add user to company
      await UserCompany.create({
        user_id: user.id,
        company_id: req.user!.company_id,
        role,
        is_active: true,
        invited_by: req.user!.id,
        joined_at: new Date(),
        is_default: true // First company is default
      } as any);

      // Send welcome email with credentials if requested
      if (send_welcome_email) {
        await BrevoService.sendWelcomeEmail({
          to: user.email,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          email: user.email,
          password: tempPassword
        });
      }

      // Return user without password
      const userResponse = user.toJSON();
      delete (userResponse as any).password_hash;

      res.status(201).json({
        user: userResponse,
        temp_password: !password ? tempPassword : undefined
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }

  /**
 * Update a user
 */
  async updateUser(req: UpdateUserRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Check if user can update users
      if (req.user!.role !== UserRole.ADMIN && req.user!.id !== parseInt(id)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      // Find the user by ID
      const user = await User.findByPk(parseInt(id));

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Verify they have access to the requesting company
      const hasAccess = await user.hasAccessToCompany(req.user!.company_id);
      if (!hasAccess) {
        res.status(403).json({ error: 'User not found in this company' });
        return;
      }

      // Prevent non-admins from changing roles
      if (updates.role && req.user!.role !== UserRole.ADMIN) {
        delete updates.role;
      }

      // Check if email is being changed and if it's already taken
      if (updates.email && updates.email !== user.email) {
        const existingUser = await User.findOne({
          where: { email: updates.email }
        });

        if (existingUser) {
          res.status(400).json({ error: 'Email already exists' });
          return;
        }
      }

      await user.update(updates);

      // If role is being updated, also update UserCompany
      if (updates.role) {
        await UserCompany.update(
          { role: updates.role },
          {
            where: {
              user_id: user.id,
              company_id: req.user!.company_id
            }
          }
        );
      }

      const userResponse = user.toJSON();
      delete (userResponse as any).password_hash;

      res.json(userResponse);
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  }

  /**
   * Delete (deactivate) a user
   */
  async deleteUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (req.user!.role !== UserRole.ADMIN) {
        res.status(403).json({ error: 'Only ADMINs can delete users' });
        return;
      }

      const user = await User.findByPk(parseInt(id));

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Verify they have access to the requesting company
      const hasAccess = await user.hasAccessToCompany(req.user!.company_id);
      if (!hasAccess) {
        res.status(403).json({ error: 'User not found in this company' });
        return;
      }

      // Prevent deleting yourself
      if (user.id === req.user!.id) {
        res.status(400).json({ error: 'Cannot delete your own account' });
        return;
      }

      // Soft delete by deactivating the user
      await user.update({ is_active: false });

      // Also deactivate their UserCompany relationship
      await UserCompany.update(
        { is_active: false },
        {
          where: {
            user_id: user.id,
            company_id: req.user!.company_id
          }
        }
      );

      res.json({ message: 'User deactivated successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }

  /**
   * Reactivate a user
   */
  async reactivateUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (req.user!.role !== UserRole.ADMIN) {
        res.status(403).json({ error: 'Only ADMINs can reactivate users' });
        return;
      }

      // Find the user by ID
      const user = await User.findByPk(parseInt(id));

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Verify they have/had access to the requesting company
      const userCompany = await UserCompany.findOne({
        where: {
          user_id: user.id,
          company_id: req.user!.company_id
        }
      });

      if (!userCompany) {
        res.status(403).json({ error: 'User not found in this company' });
        return;
      }

      // Reactivate the user
      await user.update({ is_active: true });

      // Also reactivate their UserCompany relationship
      await userCompany.update({ is_active: true });

      res.json({ message: 'User reactivated successfully' });
    } catch (error) {
      console.error('Error reactivating user:', error);
      res.status(500).json({ error: 'Failed to reactivate user' });
    }
  }

  /**
   * Reset user password
   */
  async resetUserPassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { send_email = true } = req.body;

      if (req.user!.role !== UserRole.ADMIN) {
        res.status(403).json({ error: 'Only ADMINs can reset passwords' });
        return;
      }

      // Find the user by ID
      const user = await User.findByPk(parseInt(id));

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Verify they have access to the requesting company
      const hasAccess = await user.hasAccessToCompany(req.user!.company_id);
      if (!hasAccess) {
        res.status(403).json({ error: 'User not found in this company' });
        return;
      }

      const tempPassword = this.generateTempPassword();
      await user.setPassword(tempPassword);
      await user.save();

      if (send_email) {
        await BrevoService.sendPasswordResetEmail({
          to: user.email,
          firstName: user.first_name || user.email,
          tempPassword
        });
      }

      res.json({
        message: 'Password reset successfully',
        temp_password: tempPassword
      });
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const stats = await User.findAll({
        include: [{
          model: UserCompany,
          where: { company_id: req.user!.company_id },
          required: true
        }],
        attributes: [
          'role',
          [User.sequelize!.fn('COUNT', User.sequelize!.col('id')), 'count']
        ],
        group: ['role']
      });

      const totalUsers = await User.count({
        include: [{
          model: UserCompany,
          where: { company_id: req.user!.company_id },
          required: true
        }],
      });

      const activeUsers = await User.count({
        include: [{
          model: UserCompany,
          where: { is_active: true, company_id: req.user!.company_id },
          required: true
        }],
      });

      res.json({
        total: totalUsers,
        active: activeUsers,
        by_role: stats
      });
    } catch (error) {
      console.error('Error fetching user stats:', error);
      res.status(500).json({ error: 'Failed to fetch user statistics' });
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
}

const controller = new UsersController();

export default {
  getUsers: controller.getUsers.bind(controller),
  getUser: controller.getUser.bind(controller),
  createUser: controller.createUser.bind(controller),
  updateUser: controller.updateUser.bind(controller),
  deleteUser: controller.deleteUser.bind(controller),
  reactivateUser: controller.reactivateUser.bind(controller),
  resetUserPassword: controller.resetUserPassword.bind(controller),
  getUserStats: controller.getUserStats.bind(controller)
};