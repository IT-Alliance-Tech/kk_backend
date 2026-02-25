/**
 * Return Controller (Item-Level)
 * Handles return requests inline on Order items.
 * No separate ReturnRequest collection.
 * No refund logic.
 */

import mongoose from 'mongoose';
import Order from '../models/Order.js';
import createError from 'http-errors';

// Forward-only status order
const RETURN_STATUSES = ['none', 'requested', 'initiated', 'in_process', 'completed'];

/**
 * POST /api/returns/request
 * Body: { orderId, itemId, qty }
 */
export const requestReturn = async (req, res, next) => {
  try {
    const { orderId, itemId, qty } = req.body;
    const userId = req.user.id;

    // Basic validation
    if (!orderId || !itemId || !qty) {
      return next(createError(400, 'orderId, itemId, and qty are required'));
    }
    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return next(createError(400, 'Invalid orderId or itemId'));
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      return next(createError(400, 'qty must be a positive integer'));
    }

    // Fetch order (lean for read, we'll use findOneAndUpdate for write)
    const order = await Order.findOne({ _id: orderId, user: userId })
      .select('items payment deliveryStatus deliveredAt')
      .lean();

    if (!order) {
      return next(createError(404, 'Order not found or does not belong to you'));
    }

    // Payment must be successful
    if (order.payment?.status !== 'success') {
      return next(createError(400, 'Returns are only allowed for successfully paid orders'));
    }

    // Must be delivered
    if (order.deliveryStatus !== 'delivered') {
      return next(createError(400, 'Returns are only allowed for delivered orders'));
    }

    // 5-day window check
    if (!order.deliveredAt) {
      return next(createError(400, 'Delivery date not recorded'));
    }
    const daysSinceDelivery = (Date.now() - new Date(order.deliveredAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDelivery > 5) {
      return next(createError(400, 'Return window closed (5 days exceeded)'));
    }

    // Find item by _id
    const item = order.items.find(i => i._id && i._id.toString() === itemId);
    if (!item) {
      return next(createError(400, 'Item not found in this order'));
    }

    // Qty check
    const maxReturnable = item.qty - (item.returnRequestedQty || 0);
    if (qty > maxReturnable) {
      return next(createError(400, `Cannot return ${qty} items. Maximum returnable: ${maxReturnable}`));
    }

    // Update inline using positional operator
    const newReturnQty = (item.returnRequestedQty || 0) + qty;
    const updated = await Order.findOneAndUpdate(
      { _id: orderId, 'items._id': itemId },
      {
        $set: {
          'items.$.returnRequestedQty': newReturnQty,
          'items.$.returnStatus': 'requested',
          'items.$.returnRequestedAt': new Date()
        }
      },
      { new: true, runValidators: true }
    ).select('items').lean();

    if (!updated) {
      return next(createError(500, 'Failed to update return request'));
    }

    const updatedItem = updated.items.find(i => i._id && i._id.toString() === itemId);

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        orderId,
        itemId,
        returnRequestedQty: updatedItem?.returnRequestedQty || newReturnQty,
        returnStatus: updatedItem?.returnStatus || 'requested'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/returns
 * Query: page, limit, returnStatus
 * Paginated at item level using aggregation
 */
export const adminListReturns = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Optional status filter
    const statusFilter = req.query.returnStatus;
    // After $unwind, `items` is a single object so plain dot notation works
    const itemMatch = statusFilter && RETURN_STATUSES.includes(statusFilter)
      ? { 'items.returnStatus': statusFilter }
      : { 'items.returnStatus': { $exists: true, $nin: ['none', null] } };

    const pipeline = [
      // 1. Pre-filter: orders with at least one item that has a real return status.
      //    Use $elemMatch so the check applies per-element (plain $nin on array
      //    dot-notation excludes documents where ANY element is in the list).
      { $match: { items: { $elemMatch: { returnStatus: { $exists: true, $nin: ['none', null] } } } } },
      // 2. Unwind items
      { $unwind: '$items' },
      // 3. Match individual items with returns
      { $match: itemMatch },
      // 4. Sort by return request date
      { $sort: { 'items.returnRequestedAt': -1 } },
      // 5. Facet for count + paginated data
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                orderId: '$_id',
                itemId: '$items._id',
                productId: '$items.product',
                productTitle: '$items.title',
                productImage: '$items.image',
                qtyOrdered: '$items.qty',
                returnRequestedQty: '$items.returnRequestedQty',
                returnStatus: '$items.returnStatus',
                returnRequestedAt: '$items.returnRequestedAt',
                customerName: '$shippingAddress.name',
                customerPhone: '$shippingAddress.phone',
                shippingAddress: '$shippingAddress',
                createdAt: 1
              }
            }
          ]
        }
      }
    ];

    const [result] = await Order.aggregate(pipeline);

    const total = result.metadata[0]?.total || 0;
    const returns = result.data || [];
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: returns,
      page,
      totalPages,
      totalCount: total
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/returns/:orderId/:itemId
 * Body: { returnStatus: "initiated" | "in_process" | "completed" }
 * Forward-only transitions only.
 */
export const adminUpdateReturnStatus = async (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const { returnStatus } = req.body;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid orderId or itemId' },
        data: null
      });
    }

    // Validate status value
    if (!returnStatus || !RETURN_STATUSES.includes(returnStatus)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: `Invalid returnStatus. Must be one of: ${RETURN_STATUSES.join(', ')}` },
        data: null
      });
    }

    // Fetch order to check current status
    const order = await Order.findById(orderId).select('items').lean();
    if (!order) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Order not found' },
        data: null
      });
    }

    const item = order.items.find(i => i._id.toString() === itemId);
    if (!item) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Item not found in this order' },
        data: null
      });
    }

    // Forward-only enforcement
    const currentIdx = RETURN_STATUSES.indexOf(item.returnStatus || 'none');
    const newIdx = RETURN_STATUSES.indexOf(returnStatus);

    if (newIdx <= currentIdx) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: `Cannot transition from "${item.returnStatus || 'none'}" to "${returnStatus}". Only forward transitions are allowed.`
        },
        data: null
      });
    }

    // Cannot modify if already completed
    if (item.returnStatus === 'completed') {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Cannot modify a completed return' },
        data: null
      });
    }

    // Update
    const updated = await Order.findOneAndUpdate(
      { _id: orderId, 'items._id': itemId },
      { $set: { 'items.$.returnStatus': returnStatus } },
      { new: true, runValidators: true }
    ).select('items').lean();

    if (!updated) {
      return res.status(500).json({
        statusCode: 500,
        success: false,
        error: { message: 'Failed to update return status' },
        data: null
      });
    }

    const updatedItem = updated.items.find(i => i._id.toString() === itemId);

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        orderId,
        itemId,
        returnStatus: updatedItem?.returnStatus,
        returnRequestedQty: updatedItem?.returnRequestedQty
      }
    });
  } catch (error) {
    next(error);
  }
};
