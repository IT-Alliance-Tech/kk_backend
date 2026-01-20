import mongoose from 'mongoose';

const orderItem = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  title: String,
  price: Number,
  qty: Number,
  image: String,
  // Variant support (optional)
  variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
  variantName: { type: String, default: null }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [orderItem],
  subtotal: Number,
  shipping: Number,
  tax: Number,
  total: Number,

  // Coupon fields
  couponCode: { type: String, default: null },
  discountAmount: { type: Number, default: 0 },
  appliedCoupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  originalTotal: Number, // Total before discount
  finalTotal: Number, // Total after discount (same as total if no coupon)

  // Root-level order status
  // Note: 'replace' removed - return/refund logic handled via separate ReturnRequest model
  status: {
    type: String,
    enum: [
      'pending',
      'accepted',
      'processing',
      'packed',
      'shipped',
      'delivered',
      'cancelled',
      'rejected'
    ],
    default: 'pending'
  },

  shippingAddress: {
    name: String,
    phone: String,
    line1: String,
    line2: String,
    city: String,
    state: String,
    country: String,
    pincode: String
  },

  payment: {
    method: { type: String, default: 'COD' }, // phase 2: gateway
    txnId: String,
    // keep payment.status separate and simple
    status: { type: String, default: 'init' }
  },

  // Inventory tracking flag to prevent double deduction
  stockDeducted: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Order', orderSchema);
