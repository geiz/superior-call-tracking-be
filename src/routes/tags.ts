import { Router } from 'express';
import TagController from '../controllers/TagController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', TagController.getTags.bind(TagController));
router.get('/stats', TagController.getTagStats.bind(TagController));
router.get('/:id', TagController.getTag.bind(TagController));
router.post('/', TagController.createTag.bind(TagController));
router.put('/:id', TagController.updateTag.bind(TagController));
router.delete('/:id', TagController.deleteTag.bind(TagController));
router.post('/:id/restore', TagController.restoreTag.bind(TagController));

// Bulk operations
router.post('/bulk/apply', TagController.bulkTagCalls.bind(TagController));

// Search
router.get('/search/calls', TagController.searchCallsByTags.bind(TagController));

export default router;