import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Coupon from '../models/Coupon.js';
import createError from 'http-errors';

/**
 * Validate and apply coupon server-side
 * Returns { valid: boolean, discountAmount: number, coupon: object, error?: string }
 */
async function validateAndApplyCoupon(couponCode, items) {
  if (!couponCode) {
    return { valid: false, discountAmount: 0 };
  }

  try {
    // Find coupon
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase().trim() })
      .populate('applicableProducts')
      .populate('applicableCategories')
      .populate('applicableBrands');

    if (!coupon) {
      return { valid: false, discountAmount: 0, error: 'Invalid coupon code' };
    }

    // Validate coupon
    if (!coupon.active) {
      return { valid: false, discountAmount: 0, error: 'Coupon is not active' };
    }

    if (coupon.isExpired()) {
      return { valid: false, discountAmount: 0, error: 'Coupon has expired' };
    }

    if (!coupon.hasStarted()) {
      return { valid: false, discountAmount: 0, error: 'Coupon is not yet active' };
    }

    if (coupon.isUsageLimitExceeded()) {
      return { valid: false, discountAmount: 0, error: 'Coupon usage limit exceeded' };
    }

    // Calculate applicable total
    let applicableTotal = 0;
    const applicableProductIds = coupon.applicableProducts.map(p => p._id.toString());
    const applicableCategoryIds = coupon.applicableCategories.map(c => c._id.toString());
    const applicableBrandIds = coupon.applicableBrands.map(b => b._id.toString());

    const isGlobal = applicableProductIds.length === 0 &&
      applicableCategoryIds.length === 0 &&
      applicableBrandIds.length === 0;

    if (isGlobal) {
      // Apply to all items
      applicableTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    } else {
      // Apply to matching items only
      for (const item of items) {
        const matchesProduct = applicableProductIds.includes(item.productId);
        const matchesCategory = item.product?.category && applicableCategoryIds.includes(item.product.category.toString());
        const matchesBrand = item.product?.brand && applicableBrandIds.includes(item.product.brand.toString());

        if (matchesProduct || matchesCategory || matchesBrand) {
          applicableTotal += item.price * item.quantity;
        }
      }
    }

    if (applicableTotal === 0) {
      return { valid: false, discountAmount: 0, error: 'Coupon not applicable to cart items' };
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = applicableTotal * (coupon.value / 100);
    } else if (coupon.type === 'flat') {
      discountAmount = Math.min(coupon.value, applicableTotal);
    }

    discountAmount = Math.round(discountAmount * 100) / 100;

    return { valid: true, discountAmount, coupon };
  } catch (error) {
    console.error('Error validating coupon:', error);
    return { valid: false, discountAmount: 0, error: 'Error validating coupon' };
  }
}

/**
 * Create a new order with product snapshots and computed totals
 * @param {Object} params - Order creation parameters
 * @param {string} params.userId - User ID placing the order
 * @param {Array} params.items - Array of { productId, quantity }
 * @param {Object} params.address - Shipping address
 * @param {string} params.paymentMethod - Payment method (default: 'COD')
 * @param {string} params.couponCode - Optional coupon code
 */
export const createOrder = async ({ userId, items, address, paymentMethod = 'COD', couponCode }) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw createError(400, 'No items provided');
  }

  // Fetch product data from database
  const productIds = items.map(i => i.productId);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });

  if (products.length !== productIds.length) {
    throw createError(400, 'One or more products not found or inactive');
  }

  // Create a map for quick product lookup
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  // Compute subtotals and create order items with product snapshots
  let totalPrice = 0;
  const orderItems = items.map(item => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw createError(400, `Product ${item.productId} not found`);
    }

    // Validate stock availability
    if (product.stock < item.quantity) {
      throw createError(400, `Insufficient stock for ${product.title}. Available: ${product.stock}`);
    }

    // Compute subtotal (server-side only)
    const subtotal = product.price * item.quantity;
    totalPrice += subtotal;

    // Return order item with product snapshot
    return {
      product: product._id,
      title: product.title,
      price: product.price, // Snapshot of price at order time
      qty: item.quantity,
      image: product.images?.[0] || ''
    };
  });

  // Calculate tax (no shipping charges)
  const tax = Math.round(totalPrice * 0.18); // 18% GST
  const originalTotal = totalPrice + tax;

  // Validate and apply coupon if provided
  let discountAmount = 0;
  let appliedCouponId = null;

  if (couponCode) {
    const couponValidation = await validateAndApplyCoupon(couponCode, items.map((item, idx) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: orderItems[idx].price,
      product: productMap.get(item.productId)
    })));

    if (!couponValidation.valid) {
      throw createError(400, couponValidation.error || 'Invalid coupon');
    }

    discountAmount = couponValidation.discountAmount;
    appliedCouponId = couponValidation.coupon._id;

    // Increment coupon usage
    await Coupon.findByIdAndUpdate(appliedCouponId, { $inc: { usedCount: 1 } });
  }

  const finalTotal = originalTotal - discountAmount;

  // Create the order
  const order = await Order.create({
    user: userId,
    items: orderItems,
    subtotal: totalPrice,
    shipping: 0,  // No shipping charges (kept for backward compat)
    tax,
    taxAmount: tax,           // Authoritative GST field (same as tax)
    total: finalTotal,
    totalAmount: finalTotal,  // Authoritative total field (same as finalTotal)
    originalTotal,
    discountAmount,
    couponCode: couponCode ? couponCode.toUpperCase().trim() : null,
    appliedCoupon: appliedCouponId,
    finalTotal,
    shippingAddress: {
      name: address.name || '',
      phone: address.phone || '',
      line1: address.line1,
      line2: address.line2 || '',
      city: address.city,
      state: address.state || '',
      country: address.country || 'India',
      pincode: address.pincode
    },
    payment: {
      method: paymentMethod,
      status: 'init'
    },
    status: 'pending'
  });

  return order;
};

// Backward compatibility
export const create = async ({ userId, items, shippingAddress }) => {
  // Convert old format to new format
  const mappedItems = items.map(i => ({
    productId: i.product,
    quantity: i.qty
  }));

  return createOrder({
    userId,
    items: mappedItems,
    address: shippingAddress,
    paymentMethod: 'COD'
  });
};

export const myOrders = async (userId) => Order.find({ user: userId }).sort({ createdAt: -1 });
