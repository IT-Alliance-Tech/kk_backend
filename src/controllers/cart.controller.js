import mongoose from 'mongoose';
import createError from 'http-errors';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import ProductVariant from '../models/ProductVariant.js';

/**
 * Cart Controller
 * 
 * Handles all cart operations including:
 * - Fetching user's cart
 * - Adding products to cart
 * - Updating cart item quantities
 * - Removing items from cart
 * - Clearing entire cart
 * 
 * All endpoints require authentication via auth middleware.
 * Price snapshots are always taken from Product model to prevent price manipulation.
 * 
 * Testing:
 * - GET /api/cart — Fetch cart (empty cart returns { items: [], total: 0 })
 * - POST /api/cart with {"productId":"<id>","qty":2} — Add/update item
 * - PATCH /api/cart/item with {"productId":"<id>","qty":3} — Update quantity
 * - DELETE /api/cart/item with {"productId":"<id>"} — Remove item
 * - POST /api/cart/clear — Clear all items
 */

/**
 * Get user's cart
 * @route GET /api/cart
 * @access Private (requires auth)
 * @returns {Object} Cart with items array and total
 */
export const getCart = async (req, res, next) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return next(createError(401, 'Authentication required'));
    }

    const userId = req.user.id;

    // Find cart for the authenticated user
    let cart = await Cart.findOne({ userId });

    // If no cart exists yet, return empty cart structure
    if (!cart) {
      return res.status(200).json({
        statusCode: 200,
        success: true,
        error: null,
        data: {
          items: [],
          total: 0
        },
        taxSummary: { subtotal: 0, taxAmount: 0, totalAmount: 0 },
        message: 'Cart is empty'
      });
    }

    // Compute tax summary inline (no extra DB query, no shipping)
    const subtotal = cart.total; // pre-save hook already computes sum(price*qty)
    const taxAmount = Math.round(subtotal * 0.18);
    const totalAmount = subtotal + taxAmount;

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: cart,
      taxSummary: { subtotal, taxAmount, totalAmount },
      message: 'Cart retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    next(error);
  }
};

/**
 * Add product to cart or update quantity if already exists
 * Supports variants: if variantId is provided, uses variant price/stock
 * @route POST /api/cart
 * @access Private (requires auth)
 * @body {String} productId - Product ID to add
 * @body {String} [variantId] - Optional variant ID
 * @body {Number} qty - Quantity to add (min: 1)
 * @returns {Object} Updated cart
 */
export const addToCart = async (req, res, next) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return next(createError(401, 'Authentication required'));
    }

    const { productId, variantId, qty } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!productId) {
      return next(createError(400, 'Product ID is required'));
    }

    if (!qty || qty < 1 || !Number.isInteger(qty)) {
      return next(createError(400, 'Quantity must be a positive integer'));
    }

    // Validate productId format
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return next(createError(400, 'Invalid product ID format'));
    }

    // Verify product exists and is active
    const product = await Product.findById(productId);
    if (!product) {
      return next(createError(404, 'Product not found'));
    }

    if (!product.isActive) {
      return next(createError(400, 'Product is not available'));
    }

    // Variables for price, stock, and variant info
    let price, stock, variantName = null, effectiveVariantId = null;
    let firstImage = product.images?.[0] || '';

    // If variantId provided, validate and use variant data
    if (variantId) {
      if (!mongoose.Types.ObjectId.isValid(variantId)) {
        return next(createError(400, 'Invalid variant ID format'));
      }

      const variant = await ProductVariant.findById(variantId);
      if (!variant) {
        return next(createError(404, 'Variant not found'));
      }

      if (variant.product.toString() !== productId) {
        return next(createError(400, 'Variant does not belong to this product'));
      }

      if (!variant.isActive) {
        return next(createError(400, 'Variant is not available'));
      }

      price = variant.price;
      stock = variant.stock;
      variantName = variant.name;
      effectiveVariantId = variant._id;

      // Use variant images if available, else fallback to product images
      if (variant.images && variant.images.length > 0) {
        firstImage = variant.images[0];
      }
    } else {
      // No variant - use product data (backward compatibility)
      price = product.price;
      stock = product.stock;
    }

    // Check stock availability
    if (stock < qty) {
      return next(createError(400, `Only ${stock} items available in stock`));
    }

    // Find or create cart for user
    let cart = await Cart.findOne({ userId });
    let isNewCart = false;

    if (!cart) {
      cart = new Cart({
        userId,
        items: []
      });
      isNewCart = true;
    }

    // Check if this specific product+variant combo already exists in cart
    const existingItem = cart.findItemByProductId(productId, effectiveVariantId);

    if (existingItem) {
      // Item exists - update quantity
      const newQty = existingItem.qty + qty;

      // Check if new quantity exceeds stock
      if (newQty > stock) {
        return next(createError(400, `Cannot add ${qty} more. Only ${stock} items available in stock`));
      }

      existingItem.qty = newQty;
      existingItem.price = price; // Update price snapshot
      existingItem.title = product.title;
      existingItem.variantName = variantName;
      existingItem.image = firstImage;
    } else {
      // New item - add to cart
      const newItem = {
        productId: product._id,
        variantId: effectiveVariantId,
        qty,
        price,
        title: product.title,
        variantName,
        image: firstImage
      };
      cart.items.push(newItem);
    }

    // Save cart (pre-save hook will recalculate total)
    await cart.save();

    return res.status(isNewCart ? 201 : 200).json({
      statusCode: isNewCart ? 201 : 200,
      success: true,
      error: null,
      data: cart,
      message: 'Item added to cart successfully'
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    next(error);
  }
};

