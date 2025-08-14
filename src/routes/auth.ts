import { Router } from 'express';
import AuthController from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/login', AuthController.login.bind(AuthController));
router.post('/register', AuthController.register.bind(AuthController));
router.post('/forgot-password', AuthController.forgotPassword.bind(AuthController));
router.post('/reset-password', AuthController.resetPassword.bind(AuthController));

// Protected routes
router.use(authenticate);
router.get('/me', AuthController.me.bind(AuthController));
router.post('/logout', AuthController.logout.bind(AuthController));
router.put('/change-password', AuthController.changePassword.bind(AuthController));
router.get('/me', AuthController.me.bind(AuthController));

export default router;