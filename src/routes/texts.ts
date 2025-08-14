import { Router } from 'express';
import TextController from '../controllers/TextController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Webhook endpoint (no auth required)
router.post('/webhook/receive', TextController.receiveMessage.bind(TextController));

// All other routes require authentication
router.use(authenticate);

// Text conversation routes
router.get('/conversations', TextController.getConversations.bind(TextController));
router.get('/conversations/:id/messages', TextController.getConversationMessages.bind(TextController));
router.post('/send', TextController.sendMessage.bind(TextController));
router.put('/conversations/:id/archive', TextController.archiveConversation.bind(TextController));

export default router;