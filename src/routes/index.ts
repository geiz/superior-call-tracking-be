// backend/src/routes/index.ts
import { Router } from 'express';
import authRoutes from './auth';
import invitationRoutes from './invitation';
import userRoutes from './users';
import callRoutes from './calls';
import trackingRoutes from './tracking';
import tagRoutes from './tags';
import textRoutes from './texts';
import journeyRoutes from './journey';
import webhookRoutes from './webhooks';
import agentRoutes from './agents';
import recordingRoutes from './recordings';
import sipRoutes from './sip';
import dniRoutes from './dni';
import newsletter from './newsletter';

const router = Router();

// Public routes
router.use('/auth', authRoutes);
router.use('/sip', sipRoutes); // Webhooks from SIP provider
router.use('/dni', dniRoutes);

// Protected routes (add auth middleware in individual routers)
router.use('/invitations', invitationRoutes);
router.use('/users', userRoutes); // Add this line
router.use('/calls', callRoutes);
router.use('/tracking', trackingRoutes);
router.use('/tags', tagRoutes);
router.use('/texts', textRoutes);
router.use('/journey', journeyRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/agents', agentRoutes);
router.use('/recordings', recordingRoutes);
router.use('/newsletter', newsletter);

export default router;