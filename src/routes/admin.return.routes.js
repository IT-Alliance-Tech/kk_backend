/**
 * Admin Return Management Routes
 * GET  /api/admin/returns              — list returns (paginated, item-level)
 * PATCH /api/admin/returns/:orderId/:itemId — update return status (forward-only)
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { adminListReturns, adminUpdateReturnStatus } from '../controllers/return.controller.js';

const router = Router();

// Apply admin authentication middleware to all routes
router.use(requireAuth, requireAdmin);

// GET /api/admin/returns
router.get('/', adminListReturns);

// PATCH /api/admin/returns/:orderId/:itemId
router.patch('/:orderId/:itemId', adminUpdateReturnStatus);

export default router;
