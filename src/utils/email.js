/**
 * Kitchen Kettles Email Utility
 * Uses SendGrid for reliable email delivery
 * 
 * Environment Variables Required:
 * - SENDGRID_API_KEY: Your SendGrid API key
 * - EMAIL_FROM: Verified sender email address
 * - APP_URL: Frontend URL (e.g., http://localhost:3000)
 */

import sgMail from '@sendgrid/mail';

// Lazy initialization flag
let isInitialized = false;

/**
 * Initialize SendGrid (called lazily on first email send)
 */
function initializeSendGrid() {
  if (isInitialized) return;

  const apiKey = process.env.SENDGRID_API_KEY;
  if (apiKey) {
    sgMail.setApiKey(apiKey);
    console.log('✅ SendGrid initialized successfully');
    isInitialized = true;
  } else {
    console.error('❌ SENDGRID_API_KEY not set. Email sending will fail.');
  }
}

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

/**
 * Send email using SendGrid
 */
async function sendEmail(to, subject, text, html) {
  // Initialize SendGrid lazily (after dotenv has loaded)
  initializeSendGrid();

  const EMAIL_FROM = process.env.EMAIL_FROM;

  if (!process.env.SENDGRID_API_KEY || !EMAIL_FROM) {
    throw new Error('Email configuration is incomplete. Check SENDGRID_API_KEY and EMAIL_FROM in .env');
  }

  const msg = {
    to,
    from: {
      email: EMAIL_FROM,
      name: 'Kitchen Kettles'
    },
    subject,
    text,
    html
  };

  try {
    const response = await sgMail.send(msg);
    console.log(`✅ Email sent successfully via SendGrid`);
    console.log(`   To: ${to}`);
    console.log(`   Status: ${response[0].statusCode}`);
    return response;
  } catch (error) {
    console.error('❌ SendGrid error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.statusCode);
      console.error('   Body:', JSON.stringify(error.response.body, null, 2));
    }
    throw error;
  }
}

/**
 * Send OTP email to user
 * @param {string} email - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @param {string} username - User's name or email prefix
 * @returns {Promise<void>}
 */
export async function sendOTPEmail(email, otp, username = 'User') {
  const subject = 'Your Kitchen Kettles OTP Code';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%); padding: 30px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; color: #FFFFFF; font-size: 28px; font-weight: bold; letter-spacing: 1px;">
            Kitchen Kettles
          </h1>
          <p style="margin: 8px 0 0 0; color: #FFFFFF; font-size: 14px; opacity: 0.9;">
            Premium Kitchenware & Essentials
          </p>
        </div>
        
        <!-- Content -->
        <div style="background-color: #FFFFFF; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="margin: 0 0 20px 0; color: #1E40AF; font-size: 24px;">
            Hello, ${username}! 👋
          </h2>
          
          <p style="margin: 0 0 25px 0; color: #374151; font-size: 16px; line-height: 1.6;">
            Your one-time password (OTP) for Kitchen Kettles is:
          </p>
          
          <!-- OTP Box -->
          <div style="background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%); border: 2px solid #3B82F6; border-radius: 10px; padding: 25px; text-align: center; margin: 0 0 25px 0;">
            <div style="font-size: 42px; font-weight: bold; color: #1E40AF; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${otp}
            </div>
          </div>
          
          <p style="margin: 0 0 15px 0; color: #374151; font-size: 14px; line-height: 1.6;">
            ⏱️ <strong>This OTP expires in 5 minutes.</strong>
          </p>
          
          <p style="margin: 0 0 25px 0; color: #374151; font-size: 14px; line-height: 1.6;">
            Enter this code to complete your login or signup process.
          </p>
          
          <!-- Security Warning -->
          <div style="background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px; border-radius: 6px; margin: 0 0 20px 0;">
            <p style="margin: 0; color: #991B1B; font-size: 13px; line-height: 1.5;">
              🔒 <strong>Security Notice:</strong> Never share this OTP with anyone. Kitchen Kettles will never ask for your OTP via phone or email.
            </p>
          </div>
          
          <p style="margin: 0; color: #6B7280; font-size: 13px; line-height: 1.5;">
            If you didn't request this OTP, please ignore this email and ensure your account is secure.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; padding: 20px; color: #9CA3AF; font-size: 12px;">
          <p style="margin: 0 0 10px 0;">
            © ${new Date().getFullYear()} Kitchen Kettles. All rights reserved.
          </p>
          <p style="margin: 0;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Hello ${username},

