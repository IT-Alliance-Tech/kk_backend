// ADMIN: contact submissions
/**
 * Admin Contact Submissions Controller
 * Provides read-only access to contact form submissions for admin users
 */

import ContactSubmission from '../models/ContactSubmission.model.js';


export const listContactSubmissions = async (req, res) => {
  try {
    // Parse pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Validate pagination params
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: 'Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100.' },
        data: null
      });
    }

    // Get total count
    const total = await ContactSubmission.countDocuments();

    // Fetch submissions with pagination sorted by creation date (newest first)
    const submissions = await ContactSubmission.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        submissions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching contact submissions:', error);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: 'Failed to fetch contact submissions' },
      data: null
    });
  }
};
