import { Router } from 'express';
import RecordingController from '../controllers/RecordingController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Recording routes
router.get('/:id', RecordingController.getRecording.bind(RecordingController));
router.get('/:id/play', RecordingController.playRecording.bind(RecordingController));
router.get('/:id/download', RecordingController.downloadRecording.bind(RecordingController));
// router.delete('/:id', authorize(UserRole.ADMIN, UserRole.MANAGER), RecordingController.deleteRecording.bind(RecordingController));

// Transcription
router.get('/calls/:id/transcription', RecordingController.getTranscription.bind(RecordingController));

export default router;