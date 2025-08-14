import { Router } from 'express';
import CompanyController from '../controllers/CompanyController';
import { authenticate, authorize } from '../middleware/auth';
import {UserRole} from '../types/enums';

const router = Router();
router.use(authenticate);
router.post('/', CompanyController.createCompany.bind(CompanyController));
// Add routes:
router.post('/invite', authorize(UserRole.ADMIN, UserRole.MANAGER), CompanyController.inviteUser.bind(CompanyController));
router.post('/accept-invitation', CompanyController.acceptInvitation.bind(CompanyController));

export default router;