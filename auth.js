/**
 * Authentication and User Management System
 * Handles user accounts, login, signup, password reset
 * Uses localStorage for client-side storage (prototype - would use backend DB in production)
 */

const AUTH_STORAGE_KEY = 'syncspeaker_users';
const CURRENT_USER_KEY = 'syncspeaker_current_user';
const SESSION_KEY = 'syncspeaker_session';

// User tier constants
const TIER = {
  FREE: 'FREE',
  PARTY_PASS: 'PARTY_PASS',
  PRO: 'PRO'
};

/**
 * Get all users from storage
 */
function getAllUsers() {
  try {
    const data = localStorage.getItem(AUTH_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.error('Error loading users:', e);
    return {};
  }
}

/**
 * Save users to storage
 */
function saveUsers(users) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(users));
    return true;
  } catch (e) {
    console.error('Error saving users:', e);
    return false;
  }
}

/**
 * Hash password (simple hash for prototype - use bcrypt in production)
 */
function hashPassword(password) {
  // Simple hash for prototype - in production use bcrypt or similar
  let hash = 0;
  const str = password + 'syncspeaker_salt';
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
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
function signUp(email, password, djName = '') {
  if (!isValidEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }
  
  if (!isValidPassword(password)) {
    return { success: false, error: 'Password must be at least 6 characters' };
  }
  
  const users = getAllUsers();
  
  if (users[email.toLowerCase()]) {
    return { success: false, error: 'Email already registered' };
  }
  
  const user = {
    email: email.toLowerCase(),
    passwordHash: hashPassword(password),
    djName: djName || '',
    guestName: '',
    tier: TIER.FREE,
    createdAt: Date.now(),
    purchaseHistory: [],
    profile: {
      avatar: '🎧',
      stats: {
        totalParties: 0,
        totalTracks: 0,
        totalGuests: 0
      },
      recentParties: [],
      djStats: {
        rank: 'BEGINNER',
        score: 0,
        achievements: []
      }
    }
  };
  
  users[email.toLowerCase()] = user;
  
  if (!saveUsers(users)) {
    return { success: false, error: 'Failed to save user data' };
  }
  
  return { success: true, user: sanitizeUser(user) };
}

/**
 * Log in user
 */
function logIn(email, password) {
  if (!isValidEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }
  
  const users = getAllUsers();
  const user = users[email.toLowerCase()];
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  if (user.passwordHash !== hashPassword(password)) {
    return { success: false, error: 'Incorrect password' };
  }
  
  // Create session
  const session = {
    email: user.email,
    loginTime: Date.now(),
    tier: user.tier
  };
  
  try {
    localStorage.setItem(CURRENT_USER_KEY, user.email);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    return { success: false, error: 'Failed to create session' };
  }
  
  return { success: true, user: sanitizeUser(user) };
}

/**
 * Log out current user
 */
function logOut() {
  try {
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(SESSION_KEY);
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Failed to log out' };
  }
}

/**
 * Get current logged in user
 */
function getCurrentUser() {
  try {
    const email = localStorage.getItem(CURRENT_USER_KEY);
    if (!email) return null;
    
    const users = getAllUsers();
    const user = users[email];
    
    if (!user) {
      // Clean up invalid session
      localStorage.removeItem(CURRENT_USER_KEY);
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    
    return sanitizeUser(user);
  } catch (e) {
    console.error('Error getting current user:', e);
    return null;
  }
}

/**
 * Check if user is logged in
 */
function isLoggedIn() {
  return getCurrentUser() !== null;
}

/**
 * Update user profile
 */
function updateUserProfile(updates) {
  const currentEmail = localStorage.getItem(CURRENT_USER_KEY);
  if (!currentEmail) {
    return { success: false, error: 'Not logged in' };
  }
  
  const users = getAllUsers();
  const user = users[currentEmail];
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  // Update allowed fields
  if (updates.djName !== undefined) user.djName = updates.djName;
  if (updates.guestName !== undefined) user.guestName = updates.guestName;
  if (updates.profile) {
    if (updates.profile.avatar) user.profile.avatar = updates.profile.avatar;
  }
  
  if (!saveUsers(users)) {
    return { success: false, error: 'Failed to save changes' };
  }
  
  return { success: true, user: sanitizeUser(user) };
}

/**
 * Update user tier (for purchases)
 */
function updateUserTier(tier, purchaseInfo = {}) {
  const currentEmail = localStorage.getItem(CURRENT_USER_KEY);
  if (!currentEmail) {
    return { success: false, error: 'Not logged in' };
  }
  
  const users = getAllUsers();
  const user = users[currentEmail];
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  user.tier = tier;
  user.purchaseHistory = user.purchaseHistory || [];
  user.purchaseHistory.push({
    tier,
    date: Date.now(),
    ...purchaseInfo
  });
  
  if (!saveUsers(users)) {
    return { success: false, error: 'Failed to save purchase' };
  }
  
  return { success: true, user: sanitizeUser(user) };
}

/**
 * Update DJ stats
 */
function updateDJStats(updates) {
  const currentEmail = localStorage.getItem(CURRENT_USER_KEY);
  if (!currentEmail) {
    return { success: false, error: 'Not logged in' };
  }
  
  const users = getAllUsers();
  const user = users[currentEmail];
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  // Update stats
  if (updates.score !== undefined) {
    user.profile.djStats.score += updates.score;
    
    // Update rank based on score
    if (user.profile.djStats.score >= 10000) {
      user.profile.djStats.rank = 'LEGEND';
    } else if (user.profile.djStats.score >= 5000) {
      user.profile.djStats.rank = 'MASTER';
    } else if (user.profile.djStats.score >= 2000) {
      user.profile.djStats.rank = 'EXPERT';
    } else if (user.profile.djStats.score >= 500) {
      user.profile.djStats.rank = 'ADVANCED';
    } else if (user.profile.djStats.score >= 100) {
      user.profile.djStats.rank = 'INTERMEDIATE';
    } else {
      user.profile.djStats.rank = 'BEGINNER';
    }
  }
  
  if (updates.achievement) {
    user.profile.djStats.achievements = user.profile.djStats.achievements || [];
    if (!user.profile.djStats.achievements.includes(updates.achievement)) {
      user.profile.djStats.achievements.push(updates.achievement);
    }
  }
  
  if (!saveUsers(users)) {
    return { success: false, error: 'Failed to save stats' };
  }
  
  return { success: true, user: sanitizeUser(user) };
}

/**
 * Update party stats
 */
function updatePartyStats(partyInfo) {
  const currentEmail = localStorage.getItem(CURRENT_USER_KEY);
  if (!currentEmail) return { success: false };
  
  const users = getAllUsers();
  const user = users[currentEmail];
  
  if (!user) return { success: false };
  
  user.profile.stats.totalParties++;
  if (partyInfo.trackCount) user.profile.stats.totalTracks += partyInfo.trackCount;
  if (partyInfo.guestCount) user.profile.stats.totalGuests += partyInfo.guestCount;
  
  user.profile.recentParties = user.profile.recentParties || [];
  user.profile.recentParties.unshift({
    date: Date.now(),
    ...partyInfo
  });
  
  // Keep only last 10 parties
  if (user.profile.recentParties.length > 10) {
    user.profile.recentParties = user.profile.recentParties.slice(0, 10);
  }
  
  saveUsers(users);
  return { success: true };
}

/**
 * Request password reset (in prototype, just generate a reset code)
 */
function requestPasswordReset(email) {
  if (!isValidEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }
  
  const users = getAllUsers();
  const user = users[email.toLowerCase()];
  
  if (!user) {
    // Don't reveal if email exists or not for security
    return { success: true, message: 'If the email exists, a reset code will be sent' };
  }
  
  // Generate reset code (in production, send via email)
  const resetCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  user.resetCode = resetCode;
  user.resetCodeExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes
  
  saveUsers(users);
  
  // In prototype, show the code (in production, email it)
  console.log(`Password reset code for ${email}: ${resetCode}`);
  return { 
    success: true, 
    message: 'Reset code sent',
    debugCode: resetCode // Remove in production!
  };
}

/**
 * Reset password with code
 */
function resetPassword(email, resetCode, newPassword) {
  if (!isValidEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }
  
  if (!isValidPassword(newPassword)) {
    return { success: false, error: 'Password must be at least 6 characters' };
  }
  
  const users = getAllUsers();
  const user = users[email.toLowerCase()];
  
  if (!user || !user.resetCode) {
    return { success: false, error: 'Invalid reset code' };
  }
  
  if (user.resetCode !== resetCode.toUpperCase()) {
    return { success: false, error: 'Invalid reset code' };
  }
  
  if (Date.now() > user.resetCodeExpiry) {
    return { success: false, error: 'Reset code expired' };
  }
  
  user.passwordHash = hashPassword(newPassword);
  delete user.resetCode;
  delete user.resetCodeExpiry;
  
  if (!saveUsers(users)) {
    return { success: false, error: 'Failed to reset password' };
  }
  
  return { success: true, message: 'Password reset successfully' };
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
    isLoggedIn,
    updateUserProfile,
    updateUserTier,
    updateDJStats,
    updatePartyStats,
    requestPasswordReset,
    resetPassword
  };
}
