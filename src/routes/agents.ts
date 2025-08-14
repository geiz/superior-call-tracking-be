import { Router } from 'express';
import AgentController from '../controllers/AgentController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../types/enums';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Agent routes
router.get('/active', AgentController.getActiveAgents.bind(AgentController));
router.get('/stats', authorize(UserRole.ADMIN, UserRole.MANAGER), AgentController.getAgentStats.bind(AgentController));
router.get('/:id/metrics', authorize(UserRole.ADMIN, UserRole.MANAGER), AgentController.getAgentMetrics.bind(AgentController));
router.get('/:id/sessions', authorize(UserRole.ADMIN, UserRole.MANAGER), AgentController.getSessions.bind(AgentController));
router.put('/status', AgentController.updateStatus.bind(AgentController));

export default router;