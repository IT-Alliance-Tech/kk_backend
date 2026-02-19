import { Router } from 'express';
import { protect } from '../middlewares/auth.js';
import { createReview, getProductReviews, createVerifiedReview, getOrderReviewStatus } from '../controllers/review.controller.js';

const router = Router();

// POST /api/reviews - Create a new review (public)
router.post('/', createReview);

// POST /api/reviews/verified - Create a verified purchase review (auth required)
router.post('/verified', protect, createVerifiedReview);

// GET /api/reviews/order/:orderId/status - Get review status for order items (auth required)
router.get('/order/:orderId/status', protect, getOrderReviewStatus);

// GET /api/reviews/products/:productId/reviews - Get all reviews for a product
router.get('/products/:productId/reviews', getProductReviews);

export default router;
