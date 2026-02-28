/**
 * Admin Dashboard Analytics Controller
 * GET /api/admin/dashboard
 *
 * Returns summary KPIs + paginated recent orders.
 * All counts/aggregations run in parallel via Promise.all.
 * Only required fields are projected — no full document load.
 */

import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

// Statuses that count as revenue-generating
const REVENUE_STATUSES = ['accepted', 'processing', 'packed', 'shipped', 'delivered'];

export const getDashboardAnalytics = async (req, res) => {
  try {
    // ── Pagination params ──────────────────────────────────────────────
    const page  = Math.max(1, parseInt(req.query.page  ?? '1',  10));
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit ?? '5', 10)));
    const skip  = (page - 1) * limit;

    // ── Run all independent queries in parallel ────────────────────────
    const [
      revenueResult,
      totalOrders,
      totalProducts,
      totalUsers,
      ordersForPage,
      recentOrders,
    ] = await Promise.all([

      // 1. Revenue aggregation — only non-cancelled statuses
      Order.aggregate([
        { $match: { status: { $in: REVENUE_STATUSES } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),

      // 2. Total order count — fast index scan
      Order.estimatedDocumentCount(),

      // 3. Total active product count — fast index scan on isActive
      Product.countDocuments({ isActive: true }),

      // 4. Total user count — for conversion rate denominator
      User.estimatedDocumentCount(),

      // 5. Total order count for pagination (same as #2, reuse below)
      Order.countDocuments(),

      // 6. Recent orders — projected, sorted, paginated
      Order.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id shippingAddress.name totalAmount status createdAt payment.method')
        .lean(),
    ]);

    const totalRevenue = revenueResult[0]?.total ?? 0;

    // Basic conversion rate: orders / users  (0 if no users)
    const conversionRate = totalUsers > 0
      ? parseFloat(((totalOrders / totalUsers) * 100).toFixed(2))
      : 0;

    const totalPages = Math.ceil(ordersForPage / limit);

    // Normalise recent order shape — only expose what the UI needs
    const recentOrdersData = recentOrders.map((o) => ({
      _id:          o._id,
      customerName: o.shippingAddress?.name ?? 'Guest',
      total:        o.totalAmount ?? 0,
      status:       o.status,
      paymentMethod: o.payment?.method ?? 'COD',
      createdAt:    o.createdAt,
    }));

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        summary: {
          totalRevenue,
          totalOrders,
          totalProducts,
          conversionRate,
        },
        recentOrders: {
          data:       recentOrdersData,
          page,
          totalPages,
          hasMore:    page < totalPages,
        },
      },
    });
  } catch (err) {
    console.error('[dashboard] getDashboardAnalytics error:', err.message, err.stack);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to load dashboard analytics' },
      data: null,
    });
  }
};
