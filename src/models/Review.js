import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  name: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, required: true, trim: true },
  verifiedPurchase: { type: Boolean, default: false }
}, { timestamps: true });

// Index for efficient product review queries
reviewSchema.index({ product: 1, createdAt: -1 });

// Compound unique index: prevent duplicate verified reviews per user/product/order
// sparse: true ensures public reviews (without order) aren't constrained
reviewSchema.index({ user: 1, product: 1, order: 1 }, { unique: true, sparse: true });

export default mongoose.model('Review', reviewSchema);
