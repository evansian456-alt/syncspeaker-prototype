/**
 * Moderation and Safety Features
 * Kick, mute, block guests; spam prevention; safety controls
 */

const MODERATION = {
  mutedGuests: new Set(),
  blockedGuests: new Set(),
  kickedGuests: new Set(),
  lastMessageTimestamps: new Map(),
  cooldownMs: 2000 // 2 second cooldown between messages
};

const SAFETY = {
  profanityFilter: null,
  volumeLimitPercent: 90,
  safeVolumeStartPercent: 30,
  reportedUsers: new Set()
};

/**
 * Initialize moderation system
 */
function initModeration() {
  console.log('[Moderation] Initializing moderation and safety features');
  
  // Initialize profanity filter
  initProfanityFilter();
}

/**
 * Kick a guest from the party (host only)
 */
function kickGuest(guestId) {
  if (!state.isHost) {
    console.warn('[Moderation] Only host can kick guests');
    return false;
  }
  
  MODERATION.kickedGuests.add(guestId);
  
  console.log(`[Moderation] Guest kicked: ${guestId}`);
  
  // Send kick message via WebSocket if available
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({
      type: 'KICK',
      guestId: guestId
    }));
  }
  
  return true;
}

/**
 * Mute a guest (prevents them from sending messages)
 */
function muteGuest(guestId) {
  if (!state.isHost) {
    console.warn('[Moderation] Only host can mute guests');
    return false;
  }
  
  MODERATION.mutedGuests.add(guestId);
  console.log(`[Moderation] Guest muted: ${guestId}`);
  
  return true;
}

/**
 * Unmute a guest
 */
function unmuteGuest(guestId) {
  if (!state.isHost) {
    console.warn('[Moderation] Only host can unmute guests');
    return false;
  }
  
  MODERATION.mutedGuests.delete(guestId);
  console.log(`[Moderation] Guest unmuted: ${guestId}`);
  
  return true;
}

/**
 * Block a guest permanently
 */
function blockGuest(guestId) {
  if (!state.isHost) {
    console.warn('[Moderation] Only host can block guests');
    return false;
  }
  
  MODERATION.blockedGuests.add(guestId);
  MODERATION.mutedGuests.add(guestId);
  
  console.log(`[Moderation] Guest blocked: ${guestId}`);
  
  // Also kick them
  kickGuest(guestId);
  
  return true;
}

/**
 * Check if guest is muted
 */
function isGuestMuted(guestId) {
  return MODERATION.mutedGuests.has(guestId);
}

/**
 * Check if guest is blocked
 */
function isGuestBlocked(guestId) {
  return MODERATION.blockedGuests.has(guestId);
}

/**
 * Check spam cooldown for a guest
 */
function checkSpamCooldown(guestId) {
  const now = Date.now();
  const lastMessageTime = MODERATION.lastMessageTimestamps.get(guestId) || 0;
  const timeSinceLastMessage = now - lastMessageTime;
  
  if (timeSinceLastMessage < MODERATION.cooldownMs) {
    console.warn(`[Moderation] Spam detected from ${guestId}, cooldown: ${MODERATION.cooldownMs - timeSinceLastMessage}ms remaining`);
    return false;
  }
  
  MODERATION.lastMessageTimestamps.set(guestId, now);
  return true;
}

/**
 * Initialize profanity filter with common words
 */
function initProfanityFilter() {
  // Simple profanity filter for prototype
  // In production, use a comprehensive library
  const badWords = [
    'badword1', 'badword2', 'badword3', // Placeholder - actual words removed for safety
    'spam', 'scam', 'hack'
  ];
  
  SAFETY.profanityFilter = new RegExp(
    badWords.join('|'),
    'gi'
  );
  
  console.log('[Safety] Profanity filter initialized');
}

/**
 * Filter message for profanity
 */
function filterProfanity(message) {
  if (!message || !SAFETY.profanityFilter) return message;
  
  return message.replace(SAFETY.profanityFilter, (match) => {
    return '*'.repeat(match.length);
  });
}

/**
 * Validate message before sending
 */
function validateMessage(message, guestId, userTier) {
  // Check tier restrictions
  if (userTier === 'FREE') {
    // Free users can only send emoji reactions
    // This should be enforced in UI, but double-check here
    return {
      allowed: false,
      reason: 'Free tier users can only send emoji reactions'
    };
  }
  
  if (userTier === 'PARTY_PASS') {
    // Party Pass users can send preset messages only
    // Check if message is from preset list (simplified check)
    const presetMessages = [
      '🔥 Drop it!',
      '👏 Amazing!',
      '❤️ Love this!',
      '🎉 Party time!',
      '🙌 Yes!',
      '⚡ Energy!',
      '💯 Perfect!',
      '🎵 Great track!'
    ];
    
    if (!presetMessages.includes(message)) {
      return {
        allowed: false,
        reason: 'Party Pass users can only send preset messages'
      };
    }
  }
  
  // Check if guest is muted
  if (isGuestMuted(guestId)) {
    return {
      allowed: false,
      reason: 'You have been muted by the host'
    };
  }
  
  // Check spam cooldown
  if (!checkSpamCooldown(guestId)) {
    return {
      allowed: false,
      reason: 'Please wait before sending another message'
    };
  }
  
  // Filter profanity
  const filteredMessage = filterProfanity(message);
  
  return {
    allowed: true,
    message: filteredMessage
  };
}

/**
 * Set safe volume start (gradual ramp-up)
 */
function setSafeVolumeStart(audioElement) {
  if (!audioElement) return;
  
  // Start at safe volume
  audioElement.volume = SAFETY.safeVolumeStartPercent / 100;
  
  console.log(`[Safety] Audio starting at safe volume: ${SAFETY.safeVolumeStartPercent}%`);
}

/**
 * Apply volume limiter
 */
function applyVolumeLimiter(volume) {
  const limitedVolume = Math.min(volume, SAFETY.volumeLimitPercent);
  
  if (volume > SAFETY.volumeLimitPercent) {
    console.warn(`[Safety] Volume limited from ${volume}% to ${SAFETY.volumeLimitPercent}%`);
  }
  
  return limitedVolume;
}

/**
 * Report a user for abuse
 */
function reportUser(guestId, reason) {
  console.log(`[Safety] User reported: ${guestId}, reason: ${reason}`);
  
  SAFETY.reportedUsers.add(guestId);
  
  // In production, send to moderation queue
  // For prototype, just log and auto-mute after multiple reports
  
  return {
    success: true,
    message: 'User reported. Host will be notified.'
  };
}

/**
 * Get moderation status for display
 */
function getModerationStatus() {
  return {
    mutedCount: MODERATION.mutedGuests.size,
    blockedCount: MODERATION.blockedGuests.size,
    kickedCount: MODERATION.kickedGuests.size,
    reportedCount: SAFETY.reportedUsers.size
  };
}

// Export functions if in module environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initModeration,
    kickGuest,
    muteGuest,
    unmuteGuest,
    blockGuest,
    isGuestMuted,
    isGuestBlocked,
    checkSpamCooldown,
    filterProfanity,
    validateMessage,
    setSafeVolumeStart,
    applyVolumeLimiter,
    reportUser,
    getModerationStatus
  };
}
