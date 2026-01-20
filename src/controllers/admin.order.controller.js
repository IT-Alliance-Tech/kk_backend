// PATCH: explicit HTTP status codes for admin orders
// CONVERTED TO ESM
/**
 * Admin Order Controller
 * Handles admin-only operations for orders and billing
 */

import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ProductVariant from '../models/ProductVariant.js';
import fs from 'fs';
import path from 'path';

/**
 * List orders with pagination, search, filters
 * GET /api/admin/orders
 * Query params: page, limit, search, status, startDate, endDate
 */
export const listOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {};

    // Search by billNumber or customer fields
    if (search) {
      query.$or = [
        { billNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Execute query with pagination
    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(query)
    ]);

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: orders,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('listOrders error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to fetch orders' },
      data: null
    });
  }
};

/**
 * Get order details by ID
 * GET /api/admin/orders/:id
 */
export const getOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid order ID' },
        data: null
      });
    }

    const order = await Order.findById(id).lean();

    if (!order) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Order not found' },
        data: null
      });
    }

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: order
    });
  } catch (error) {
    console.error('getOrder error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to fetch order' },
      data: null
    });
  }
};

/**
 * Update order status
 * PUT /api/admin/orders/:id/status
 * Body: { status: 'pending'|'processing'|'shipped'|'delivered'|'cancelled' }
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid order ID' },
        data: null
      });
    }

    if (!status) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Status is required' },
        data: null
      });
    }

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        data: null
      });
    }

    // Fetch current order to check previous status
    const currentOrder = await Order.findById(id);
    if (!currentOrder) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Order not found' },
        data: null
      });
    }

    const previousStatus = currentOrder.status;

    // --- INVENTORY LOGIC: Stock Deduction ---
    // Deduct stock when order moves to 'accepted' or 'processing'
    if (
      (status === 'accepted' || status === 'processing') &&
      !currentOrder.stockDeducted &&
      previousStatus !== 'accepted' &&
      previousStatus !== 'processing'
    ) {
      try {
        for (const item of currentOrder.items) {
          if (item.variantId) {
            // Variant-level stock
            const variant = await ProductVariant.findById(item.variantId);
            if (variant && variant.stock >= item.qty) {
              await ProductVariant.findByIdAndUpdate(
                item.variantId,
                { $inc: { stock: -item.qty } },
                { new: true }
              );
            } else {
              console.warn(`Insufficient variant stock for ${item.variantId}. Skipping deduction.`);
            }
          } else {
            // Product-level stock
            const product = await Product.findById(item.product);
            if (product && product.stock >= item.qty) {
              await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: -item.qty } },
                { new: true }
              );
            } else {
              console.warn(`Insufficient product stock for ${item.product}. Skipping deduction.`);
            }
          }
        }
        // Mark stock as deducted
        currentOrder.stockDeducted = true;
      } catch (stockError) {
        console.error('Stock deduction error:', stockError);
        // Continue with status update even if stock deduction fails
      }
    }

    // --- INVENTORY LOGIC: Stock Restoration ---
    // Restore stock when order is cancelled or rejected (only if stock was previously deducted)
    if (
      (status === 'cancelled' || status === 'rejected') &&
      currentOrder.stockDeducted &&
      previousStatus !== 'cancelled' &&
      previousStatus !== 'rejected'
    ) {
      try {
        for (const item of currentOrder.items) {
          if (item.variantId) {
            // Restore variant stock
            await ProductVariant.findByIdAndUpdate(
              item.variantId,
              { $inc: { stock: item.qty } },
              { new: true }
            );
          } else {
            // Restore product stock
            await Product.findByIdAndUpdate(
              item.product,
              { $inc: { stock: item.qty } },
              { new: true }
            );
          }
        }
        // Mark stock as not deducted
        currentOrder.stockDeducted = false;
      } catch (stockError) {
        console.error('Stock restoration error:', stockError);
        // Continue with status update even if restoration fails
      }
    }

    // Update order status
    const order = await Order.findByIdAndUpdate(
      id,
      { 
        status,
        stockDeducted: currentOrder.stockDeducted,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).lean();

    if (!order) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Order not found' },
        data: null
      });
    }

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: order
    });
  } catch (error) {
    console.error('updateOrderStatus error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to update order status' },
      data: null
    });
  }
};

/**
 * Assign vendor and driver to order
 * PUT /api/admin/orders/:id/assign
 * Body: { vendorId?, driverId? }
 */
