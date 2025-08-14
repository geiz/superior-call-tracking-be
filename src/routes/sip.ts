import { Router, Request, Response } from 'express';
import SipController from '../controllers/SipController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Webhook endpoints for Twilio (no auth required)
router.post('/incoming', SipController.handleIncomingCall.bind(SipController));
router.post('/status', SipController.handleCallStatus.bind(SipController));
router.post('/recording-status', SipController.handleRecordingStatus.bind(SipController));
router.post('/fallback', SipController.handleFallback.bind(SipController));
router.post('/outbound-handler', SipController.handleOutboundCall.bind(SipController));

// Protected routes
router.use(authenticate);

// Make outbound call
router.post('/outbound', SipController.makeOutboundCall.bind(SipController));

export default router;