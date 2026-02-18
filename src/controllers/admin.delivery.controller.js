/**
 * Admin Delivery Controller
 * Handles delivery status management for paid orders
 */

import mongoose from 'mongoose';
import Order from '../models/Order.js';

// Valid delivery status transitions (forward-only)
const DELIVERY_STATUSES = ['pending', 'shipped', 'out_for_delivery', 'delivered'];

/**
 * List orders eligible for delivery management
 * GET /api/admin/delivery
 * Query: page, limit, deliveryStatus
 * Only shows orders where payment.status === "success" and status !== "cancelled"
 */
export const listDeliveryOrders = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            deliveryStatus = ''
        } = req.query;

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const skip = (pageNum - 1) * limitNum;

        // Base query: only paid, non-cancelled orders
        const query = {
            'payment.status': 'success',
            status: { $ne: 'cancelled' }
        };

        // Optional delivery status filter
        if (deliveryStatus && DELIVERY_STATUSES.includes(deliveryStatus)) {
            query.deliveryStatus = deliveryStatus;
        }

        const [orders, totalCount] = await Promise.all([
            Order.find(query)
                .select('_id items total shippingAddress payment status deliveryStatus deliveredAt createdAt updatedAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Order.countDocuments(query)
        ]);

        const totalPages = Math.ceil(totalCount / limitNum);

        return res.status(200).json({
            statusCode: 200,
            success: true,
            error: null,
            data: orders,
            page: pageNum,
            totalPages,
            totalCount
        });
    } catch (error) {
        console.error('listDeliveryOrders error:', error);
        return res.status(500).json({
            statusCode: 500,
            success: false,
            error: { message: 'Failed to fetch delivery orders' },
            data: null
        });
    }
};

/**
 * Update delivery status for an order
 * PATCH /api/admin/delivery/:orderId
 * Body: { deliveryStatus: "shipped" | "out_for_delivery" | "delivered" }
 * Only allows forward transitions.
 */
export const updateDeliveryStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { deliveryStatus } = req.body;

        // Validate order ID
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                statusCode: 400,
                success: false,
                error: { message: 'Invalid order ID' },
                data: null
            });
        }

        // Validate delivery status value
        if (!deliveryStatus || !DELIVERY_STATUSES.includes(deliveryStatus)) {
            return res.status(400).json({
                statusCode: 400,
                success: false,
                error: { message: `Invalid deliveryStatus. Must be one of: ${DELIVERY_STATUSES.join(', ')}` },
                data: null
            });
        }

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                statusCode: 404,
                success: false,
                error: { message: 'Order not found' },
                data: null
            });
        }

        // Verify eligibility: payment success and not cancelled
        if (order.payment?.status !== 'success') {
            return res.status(400).json({
                statusCode: 400,
                success: false,
                error: { message: 'Delivery status can only be updated for paid orders' },
                data: null
            });
        }

        if (order.status === 'cancelled') {
            return res.status(400).json({
                statusCode: 400,
                success: false,
                error: { message: 'Cannot update delivery status for cancelled orders' },
                data: null
            });
        }

        // Enforce forward-only transitions
        const currentIndex = DELIVERY_STATUSES.indexOf(order.deliveryStatus || 'pending');
        const newIndex = DELIVERY_STATUSES.indexOf(deliveryStatus);

        if (newIndex <= currentIndex) {
            return res.status(400).json({
                statusCode: 400,
                success: false,
                error: {
                    message: `Cannot transition from "${order.deliveryStatus || 'pending'}" to "${deliveryStatus}". Only forward transitions are allowed.`
                },
                data: null
            });
        }

        // Build update
        const updateFields = { deliveryStatus };
        if (deliveryStatus === 'delivered') {
            updateFields.deliveredAt = new Date();
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            updateFields,
            { new: true, runValidators: true }
        )
            .select('_id items total shippingAddress payment status deliveryStatus deliveredAt createdAt updatedAt')
            .lean();

        return res.status(200).json({
            statusCode: 200,
            success: true,
            error: null,
            data: updatedOrder
        });
    } catch (error) {
        console.error('updateDeliveryStatus error:', error);
        return res.status(500).json({
            statusCode: 500,
            success: false,
            error: { message: 'Failed to update delivery status' },
            data: null
        });
    }
};
