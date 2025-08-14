// backend/src/routes/users.ts
import { Router } from 'express';
import UserController from '../controllers/UserController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

// All routes require authentication
router.use(authenticate);

// User management routes
router.get('/', UserController.getUsers);
router.get('/stats', UserController.getUserStats);
router.get('/:id', UserController.getUser);
router.post('/', authorize(UserRole.ADMIN), UserController.createUser);
router.put('/:id', UserController.updateUser);
router.delete('/:id', authorize(UserRole.ADMIN), UserController.deleteUser);
router.post('/:id/reactivate', authorize(UserRole.ADMIN), UserController.reactivateUser);
router.post('/:id/reset-password', authorize(UserRole.ADMIN), UserController.resetUserPassword);

export default router;