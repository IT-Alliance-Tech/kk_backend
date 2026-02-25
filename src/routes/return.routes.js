/**
 * User Return Routes
 * POST /api/returns/request — request a return for an order item
 */

import { Router } from 'express';
import { protect } from '../middlewares/auth.js';
import { requestReturn } from '../controllers/return.controller.js';

const router = Router();

// POST /api/returns/request
router.post('/request', protect, requestReturn);

export default router;
