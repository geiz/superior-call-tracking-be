import { Router } from 'express';
import WebhookController from '../controllers/WebhookController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Webhook management routes
router.get('/', WebhookController.getWebhooks.bind(WebhookController));
router.post('/', authorize(UserRole.ADMIN, UserRole.MANAGER), WebhookController.createWebhook.bind(WebhookController));
router.put('/:id', authorize(UserRole.ADMIN, UserRole.MANAGER), WebhookController.updateWebhook.bind(WebhookController));
router.delete('/:id', authorize(UserRole.ADMIN), WebhookController.deleteWebhook.bind(WebhookController));

// Webhook testing and delivery
router.post('/:id/test', authorize(UserRole.ADMIN, UserRole.MANAGER), WebhookController.testWebhook.bind(WebhookController));
router.get('/:id/deliveries', WebhookController.getDeliveries.bind(WebhookController));
router.post('/deliveries/:deliveryId/retry', authorize(UserRole.ADMIN, UserRole.MANAGER), WebhookController.retryDelivery.bind(WebhookController));

export default router;