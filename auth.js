/**
 * Authentication and User Management System (Client-side)
 * Handles user accounts, login, signup via backend API calls
 * Auth tokens are stored in HTTP-only cookies by the backend
 */

const CURRENT_USER_KEY = 'syncspeaker_current_user';

// User tier constants
const TIER = {
  FREE: 'FREE',
  PARTY_PASS: 'PARTY_PASS',
  PRO: 'PRO'
};

/**
 * Initialize authentication system
 */
async function initAuth() {
  console.log('[Auth] Auth system initializing');
  
  // Check if user is logged in by calling /api/me
  try {
    const user = await getCurrentUser();
    if (user) {
      console.log('[Auth] User is logged in:', user.user.email);
      // Cache user data in localStorage for quick access
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } else {
      console.log('[Auth] No user logged in');
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  } catch (err) {
    console.log('[Auth] No active session');
    localStorage.removeItem(CURRENT_USER_KEY);
  }
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
  return password && password.length >= 6;
}

/**
 * Sign up new user
 */
async function signUp(email, password, djName = '') {
  if (!isValidEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }
  
  if (!isValidPassword(password)) {
    return { success: false, error: 'Password must be at least 6 characters' };
  }
  
  if (!djName || djName.trim().length === 0) {
    return { success: false, error: 'DJ name is required' };
  }
  
  try {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        djName: djName.trim()
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Signup failed' };
    }
    
    // Fetch full user data
    const userData = await getCurrentUser();
    if (userData) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userData));
    }
    
    return { success: true, user: sanitizeUser(data.user) };
  } catch (error) {
    console.error('[Auth] Signup error:', error);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Log in user
 */
async function logIn(email, password) {
  if (!isValidEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Login failed' };
    }
    
    // Fetch full user data
    const userData = await getCurrentUser();
    if (userData) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userData));
    }
    
    return { success: true, user: sanitizeUser(data.user) };
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Log out current user
 */
async function logOut() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST'
    });
    
    localStorage.removeItem(CURRENT_USER_KEY);
    return { success: true };
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    // Still clear local cache even if request fails
    localStorage.removeItem(CURRENT_USER_KEY);
    return { success: false, error: 'Logout failed' };
  }
}

/**
 * Get current logged in user with full profile data
 */
async function getCurrentUser() {
  try {
    const response = await fetch('/api/me');
    
    if (!response.ok) {
      if (response.status === 401) {
        // Not authenticated
        return null;
      }
      throw new Error('Failed to get user');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[Auth] Get user error:', error);
    return null;
  }
}

/**
 * Get cached user data (fast, but may be stale)
 */
function getCachedUser() {
  try {
    const data = localStorage.getItem(CURRENT_USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('[Auth] Error reading cached user:', e);
    return null;
  }
}

/**
 * Check if user is logged in (uses cache)
 */
function isLoggedIn() {
  return getCachedUser() !== null;
}

/**
 * Update user profile (not implemented yet - kept for compatibility)
 */
async function updateUserProfile(updates) {
  console.warn('[Auth] updateUserProfile not yet implemented');
  return { success: false, error: 'Not implemented' };
}

/**
 * Update user tier (not implemented - handled via purchase system)
 */
async function updateUserTier(tier, purchaseInfo = {}) {
  console.warn('[Auth] updateUserTier not needed - handled by purchase system');
  return { success: false, error: 'Use purchase system instead' };
}

/**
 * Update DJ stats (not implemented yet - kept for compatibility)
 */
async function updateDJStats(updates) {
  console.warn('[Auth] updateDJStats not yet implemented');
  return { success: false, error: 'Not implemented' };
}

/**
 * Update party stats (not implemented yet - kept for compatibility)
 */
async function updatePartyStats(partyInfo) {
  console.warn('[Auth] updatePartyStats not yet implemented');
  return { success: false, error: 'Not implemented' };
}

/**
 * Request password reset (not implemented yet - kept for compatibility)
 */
async function requestPasswordReset(email) {
  console.warn('[Auth] requestPasswordReset not yet implemented');
  return { success: false, error: 'Not implemented' };
}

/**
 * Reset password with code (not implemented yet - kept for compatibility)
 */
async function resetPassword(email, resetCode, newPassword) {
  console.warn('[Auth] resetPassword not yet implemented');
  return { success: false, error: 'Not implemented' };
}

/**
 * Remove sensitive data from user object
 */
function sanitizeUser(user) {
  const clean = { ...user };
  delete clean.passwordHash;
  delete clean.resetCode;
  delete clean.resetCodeExpiry;
  return clean;
}

// Export functions (for use in other scripts)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIER,
    signUp,
    logIn,
    logOut,
    getCurrentUser,
    getCachedUser,
    isLoggedIn,
    updateUserProfile,
    updateUserTier,
    updateDJStats,
    updatePartyStats,
    requestPasswordReset,
    resetPassword
  };
}
