import CallController from '../controllers/CallController';
import { authenticate } from '../middleware/auth';
import { validatePagination, validateDateRange, validateRequest} from '../middleware/validation';
import { query, param } from 'express-validator';
import { Router, Request, Response } from 'express';

const router = Router();
// All routes require authentication
router.use(authenticate);

// Call routes - properly bind methods to maintain 'this' context
router.get('/', validatePagination, validateDateRange, CallController.getCalls.bind(CallController));
router.get('/analytics', validateDateRange, CallController.getAnalytics.bind(CallController));
router.get('/:id', CallController.getCallById.bind(CallController));
router.post('/', CallController.createCall.bind(CallController));
router.put('/:id', CallController.updateCall.bind(CallController));
router.delete('/:id', CallController.deleteCall.bind(CallController));

// Get signed URL for recording - bind the method properly
router.get(
  '/:id/recording-url',
  [
    param('id').isInt(),
    query('download').optional().isBoolean()
  ],
  validateRequest,
  CallController.getRecordingUrl.bind(CallController)
);

// Alternative recording endpoint
router.get('/:id/recording', authenticate, CallController.getRecordingUrl.bind(CallController));

// Stream recording
router.get(
  '/:id/recording/stream',
  [param('id').isInt()],
  validateRequest,
  CallController.streamRecording.bind(CallController)
);

router.get('/visitor-attribution', CallController.getCallsWithVisitors.bind(CallController));


// Update call
router.patch(
  '/:id',
  [param('id').isInt()],
  validateRequest,
  CallController.updateCall.bind(CallController)
);

// Call tags
router.post('/:id/tags', CallController.addTags.bind(CallController));
router.delete('/:id/tags/:tagId', CallController.removeTag.bind(CallController));

// Call actions
router.post('/:id/transfer', CallController.transferCall.bind(CallController));
router.post('/:id/hold', CallController.holdCall.bind(CallController));
router.post('/:id/unhold', CallController.unholdCall.bind(CallController));
router.post('/:id/hangup', CallController.hangupCall.bind(CallController));

export default router;