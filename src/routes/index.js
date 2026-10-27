import { Router } from 'express';
import healthRoutes from './health.routes.js';
import accountRoutes from './account.routes.js';

const router = Router();

// Mount sub-routers
router.use('/health', healthRoutes);
router.use('/accounts', accountRoutes);

export default router;
