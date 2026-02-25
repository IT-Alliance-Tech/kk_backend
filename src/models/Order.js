import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  title: String,
  price: Number,
  qty: Number,
  image: String,
  // Variant support (optional)
  variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
  variantName: { type: String, default: null },
  // Return tracking (inline, no separate collection)
  returnRequestedQty: { type: Number, default: 0 },
  returnStatus: {
    type: String,
    enum: ['none', 'requested', 'initiated', 'in_process', 'completed'],
    default: 'none'
  },
  returnRequestedAt: { type: Date, default: null }
});
// _id: true (default) — each item has unique _id for item-level targeting

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [orderItemSchema],
  subtotal: Number,
  shipping: Number,
  tax: Number,
  taxAmount: { type: Number, required: true, default: 0 },
  total: Number,
  totalAmount: { type: Number, required: true, default: 0 },

  // Coupon fields
  couponCode: { type: String, default: null },
  discountAmount: { type: Number, default: 0 },
  appliedCoupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  originalTotal: Number, // Total before discount
  finalTotal: Number, // Total after discount (same as total if no coupon)

  // Root-level order status
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

  // Delivery tracking (separate from order.status)
  deliveryStatus: {
    type: String,
    enum: ['pending', 'shipped', 'out_for_delivery', 'delivered'],
    default: 'pending',
    index: true
  },
  deliveredAt: { type: Date, default: null },

  // Inventory tracking flag to prevent double deduction
  stockDeducted: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Order', orderSchema);
