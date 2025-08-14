import { Router } from 'express';
import TrackingNumberController from '../controllers/TrackingNumberController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Twilio number management - PUT THESE BEFORE :id ROUTES
router.get('/available', TrackingNumberController.searchAvailableNumbers);
router.post('/provision', authorize(UserRole.ADMIN, UserRole.MANAGER), TrackingNumberController.provisionNumber);

// Tracking number routes
router.get('/', TrackingNumberController.getAll);
router.get('/:id', TrackingNumberController.getById);
router.post('/', authorize(UserRole.ADMIN, UserRole.MANAGER), TrackingNumberController.create);
router.put('/:id', authorize(UserRole.ADMIN, UserRole.MANAGER), TrackingNumberController.update);
router.delete('/:id', authorize(UserRole.ADMIN), TrackingNumberController.delete);

// Call flow
router.get('/:id/call-flow', TrackingNumberController.getCallFlow);
router.put('/:id/call-flow', authorize(UserRole.ADMIN, UserRole.MANAGER), TrackingNumberController.updateCallFlow);

// Statistics
router.get('/:id/stats', TrackingNumberController.getStats);

// Release number
router.delete('/:id/release', authorize(UserRole.ADMIN), TrackingNumberController.releaseNumber);

export default router;