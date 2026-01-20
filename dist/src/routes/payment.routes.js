import { Router } from 'express';
import { protect } from '../middlewares/auth.js';
import { initiatePayment } from '../controllers/payment.controller.js';

const router = Router();

// POST /api/payment/initiate
router.post('/initiate', protect, initiatePayment);

export default router;
