import { Router } from 'express';
import JourneyController from '../controllers/JourneyController';
import { authenticate } from '../middleware/auth';
import { trackingRateLimiterMiddleware } from '../middleware/trackingRateLimiter';
import cors from 'cors';

const router = Router();

// CORS configuration for tracking endpoints (allow from any origin)
const trackingCors = cors({
  origin: true, // Allow any origin
  methods: ['POST'],
  credentials: false // No cookies needed for tracking
});

// Public tracking endpoints
router.post('/track/pageview', trackingCors, trackingRateLimiterMiddleware, JourneyController.trackPageView.bind(JourneyController));
router.post('/track/form', trackingCors, trackingRateLimiterMiddleware, JourneyController.trackFormSubmission.bind(JourneyController));

// Protected routes
router.use(authenticate);

// Customer journey routes
router.get('/customer', JourneyController.getCustomerJourney.bind(JourneyController));
router.get('/customers', JourneyController.getCustomerList.bind(JourneyController));
router.put('/customers/:id', JourneyController.updateCustomerProfile.bind(JourneyController));

export default router;