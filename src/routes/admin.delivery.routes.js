/**
 * Admin Delivery Routes
 * Endpoints for delivery status management
 */

import express from 'express';
const router = express.Router();
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

import * as adminDeliveryController from '../controllers/admin.delivery.controller.js';

// ======= DEV TESTING: optional auth bypass (mirrors admin.order.routes.js pattern) =======
const devBypassAuth = (req, res, next) => {
    req.user = { _id: 'DEV_ADMIN', name: 'Dev Admin', role: 'admin' };
    req.admin = { _id: 'DEV_ADMIN', name: 'Dev Admin', role: 'admin' };
    next();
};

let adminAuthMiddleware;
if (process.env.FEATURE_ADMIN_ORDERS_BYPASS === 'true') {
    adminAuthMiddleware = devBypassAuth;
} else {
    adminAuthMiddleware = [requireAuth, requireAdmin];
}

/**
 * GET /api/admin/delivery
 * List orders eligible for delivery management
 * Query: page, limit, deliveryStatus
 */
router.get(
    '/',
    adminAuthMiddleware,
    adminDeliveryController.listDeliveryOrders
);

/**
 * PATCH /api/admin/delivery/:orderId
 * Update delivery status for an order
 * Body: { deliveryStatus: "shipped" | "out_for_delivery" | "delivered" }
 */
router.patch(
    '/:orderId',
    adminAuthMiddleware,
    adminDeliveryController.updateDeliveryStatus
);

export default router;
