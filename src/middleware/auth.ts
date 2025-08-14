// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { ParsedQs } from 'qs';
import { UserRole } from '../types/enums';
import { AuthUser } from '../types/interfaces';
import { verifyToken } from '../config/jwt';
import { User } from '../models';

export interface AuthRequest<
  P = Record<string, any>,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: AuthUser;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    console.log('Auth middleware - Headers:', req.headers.authorization ? 'Present' : 'Missing');

    const authHeaderRaw = req.headers.authorization || req.headers['Authorization'];

    // Try multiple ways to get the token
    const authHeader = Array.isArray(authHeaderRaw)
      ? authHeaderRaw[0]
      : authHeaderRaw;
    const bearerToken = authHeader?.replace('Bearer ', '').trim();
    const token = bearerToken ||
      (typeof req.headers.authorization === 'string'
        ? req.headers.authorization.replace('Bearer ', '').trim()
        : undefined);

    console.log('Auth middleware - Auth header:', authHeader?.substring(0, 50) + '...');
    console.log('Auth middleware - Token extracted:', token ? token.substring(0, 20) + '...' : 'No token');

    if (!token) {
      console.log('Auth middleware - No token provided');
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    try {
      const decoded = verifyToken(token) as AuthUser;
      console.log('Auth middleware - Token verified successfully for user:', decoded.id, decoded.email);

      req.user = decoded;
      next();
    } catch (verifyError: any) {
      console.error('Auth middleware - Token verification failed:', verifyError.message);
      console.error('Auth middleware - Token details:', {
        tokenLength: token.length,
        tokenStart: token.substring(0, 50),
        errorName: verifyError.name,
        errorMessage: verifyError.message
      });

      res.status(401).json({
        error: 'Invalid token',
        details: process.env.NODE_ENV === 'development' ? verifyError.message : undefined
      });
      return;
    }
  } catch (error) {
    console.error('Auth middleware - Unexpected error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};


export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const roleHierarchy: Record<UserRole, number> = {
      [UserRole.ADMIN]: 4,     // Account admin
      [UserRole.MANAGER]: 3,   // Company manager
      [UserRole.REPORTING]: 2, // Reporting role
      [UserRole.AGENT]: 1,      // Agent role
    };

    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = Math.min(...roles.map(r => roleHierarchy[r] || 0));

    if (userLevel < requiredLevel) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      console.log('Authorization failed - User role:', req.user.role, 'Required roles:', roles);
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

export const requireAccountAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== UserRole.ADMIN) {
    res.status(403).json({ error: 'Account admin access required' });
    return;
  }
  next();
};

export const requireCompanyAccess = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Account admins have access to all companies in their account
  if (req.user.role === UserRole.ADMIN) {
    next();
    return;
  }

  // Company users must have a company_id
  if (!req.user.company_id) {
    res.status(403).json({ error: 'No company selected' });
    return;
  }

  const user = await User.findByPk(req.user.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const hasAccess = await user.hasAccessToCompany(req.user.company_id);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied to this company' });
    return;
  }

  // Update role for current company context
  const role = await user.getRoleInCompany(req.user.company_id);
  if (role) {
    req.user.role = role;
  }


  next();
};


// Permission-based middleware
export const requirePermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    let hasPermission = false;

    switch (permission) {
      case 'manage_users':
        hasPermission = req.user.role === UserRole.ADMIN;
        break;

      case 'manage_numbers':
      case 'manage_integrations':
      case 'manage_forms':
        hasPermission = [UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role);
        break;

      case 'view_reports':
      case 'tag_leads':
        hasPermission = [UserRole.ADMIN, UserRole.MANAGER, UserRole.REPORTING].includes(req.user.role);
        break;

      case 'place_calls':
      case 'send_messages':
        hasPermission = true; // All roles can do this
        break;

      default:
        hasPermission = req.user.role === UserRole.ADMIN;
    }

    if (!hasPermission) {
      console.log('Permission denied - User role:', req.user.role, 'Permission:', permission);
      res.status(403).json({ error: `Insufficient permissions for: ${permission}` });
      return;
    }

    next();
  };
};