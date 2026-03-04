import jwt from 'jsonwebtoken';
import createError from 'http-errors';
import User from '../models/User.js';
import OtpToken from '../models/OtpToken.js';
import { generateOTP, hashOTP, compareOTP, expiresAt } from '../utils/otp.js';
import { sendOTPEmail } from '../utils/email.js';

// Safe defaults for OTP and JWT expiry
const OTP_EXPIRE_MIN = process.env.OTP_TTL_MIN || process.env.OTP_EXPIRE_MIN || 5;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

const signTokens = (userId, role) => {
  const access = jwt.sign({ sub: userId, role }, process.env.JWT_SECRET || 'secretkey', { expiresIn: JWT_EXPIRES_IN });
  const refresh = jwt.sign({ sub: userId, role, typ: 'refresh' }, process.env.JWT_SECRET || 'secretkey', { expiresIn: JWT_REFRESH_EXPIRES_IN });
  return { access, refresh };
};

export const requestOtp = async (email, purpose = 'login') => {
  // ── Existence guard: enforce login vs signup intent ──────────────────────
  if (purpose === 'login') {
    // User MUST already exist to receive a login OTP
    const user = await User.findOne({ email });
    if (!user) {
      throw createError(404, 'User not registered');
    }
  } else if (purpose === 'signup') {
    // User must NOT exist yet — prevent duplicate registrations
    const user = await User.findOne({ email });
    if (user) {
      throw createError(409, 'User already registered. Please login.');
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // 🔧 DEV-ONLY: Mock OTP for testing (skip email sending)
  if (process.env.FORCE_MOCK_OTP === 'true') {
    const mockOtp = '123456';
    const otpHash = await hashOTP(mockOtp);
    await OtpToken.create({
      email,
      purpose,
      otpHash,
      expiresAt: expiresAt()
    });
    return { ok: true, debug: true, otp: mockOtp, message: 'Mock OTP created (dev mode)' };
  }

  const code = generateOTP(6);

  // Hash OTP with bcrypt before storing (NEVER store plain text OTP)
  const otpHash = await hashOTP(code);

  const otp = await OtpToken.create({
    email,
    purpose,
    otpHash,
    expiresAt: expiresAt()
  });

  // Extract username from email or fetch from existing user
  let username = email.split('@')[0];
  const existingUser = await User.findOne({ email });
  if (existingUser && existingUser.name) {
    username = existingUser.name;
  }

  // Send OTP via email - handle errors to prevent OTP leakage
  try {
    await sendOTPEmail(email, code, username);
  } catch (error) {
    // Email failed - delete the OTP record and throw error
    await OtpToken.deleteOne({ _id: otp._id });
    throw createError(500, 'Failed to send OTP email. Please try again.');
  }

  // Return success without exposing OTP
  return { ok: true, message: 'OTP sent successfully' };
};

export const verifyOtp = async ({ email, code, purpose = 'login', name }) => {
  const record = await OtpToken.findOne({ email, purpose, consumed: false }).sort({ createdAt: -1 });

  if (!record) throw createError(400, 'OTP not found or already used');
  if (new Date() > record.expiresAt) throw createError(400, 'OTP expired');

  // Compare OTP using bcrypt
  const isValid = await compareOTP(code, record.otpHash);
  if (!isValid) throw createError(400, 'Invalid OTP');

  record.consumed = true;
  await record.save();

  let user = await User.findOne({ email });
  if (!user) {
    if (purpose === 'login') {
      // Should not reach here if requestOtp guard ran, but defend anyway
      throw createError(404, 'User not found. Please register first.');
    } else if (purpose === 'signup') {
      // Create user only on signup
      user = await User.create({ email, name: name || email.split('@')[0] });
    } else {
      throw createError(404, 'User not found');
    }
  }

  const { access, refresh } = signTokens(user._id.toString(), user.role);
  return { user, access, refresh };
};
