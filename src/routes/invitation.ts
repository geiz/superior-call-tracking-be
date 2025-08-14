// backend/src/routes/invitations.ts
import { Router } from 'express';
import InvitationController from '../controllers/InvitationController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

// Public route for accepting invitations
router.post('/accept/:uuid', InvitationController.acceptInvitation);

// Protected routes - require authentication
router.use(authenticate);

// Only ADMINs can manage invitations
router.post('/', authorize(UserRole.ADMIN), InvitationController.inviteUser);
router.get('/', authorize(UserRole.ADMIN), InvitationController.getInvitations);
router.get('/stats', authorize(UserRole.ADMIN), InvitationController.getInvitationStats);
router.post('/:id/cancel', authorize(UserRole.ADMIN), InvitationController.cancelInvitation);
router.post('/:id/resend', authorize(UserRole.ADMIN), InvitationController.resendInvitation);

export default router;