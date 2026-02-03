/**
 * Authentication Middleware and Utilities (Server-side)
 * Handles JWT tokens, password hashing, and auth middleware
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// TEMPORARY HOTFIX: Auth disabled - JWT_SECRET is optional
// This allows the app to run without authentication in production
const AUTH_DISABLED = !process.env.JWT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'syncspeaker-no-auth-mode';

if (AUTH_DISABLED) {
  console.warn('[Auth] ⚠️  TEMPORARY: Authentication is DISABLED (no JWT_SECRET set)');
  console.warn('[Auth] ⚠️  All protected routes will be publicly accessible');
} else if (process.env.NODE_ENV !== 'production') {
  console.warn('[Auth] WARNING: Using JWT secret - development mode');
}

const JWT_EXPIRES_IN = '7d'; // JWT token expires in 7 days
const SALT_ROUNDS = 10;

/**
 * Hash password using bcrypt
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify password against hash
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate JWT token
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Express middleware to check authentication
 * Reads JWT from cookie and adds user info to req.user
 * TEMPORARY HOTFIX: When AUTH_DISABLED, this becomes a no-op passthrough
 */
function requireAuth(req, res, next) {
  // TEMPORARY: If auth is disabled, allow all requests through
  if (AUTH_DISABLED) {
    // Set a unique anonymous user to prevent collisions
    const anonymousId = `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    req.user = { userId: anonymousId, email: 'anonymous@guest.local', djName: 'Guest DJ' };
    return next();
  }
  
  const token = req.cookies?.auth_token;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  req.user = decoded;
  next();
}

/**
 * Optional auth middleware - adds user to req if authenticated, but doesn't require it
 * TEMPORARY HOTFIX: When AUTH_DISABLED, this becomes a no-op passthrough
 */
function optionalAuth(req, res, next) {
  // TEMPORARY: If auth is disabled, skip token verification
  if (AUTH_DISABLED) {
    return next();
  }
  
  const token = req.cookies?.auth_token;
  
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
function isValidPassword(password) {
  if (!password || typeof password !== 'string') {
    return false;
  }
  return password.length >= 6;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  requireAuth,
  optionalAuth,
  isValidEmail,
  isValidPassword
};
