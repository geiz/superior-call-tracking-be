// backend/src/routes/dni.ts 
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import { DniController } from '../controllers/DniController';

const router = Router();
const dniController = new DniController();

// Validation middleware
const validate = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Rate limiting for public endpoints
const publicRateLimit = rateLimiterMiddleware;

// ===== PUBLIC ENDPOINTS (No auth required) =====

// Create visitor session
router.post('/visitor',
  publicRateLimit,
  [
    body('company_id').isString().notEmpty().withMessage('Company ID is required'),
    // Update URL validation to be more permissive
    body('page_url').isURL({
      require_protocol: true,
      require_valid_protocol: true,
      protocols: ['http', 'https'],
      require_host: true,
      require_tld: false, // Allow localhost
      allow_query_components: true, // Allow query strings
      allow_fragments: true, // Allow fragments
      disallow_auth: true
    }).withMessage('Valid page URL is required'),
    body('page_title').optional().isString().isLength({ max: 255 }),
    // Make referrer more permissive
    body('referrer').optional().isURL({
      require_protocol: true,
      require_valid_protocol: true,
      protocols: ['http', 'https'],
      require_host: true,
      require_tld: false,
      allow_query_components: true,
      allow_fragments: true,
      disallow_auth: true
    }),
    body('user_agent').optional().isString().isLength({ max: 500 }),
    body('utm_source').optional().isString().isLength({ max: 100 }),
    body('utm_medium').optional().isString().isLength({ max: 100 }),
    body('utm_campaign').optional().isString().isLength({ max: 255 }),
    body('utm_term').optional().isString().isLength({ max: 255 }),
    body('utm_content').optional().isString().isLength({ max: 255 }),
    body('gclid').optional().isString().isLength({ max: 255 }),
    body('fbclid').optional().isString().isLength({ max: 255 }),
    body('msclkid').optional().isString().isLength({ max: 255 })
  ],
  validate,
  dniController.createVisitor.bind(dniController)
);

// Get visitor session
router.get('/visitor/:visitorId',
  publicRateLimit,
  [
    param('visitorId').isUUID().withMessage('Valid visitor ID is required')
  ],
  validate,
  dniController.getVisitor.bind(dniController)
);

// Track page view
router.post('/track/pageview',
  publicRateLimit,
  [
    body('visitor_id').isUUID().withMessage('Valid visitor ID is required'),
    body('company_id').isString().notEmpty().withMessage('Company ID is required'),
    // Update URL validation here too
    body('page_url').isURL({
      require_protocol: true,
      require_valid_protocol: true,
      protocols: ['http', 'https'],
      require_host: true,
      require_tld: false,
      allow_query_components: true,
      allow_fragments: true,
      disallow_auth: true
    }).withMessage('Valid page URL is required'),
    body('page_title').optional().isString().isLength({ max: 255 }),
    body('referrer').optional().isURL({
      require_protocol: true,
      require_valid_protocol: true,
      protocols: ['http', 'https'],
      require_host: true,
      require_tld: false,
      allow_query_components: true,
      allow_fragments: true,
      disallow_auth: true
    }),
    body('timestamp').optional().isISO8601(),
    body('utm_source').optional().isString().isLength({ max: 100 }),
    body('utm_medium').optional().isString().isLength({ max: 100 }),
    body('utm_campaign').optional().isString().isLength({ max: 255 })
  ],
  validate,
  dniController.trackPageView.bind(dniController)
);

// Track form submission
router.post('/track/form',
  publicRateLimit,
  [
    body('visitor_id').isUUID().withMessage('Valid visitor ID is required'),
    body('company_id').isString().notEmpty().withMessage('Company ID is required'),
    body('form_id').optional().isString().isLength({ max: 100 }),
    body('form_name').optional().isString().isLength({ max: 255 }),
    body('page_url').isURL({
      require_protocol: true,
      require_valid_protocol: true,
      protocols: ['http', 'https'],
      require_host: true,
      require_tld: false,
      allow_query_components: true,
      allow_fragments: true,
      disallow_auth: true
    }).withMessage('Valid page URL is required'),
    body('fields').isObject().withMessage('Fields must be an object')
  ],
  validate,
  dniController.trackFormSubmission.bind(dniController)
);

// ===== AUTHENTICATED ENDPOINTS =====

// Get pool status
router.get('/pool/:companyId',
  authenticate,
  [
    param('companyId').isNumeric().withMessage('Valid company ID is required')
  ],
  validate,
  dniController.getPoolStatus.bind(dniController)
);

// Release number assignment
router.post('/pool/:companyId/release',
  authenticate,
  [
    param('companyId').isNumeric().withMessage('Valid company ID is required'),
    body('tracking_number_id').isNumeric().withMessage('Valid tracking number ID is required')
  ],
  validate,
  dniController.releaseNumber.bind(dniController)
);

// Cleanup expired sessions (admin only)
router.post('/cleanup',
  authenticate,
  dniController.cleanupSessions.bind(dniController)
);

export default router;