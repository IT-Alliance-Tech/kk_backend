/**
 * Admin Homepage Controller
 * Provides admin-only APIs to manage homepage brands and categories
 * Read-only endpoints for centralized homepage management
 */
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import HomepageSettings from '../models/HomepageSettings.js';


export const getHomepageBrands = async (req, res) => {
  try {
    const brands = await Brand
      .find()
      .select('_id name slug isActive showOnHomepage homepageOrder')
      .sort({ homepageOrder: 1, name: 1 })
      .lean();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: brands
    });
  } catch (error) {
    console.error('Admin homepage brands error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to fetch brands for homepage management' },
      data: null
    });
  }
};

/**
 * GET /api/admin/homepage/categories
 * Returns all categories with homepage configuration fields
 * Sorted by homepageOrder (items with order appear first)
 */
export const getHomepageCategories = async (req, res) => {
  try {
    const categories = await Category
      .find()
      .select('_id name slug isActive showOnHomepage homepageOrder')
      .sort({ homepageOrder: 1, name: 1 })
      .lean();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: categories
    });
  } catch (error) {
    console.error('Admin homepage categories error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to fetch categories for homepage management' },
      data: null
    });
  }
};

/**
 * GET /api/admin/homepage/top-picks
 * Returns current pinned products configuration for Top Picks section
 */
export const getTopPicksConfig = async (req, res) => {
  try {
    const settings = await HomepageSettings.getSettings();
    
    // Fetch full product details for pinned products
    const pinnedProducts = await Product
      .find({ 
        _id: { $in: settings.pinnedProductIds },
        isActive: true 
      })
      .select('_id title slug images price mrp stock')
      .lean();
    
    // Preserve order from pinnedProductIds
    const orderedProducts = settings.pinnedProductIds
      .map(id => pinnedProducts.find(p => p._id.toString() === id.toString()))
      .filter(Boolean);

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        pinnedProductIds: settings.pinnedProductIds,
        pinnedProducts: orderedProducts
      }
    });
  } catch (error) {
    console.error('Admin top picks config error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to fetch top picks configuration' },
      data: null
    });
  }
};

/**
 * PUT /api/admin/homepage/top-picks
 * Updates pinned products for Top Picks section
 * Body: { pinnedProductIds: ['id1', 'id2', ...] } - max 8 items
 */
export const updateTopPicksConfig = async (req, res) => {
  try {
    const { pinnedProductIds = [] } = req.body;
    
    // Validate max 8 products
    if (pinnedProductIds.length > 8) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Maximum 8 pinned products allowed' },
        data: null
      });
    }
    
    // Validate all product IDs exist and are active
    if (pinnedProductIds.length > 0) {
      const validProducts = await Product.find({
        _id: { $in: pinnedProductIds },
        isActive: true
      }).select('_id').lean();
      
      const validIds = new Set(validProducts.map(p => p._id.toString()));
      const invalidIds = pinnedProductIds.filter(id => !validIds.has(id.toString()));
      
      if (invalidIds.length > 0) {
        return res.status(400).json({
          statusCode: 400,
          success: false,
          error: { message: `Invalid or inactive product IDs: ${invalidIds.join(', ')}` },
          data: null
        });
      }
    }
    
    // Update settings
    const settings = await HomepageSettings.getSettings();
    settings.pinnedProductIds = pinnedProductIds;
    await settings.save();
    
    // Return updated config
    const pinnedProducts = await Product
      .find({ _id: { $in: pinnedProductIds }, isActive: true })
      .select('_id title slug images price mrp stock')
      .lean();
    
    const orderedProducts = pinnedProductIds
      .map(id => pinnedProducts.find(p => p._id.toString() === id.toString()))
      .filter(Boolean);

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        pinnedProductIds: settings.pinnedProductIds,
        pinnedProducts: orderedProducts
      },
      message: 'Top picks updated successfully'
    });
  } catch (error) {
    console.error('Admin update top picks error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to update top picks configuration' },
      data: null
    });
  }
};

/**
 * GET /api/admin/homepage/products-search
 * Search products for admin to select for top picks
 * Query: ?search=keyword&limit=20&page=1&browse=true
 * - search: filter by product title
 * - limit: max products per page (default 20)
 * - page: page number for pagination (default 1)
 * - browse: if true, returns random products for browsing
 */
export const searchProductsForTopPicks = async (req, res) => {
  try {
    const { search = '', limit = 20, page = 1, browse = 'false' } = req.query;
    const limitNum = Math.min(parseInt(limit) || 20, 50);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const isBrowse = browse === 'true';
    
    const query = { isActive: true };
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    
    // Get total count for pagination
    const totalCount = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);
    
    let products;
    
    if (isBrowse && !search) {
      // Random browse mode - use aggregation with $sample for random selection
      // Skip based on page to get different random sets
      const skip = (pageNum - 1) * limitNum;
      products = await Product.aggregate([
        { $match: query },
        { $skip: skip },
        { $limit: limitNum },
        { $project: { _id: 1, title: 1, slug: 1, images: 1, price: 1, mrp: 1, stock: 1 } }
      ]);
    } else {
      // Normal search or browse with pagination
      const skip = (pageNum - 1) * limitNum;
      products = await Product
        .find(query)
        .select('_id title slug images price mrp stock')
        .sort({ title: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean();
    }

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Admin search products error:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to search products' },
      data: null
    });
  }
};