Your Kitchen Kettles OTP code is: ${otp}

This code expires in 5 minutes. Enter it to complete your login or signup.

Security Notice: Never share this OTP with anyone.

If you didn't request this OTP, please ignore this email.

© ${new Date().getFullYear()} Kitchen Kettles
  `.trim();

  try {
    await sendEmail(email, subject, text, html);
    console.log(`✅ OTP email sent to ${email}`);
  } catch (error) {
    console.error('Email send failed:', error.message);
    throw new Error('Failed to send OTP email');
  }
}

/**
 * Send welcome email to new user
 * @param {string} email - Recipient email address
 * @param {string} username - User's name
 * @returns {Promise<void>}
 */
export async function sendWelcomeEmail(email, username = 'User') {
  const subject = 'Welcome to Kitchen Kettles! 🎉';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; color: #FFFFFF; font-size: 32px; font-weight: bold; letter-spacing: 1px;">
            Kitchen Kettles
          </h1>
          <p style="margin: 12px 0 0 0; color: #FFFFFF; font-size: 16px; opacity: 0.95;">
            Premium Kitchenware & Essentials
          </p>
        </div>
        
        <!-- Content -->
        <div style="background-color: #FFFFFF; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="margin: 0 0 20px 0; color: #1E40AF; font-size: 28px;">
            Welcome, ${username}! 🎉
          </h2>
          
          <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
            Thank you for joining <strong>Kitchen Kettles</strong> – your destination for premium kitchenware and culinary essentials!
          </p>
          
          <p style="margin: 0 0 25px 0; color: #374151; font-size: 16px; line-height: 1.6;">
            We're thrilled to have you as part of our community. Get ready to discover high-quality products that will transform your cooking experience.
          </p>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/login" style="display: inline-block; background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%); color: #FFFFFF; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 6px rgba(30, 64, 175, 0.3);">
              Start Shopping
            </a>
          </div>
          
          <!-- Benefits -->
          <div style="background-color: #F9FAFB; border-radius: 8px; padding: 20px; margin: 25px 0;">
            <h3 style="margin: 0 0 15px 0; color: #1E40AF; font-size: 18px;">
              What's Next?
            </h3>
            <ul style="margin: 0; padding: 0 0 0 20px; color: #374151; font-size: 14px; line-height: 1.8;">
              <li>Browse our curated collection of premium kitchenware</li>
              <li>Enjoy exclusive deals and member-only offers</li>
              <li>Track your orders in real-time</li>
              <li>Get personalized product recommendations</li>
            </ul>
          </div>
          
          <p style="margin: 25px 0 0 0; color: #6B7280; font-size: 14px; line-height: 1.6;">
            If you have any questions, our support team is always here to help. Happy shopping!
          </p>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; padding: 20px; color: #9CA3AF; font-size: 12px;">
          <p style="margin: 0 0 10px 0;">
            © ${new Date().getFullYear()} Kitchen Kettles. All rights reserved.
          </p>
          <p style="margin: 0;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Welcome to Kitchen Kettles, ${username}!

Thank you for joining Kitchen Kettles – your destination for premium kitchenware and culinary essentials!

We're thrilled to have you as part of our community. Get ready to discover high-quality products that will transform your cooking experience.

Start shopping now: ${APP_URL}/login

What's Next?
• Browse our curated collection of premium kitchenware
• Enjoy exclusive deals and member-only offers
• Track your orders in real-time
• Get personalized product recommendations

If you have any questions, our support team is always here to help. Happy shopping!

© ${new Date().getFullYear()} Kitchen Kettles
  `.trim();

  try {
    await sendEmail(email, subject, text, html);
    console.log(`✅ Welcome email sent to ${email}`);
  } catch (error) {
    console.error('Email send failed:', error.message);
    // Don't throw - welcome email is non-critical
  }
}

// Backwards-compatible alias for existing code
export { sendOTPEmail as sendEmail };