/**
 * Update cart item quantity
 * Supports variants: must provide variantId if the cart item has one
 * @route PATCH /api/cart/item
 * @access Private (requires auth)
 * @body {String} productId - Product ID to update
 * @body {String} [variantId] - Optional variant ID (required if item has variant)
 * @body {Number} qty - New quantity (0 or negative removes item)
 * @returns {Object} Updated cart
 */
export const updateCartItem = async (req, res, next) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return next(createError(401, 'Authentication required'));
    }

    const { productId, variantId, qty } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!productId) {
      return next(createError(400, 'Product ID is required'));
    }

    if (qty === undefined || qty === null) {
      return next(createError(400, 'Quantity is required'));
    }

    if (!Number.isInteger(qty)) {
      return next(createError(400, 'Quantity must be an integer'));
    }

    // Validate productId format
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return next(createError(400, 'Invalid product ID format'));
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return next(createError(404, 'Cart not found'));
    }

    // Find the item in cart using composite key (product + variant)
    const effectiveVariantId = variantId || null;
    const itemIndex = cart.items.findIndex(item => {
      const productMatch = item.productId.toString() === productId;
      const variantMatch = effectiveVariantId
        ? (item.variantId && item.variantId.toString() === effectiveVariantId.toString())
        : !item.variantId;
      return productMatch && variantMatch;
    });

    if (itemIndex === -1) {
      return next(createError(404, 'Item not found in cart'));
    }

    // If quantity is 0 or negative, remove the item
    if (qty <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      // Update quantity and verify stock
      let stock;

      if (effectiveVariantId) {
        const variant = await ProductVariant.findById(effectiveVariantId);
        if (variant) {
          stock = variant.stock;
          cart.items[itemIndex].price = variant.price; // Update snapshot
          cart.items[itemIndex].variantName = variant.name;
        }
      } else {
        const product = await Product.findById(productId);
        if (product) {
          stock = product.stock;
          cart.items[itemIndex].price = product.price; // Update snapshot
          cart.items[itemIndex].title = product.title;
          cart.items[itemIndex].image = product.images?.[0] || '';
        }
      }

      if (stock !== undefined && stock < qty) {
        return next(createError(400, `Only ${stock} items available in stock`));
      }

      cart.items[itemIndex].qty = qty;
    }

    // Save cart (pre-save hook will recalculate total)
    await cart.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: cart,
      message: qty <= 0 ? 'Item removed from cart' : 'Cart item updated successfully'
    });
  } catch (error) {
    console.error('Error updating cart item:', error);
    next(error);
  }
};

/**
 * Remove item from cart
 * Supports variants: must provide variantId if the cart item has one
 * @route DELETE /api/cart/item
 * @access Private (requires auth)
 * @body {String} productId - Product ID to remove
 * @body {String} [variantId] - Optional variant ID (required if item has variant)
 * @returns {Object} Updated cart
 */
export const removeCartItem = async (req, res, next) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return next(createError(401, 'Authentication required'));
    }

    const { productId, variantId } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!productId) {
      return next(createError(400, 'Product ID is required'));
    }

    // Validate productId format
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return next(createError(400, 'Invalid product ID format'));
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return next(createError(404, 'Cart not found'));
    }

    // Find the item in cart using composite key
    const effectiveVariantId = variantId || null;
    const itemIndex = cart.items.findIndex(item => {
      const productMatch = item.productId.toString() === productId;
      const variantMatch = effectiveVariantId
        ? (item.variantId && item.variantId.toString() === effectiveVariantId.toString())
        : !item.variantId;
      return productMatch && variantMatch;
    });

    if (itemIndex === -1) {
      return next(createError(404, 'Item not found in cart'));
    }

    // Remove the item
    cart.items.splice(itemIndex, 1);

    // Save cart (pre-save hook will recalculate total)
    await cart.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: cart,
      message: 'Item removed from cart successfully'
    });
  } catch (error) {
    console.error('Error removing cart item:', error);
    next(error);
  }
};

/**
 * Clear all items from cart
 * @route POST /api/cart/clear
 * @access Private (requires auth)
 * @returns {Object} Empty cart
 * @description Useful helper for order creation flow - clears cart after successful order
 */
export const clearCart = async (req, res, next) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return next(createError(401, 'Authentication required'));
    }

    const userId = req.user.id;

    // Find user's cart
    const cart = await Cart.findOne({ userId });

    if (!cart) {
      // No cart exists, return empty cart response
      return res.status(200).json({
        statusCode: 200,
        success: true,
        error: null,
        data: {
          items: [],
          total: 0
        },
        message: 'Cart is already empty'
      });
    }

    // Clear all items
    cart.items = [];

    // Save cart (pre-save hook will set total to 0)
    await cart.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: cart,
      message: 'Cart cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    next(error);
  }
};
