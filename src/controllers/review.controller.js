import { z } from 'zod';
import { isValidObjectId } from 'mongoose';
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';

// VALIDATION SCHEMAS
const createReviewSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product ID is required'),
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    rating: z.number().min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5'),
    comment: z.string().min(1, 'Comment is required').max(1000, 'Comment too long')
  })
});

/**
 * POST /api/reviews
 * Create a new review for a product
 */
export const createReview = async (req, res, next) => {
  try {
    // Validate request body
    const parsed = createReviewSchema.parse({ body: req.body });
    const { productId, name, rating, comment } = parsed.body;

    // Validate productId format
    if (!isValidObjectId(productId)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid product ID format' },
        data: null
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Product not found' },
        data: null
      });
    }

    // Create review
    const review = await Review.create({
      product: productId,
      name: name.trim(),
      rating,
      comment: comment.trim()
    });

    // Update product rating average and count
    await updateProductRating(productId);

    return res.status(201).json({
      statusCode: 201,
      success: true,
      error: null,
      data: review
    });
  } catch (err) {
    // Handle Zod validation errors
    if (err instanceof z.ZodError) {
      const messages = err.errors.map(e => e.message).join(', ');
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: messages },
        data: null
      });
    }
    next(err);
  }
};

/**
 * GET /api/reviews/products/:productId/reviews?page=1
 * Get paginated reviews for a specific product (limit = 3 per page)
 */
export const getProductReviews = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 3; // Fixed limit of 3 reviews per page

    // Validate productId format
    if (!isValidObjectId(productId)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid product ID format' },
        data: null
      });
    }

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Get total count of reviews for this product
    const totalReviews = await Review.countDocuments({ product: productId });

    // Fetch paginated reviews, sorted by newest first
    const reviews = await Review.find({ product: productId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalReviews / limit);
    const hasNextPage = page < totalPages;

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        reviews,
        totalReviews,
        currentPage: page,
        totalPages,
        hasNextPage
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Helper function to update product rating average and count
 */
async function updateProductRating(productId) {
  try {
    const reviews = await Review.find({ product: productId });

    if (reviews.length === 0) {
      await Product.findByIdAndUpdate(productId, {
        'attributes.ratingAvg': 0,
        'attributes.ratingCount': 0
      });
      return;
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const avgRating = totalRating / reviews.length;

    await Product.findByIdAndUpdate(productId, {
      'attributes.ratingAvg': Math.round(avgRating * 10) / 10, // Round to 1 decimal
      'attributes.ratingCount': reviews.length
    });
  } catch (err) {
    console.error('Error updating product rating:', err);
  }
}

/**
 * POST /api/reviews/verified
 * Create a verified purchase review (auth required)
 */
export const createVerifiedReview = async (req, res, next) => {
  try {
    const { productId, orderId, rating, comment } = req.body;
    const userId = req.user.id || req.user._id;

    // Basic validation
    if (!productId || !orderId || !rating || !comment) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'productId, orderId, rating, and comment are required' },
        data: null
      });
    }

    if (!isValidObjectId(productId) || !isValidObjectId(orderId)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid productId or orderId format' },
        data: null
      });
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Rating must be a number between 1 and 5' },
        data: null
      });
    }

    // Fetch order and validate ownership + status
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Order not found' },
        data: null
      });
    }

    if (String(order.user) !== String(userId)) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: { message: 'You do not own this order' },
        data: null
      });
    }

    if (order.payment?.status !== 'success') {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Payment must be successful to leave a review' },
        data: null
      });
    }

    if (order.deliveryStatus !== 'delivered') {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Order must be delivered before you can review' },
        data: null
      });
    }

    // Check product exists in order items
    const itemInOrder = order.items.find(
      item => String(item.product) === String(productId)
    );
    if (!itemInOrder) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'This product is not part of the specified order' },
        data: null
      });
    }

    // Check for duplicate review
    const existingReview = await Review.findOne({
      user: userId,
      product: productId,
      order: orderId
    }).lean();

    if (existingReview) {
      return res.status(409).json({
        statusCode: 409,
        success: false,
        error: { message: 'You have already reviewed this product for this order' },
        data: null
      });
    }

    // Fetch user name for review display
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId).select('name').lean();

    // Create verified review
    const review = await Review.create({
      user: userId,
      product: productId,
      order: orderId,
      name: (user?.name || 'Customer').trim(),
      rating,
      comment: comment.trim(),
      verifiedPurchase: true
    });

    // Update product rating aggregate
    await updateProductRating(productId);

    return res.status(201).json({
      statusCode: 201,
      success: true,
      error: null,
      data: {
        _id: review._id,
        rating: review.rating,
        comment: review.comment,
        verifiedPurchase: review.verifiedPurchase,
        createdAt: review.createdAt
      }
    });
  } catch (err) {
    // Handle MongoDB duplicate key error
    if (err.code === 11000) {
      return res.status(409).json({
        statusCode: 409,
        success: false,
        error: { message: 'You have already reviewed this product for this order' },
        data: null
      });
    }
    next(err);
  }
};

/**
 * GET /api/reviews/order/:orderId/status
 * Returns review status for each product in an order (auth required)
 */
export const getOrderReviewStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id || req.user._id;

    if (!isValidObjectId(orderId)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid order ID format' },
        data: null
      });
    }

    // Fetch order (validate ownership)
    const order = await Order.findOne({ _id: orderId, user: userId })
      .select('items payment deliveryStatus')
      .lean();

    if (!order) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: 'Order not found' },
        data: null
      });
    }

    // Get all product IDs from the order
    const productIds = order.items.map(item => item.product);

    // Fetch all reviews by this user for these products in this order
    const reviews = await Review.find({
      user: userId,
      order: orderId,
      product: { $in: productIds }
    }).select('product _id').lean();

    // Build status map: { productId: reviewId | null }
    const reviewMap = {};
    for (const item of order.items) {
      const pid = String(item.product);
      const found = reviews.find(r => String(r.product) === pid);
      reviewMap[pid] = found ? String(found._id) : null;
    }

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        reviewStatus: reviewMap,
        canReview: order.payment?.status === 'success' && order.deliveryStatus === 'delivered'
      }
    });
  } catch (err) {
    next(err);
  }
};

export const validators = {
  createReviewSchema
};