export const assignVendorDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId, driverId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid order ID' },
        data: null
      });
    }

    if (!vendorId && !driverId) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'At least one of vendorId or driverId is required' },
        data: null
      });
    }

    const updateFields = { updatedAt: new Date() };

    if (vendorId) {
      if (!mongoose.Types.ObjectId.isValid(vendorId)) {
        return res.status(400).json({
          statusCode: 400,
          success: false,
          error: { message: 'Invalid vendor ID' },
          data: null
        });
      }
      updateFields.vendorId = vendorId;
    }

    if (driverId) {
      if (!mongoose.Types.ObjectId.isValid(driverId)) {
        return res.status(400).json({
          statusCode: 400,
          success: false,
          error: { message: 'Invalid driver ID' },
          data: null
        });
      }
      updateFields.driverId = driverId;
    }

    const order = await Order.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    ).lean();

    if (!order) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Order not found' },
        data: null
      });
    }

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: order
    });
  } catch (error) {
    console.error('assignVendorDriver error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to assign vendor/driver' },
      data: null
    });
  }
};

/**
 * Upload attachment to order
 * POST /api/admin/orders/:id/upload
 * Multipart: attachment (file)
 */
export const uploadAttachment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid order ID' },
        data: null
      });
    }

    if (!req.file) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'No file uploaded' },
        data: null
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Order not found' },
        data: null
      });
    }

    // Store attachment info
    const attachmentData = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date(),
      uploadedBy: req.user._id
    };

    // Initialize attachments array if it doesn't exist
    if (!order.attachments) {
      order.attachments = [];
    }

    order.attachments.push(attachmentData);
    order.updatedAt = new Date();

    await order.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        orderId: order._id,
        attachment: attachmentData
      }
    });
  } catch (error) {
    console.error('uploadAttachment error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to upload attachment' },
      data: null
    });
  }
};

/**
 * Get invoice JSON payload for an order
 * GET /api/admin/orders/:id/invoice
 */
export const getInvoicePayload = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid order ID' },
        data: null
      });
    }

    const order = await Order.findById(id)
      .populate('items.product', 'name price')
      .lean();

    if (!order) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Order not found' },
        data: null
      });
    }

    // Build invoice payload
    const invoicePayload = {
      invoiceNumber: order.billNumber || order._id,
      invoiceDate: order.createdAt,
      dueDate: order.dueDate || null,
      status: order.status,
      customer: {
        name: order.customer?.name || 'N/A',
        email: order.customer?.email || '',
        phone: order.customer?.phone || '',
        address: order.shippingAddress || order.billingAddress || {}
      },
      items: (order.items || []).map(item => ({
        productId: item.product?._id || item.productId,
        productName: item.product?.name || item.name || 'Unknown',
        quantity: item.quantity || 0,
        unitPrice: item.price || 0,
        total: (item.quantity || 0) * (item.price || 0)
      })),
      subtotal: order.subtotal || 0,
      tax: order.tax || 0,
      shipping: order.shippingCost || 0,
      discount: order.discount || 0,
      total: order.total || 0,
      paymentMethod: order.paymentMethod || 'N/A',
      paymentStatus: order.paymentStatus || 'pending',
      notes: order.notes || ''
    };

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: invoicePayload
    });
  } catch (error) {
    console.error('getInvoicePayload error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to generate invoice' },
      data: null
    });
  }
};

/**
 * Convert quote to order
 * POST /api/admin/orders/:id/convert
 * NOTE: Only works if Quote model exists
 */
export const convertQuoteToOrder = async (req, res) => {
  try {
    // Check if Quote model exists
    let Quote;
    try {
      const quoteModule = await import('../models/Quote.js');
      Quote = quoteModule.default;
    } catch (err) {
      return res.status(501).json({
        statusCode: 501,
        success: false,
        error: { message: 'Quote to Order conversion not implemented. TODO: Create src/models/Quote.js' },
        data: null
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid quote ID' },
        data: null
      });
    }

    const quote = await Quote.findById(id);

    if (!quote) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Quote not found' },
        data: null
      });
    }

    if (quote.status === 'converted') {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Quote already converted to order' },
        data: null
      });
    }

    // Create order from quote
    const orderData = {
      customer: quote.customer,
      items: quote.items,
      subtotal: quote.subtotal,
      tax: quote.tax,
      shipping: quote.shippingCost || 0,
      discount: quote.discount || 0,
      total: quote.total,
      status: 'pending',
      paymentStatus: 'pending',
      shippingAddress: quote.shippingAddress,
      billingAddress: quote.billingAddress,
      notes: `Converted from quote #${quote.quoteNumber || quote._id}`,
      quoteId: quote._id,
      createdBy: req.user._id
    };

    const order = await Order.create(orderData);

    // Update quote status
    quote.status = 'converted';
    quote.orderId = order._id;
    quote.convertedAt = new Date();
    quote.convertedBy = req.user._id;
    await quote.save();

    return res.status(201).json({
      statusCode: 201,
      success: true,
      error: null,
      data: {
        order,
        quoteId: quote._id
      }
    });
  } catch (error) {
    console.error('convertQuoteToOrder error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to convert quote to order' },
      data: null
    });
  }
};
