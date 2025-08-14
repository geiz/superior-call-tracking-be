import { Router } from 'express';
import CompanyController from '../controllers/CompanyController';
import { authenticate, authorize, requireAccountAdmin } from '../middleware/auth';
import { UserRole } from '../types/enums';
import { UsageService } from '../services/UsageService';

const router = Router();
router.use(authenticate);
router.post('/', CompanyController.createCompany.bind(CompanyController));
// Add routes:
router.post('/invite', authorize(UserRole.ADMIN, UserRole.MANAGER), CompanyController.inviteUser.bind(CompanyController));
router.post('/accept-invitation', CompanyController.acceptInvitation.bind(CompanyController));
router.post('/switch', authenticate, CompanyController.switchCompany);
router.get('/usage', authenticate, requireAccountAdmin, async (req, res) => {
    const stats = await UsageService.getUsageStats(Number(req.user!.account_id));
    res.json(stats);
});

export default router;