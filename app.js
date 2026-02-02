const FREE_LIMIT = 2;
const API_TIMEOUT_MS = 5000; // 5 second timeout for API calls
const PARTY_LOOKUP_RETRIES = 5; // Number of retries for party lookup (updated for Railway multi-instance)
const PARTY_LOOKUP_RETRY_DELAY_MS = 1000; // Initial delay between retries in milliseconds (exponential backoff)

// Music player state
const musicState = {
  selectedFile: null,
  currentObjectURL: null,
  audioElement: null,
  audioInitialized: false, // Track if audio element event listeners have been set up
  fileInputInitialized: false, // Track if file input handler has been set up
  queuedFile: null, // Next track to play
  queuedObjectURL: null // Object URL for queued track
};

// Debug state for tracking API calls and errors
const debugState = {
  lastEndpoint: null,
  lastError: null
};

const state = {
  ws: null,
  clientId: null,
  code: null,
  isHost: false,
  name: "Guest",
  source: "local",
  isPro: false,
  partyPro: false,
  playing: false,
  adActive: false,
  snapshot: null,
  partyPassActive: false,
  partyPassEndTime: null,
  partyPassTimerInterval: null,
  offlineMode: false, // Track if party was created in offline fallback mode
  chatMode: "OPEN", // OPEN, EMOJI_ONLY, LOCKED
  // Guest-specific state
  nowPlayingFilename: null,
  upNextFilename: null,
  playbackState: "STOPPED", // PLAYING, PAUSED, STOPPED
  lastHostEvent: null, // PLAY, PAUSE, TRACK_SELECTED, NEXT_TRACK_QUEUED, TRACK_CHANGED
  visualMode: "idle", // playing, paused, idle
  connected: false,
  guestVolume: 80,
  // Crowd Energy state
  crowdEnergy: 0, // 0-100
  crowdEnergyPeak: 0,
  crowdEnergyDecayInterval: null,
  // DJ Moments state
  currentMoment: null,
  momentTimeout: null,
  // Session stats for recap
  sessionStats: {
    startTime: null,
    tracksPlayed: 0,
    totalReactions: 0,
    totalShoutouts: 0,
    totalMessages: 0,
    emojiCounts: {},
    peakEnergy: 0
  },
  // Party theme
  partyTheme: "neon", // neon, dark-rave, festival, minimal
  // Guest counter for anonymous names
  nextGuestNumber: 1,
  guestNickname: null
};

// Client-side party code generator for offline fallback
function generatePartyCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const el = (id) => document.getElementById(id);
const toastEl = el("toast");

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 2200);
}

// Update debug panel with last API call and error
function updateDebugPanel(endpoint = null, error = null) {
  if (endpoint) debugState.lastEndpoint = endpoint;
  if (error) debugState.lastError = error;
  
  const debugPanel = el("debugPanel");
  if (!debugPanel) return;
  
  const endpointEl = el("debugEndpoint");
  const errorEl = el("debugError");
  
  if (endpointEl && debugState.lastEndpoint) {
    endpointEl.textContent = debugState.lastEndpoint;
  }
  
  if (errorEl) {
    if (debugState.lastError) {
      errorEl.textContent = debugState.lastError;
      errorEl.style.color = "var(--danger, #ff5a6a)";
    } else {
      errorEl.textContent = "None";
      errorEl.style.color = "var(--text-muted, #888)";
    }
  }
}

function show(id) { el(id).classList.remove("hidden"); }
function hide(id) { el(id).classList.add("hidden"); }

function setPlanPill() {
  const pill = el("planPill");
  if (state.partyPassActive) {
    pill.textContent = "🎉 Party Pass · Active";
  } else if (state.partyPro) {
    pill.textContent = "Supporter · party unlocked";
  } else {
    pill.textContent = "Free · up to 2 phones";
  }
}

function connectWS() {
  return new Promise((resolve, reject) => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${location.host}`;
    console.log("[WS] Connecting to:", wsUrl);
    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    ws.onopen = () => {
      console.log("[WS] Connected successfully");
      resolve();
    };
    ws.onerror = (e) => {
      console.error("[WS] Connection error:", e);
      reject(e);
    };
    ws.onmessage = (ev) => {
      console.log("[WS] Received message:", ev.data);
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      handleServer(msg);
    };
    ws.onclose = () => {
      console.log("[WS] Connection closed");
      toast("Disconnected");
      state.ws = null;
      state.clientId = null;
      showLanding();
    };
  });
}

function send(obj) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    console.error("[WS] Cannot send - WebSocket not connected");
    return;
  }
  console.log("[WS] Sending message:", obj);
  state.ws.send(JSON.stringify(obj));
}

function handleServer(msg) {
  if (msg.t === "WELCOME") { 
    state.clientId = msg.clientId; 
    state.connected = true;
    updateDebugState();
    return; 
  }
  if (msg.t === "CREATED") {
    state.code = msg.code; 
    state.isHost = true; 
    state.connected = true;
    showParty(); 
    toast(`Party created: ${msg.code}`); 
    updateDebugState();
    return;
  }
  if (msg.t === "JOINED") {
    state.code = msg.code; 
    state.isHost = false; 
    state.connected = true;
    showGuest(); 
    toast(`Joined party ${msg.code}`); 
    updateDebugState();
    return;
  }
  if (msg.t === "ROOM") {
    state.snapshot = msg.snapshot;
    // Update chat mode from snapshot
    if (msg.snapshot?.chatMode) {
      state.chatMode = msg.snapshot.chatMode;
      updateChatModeUI();
    }
    // Preserve Party Pass Pro status or detect from members
    const membersPro = (msg.snapshot?.members || []).some(m => m.isPro);
    state.partyPro = state.partyPassActive || membersPro;
    setPlanPill();
    if (state.isHost) {
      renderRoom();
    } else {
      updateGuestPartyStatus();
    }
    updateDebugState();
    return;
  }
  if (msg.t === "ENDED") { 
    state.connected = false;
    state.lastHostEvent = "PARTY_ENDED";
    if (!state.isHost) {
      updateGuestPlaybackState("STOPPED");
      updateGuestVisualMode("idle");
    }
    toast("Party ended (host left)"); 
    showLanding(); 
    updateDebugState();
    return; 
  }
  if (msg.t === "KICKED") { 
    state.connected = false;
    toast("Removed by host"); 
    showLanding(); 
    updateDebugState();
    return; 
  }
  
  // Guest-specific messages
  if (msg.t === "TRACK_SELECTED") {
    state.nowPlayingFilename = msg.filename;
    state.lastHostEvent = "TRACK_SELECTED";
    if (!state.isHost) {
      updateGuestNowPlaying(msg.filename);
      // Don't change playback state yet - wait for PLAY
    }
    updateDebugState();
    return;
  }
  
  if (msg.t === "NEXT_TRACK_QUEUED") {
    state.upNextFilename = msg.filename;
    state.lastHostEvent = "NEXT_TRACK_QUEUED";
    if (!state.isHost) {
      updateGuestUpNext(msg.filename);
    }
    updateDebugState();
    return;
  }
  
  if (msg.t === "PLAY") {
    state.playing = true;
    state.lastHostEvent = "PLAY";
    if (!state.isHost) {
      updateGuestPlaybackState("PLAYING");
      updateGuestVisualMode("playing");
    }
    updateDebugState();
    return;
  }
  
  if (msg.t === "PAUSE") {
    state.playing = false;
    state.lastHostEvent = "PAUSE";
    if (!state.isHost) {
      updateGuestPlaybackState("PAUSED");
      updateGuestVisualMode("paused");
    }
    updateDebugState();
    return;
  }
  
  if (msg.t === "TRACK_CHANGED") {
    state.nowPlayingFilename = msg.filename;
    state.upNextFilename = msg.nextFilename || null;
    state.lastHostEvent = "TRACK_CHANGED";
    if (!state.isHost) {
      updateGuestNowPlaying(msg.filename);
      updateGuestUpNext(msg.nextFilename);
      updateGuestVisualMode("track-change");
      // Flash effect then return to playing
      setTimeout(() => {
        if (state.playing && !state.isHost) {
          updateGuestVisualMode("playing");
        }
      }, 500);
    }
    updateDebugState();
    return;
  }
  
  if (msg.t === "ERROR") {
    toast(msg.message || "Error");
    
    // Reset button state if party creation failed
    const btn = el("btnCreate");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Start party";
    }
    
    return;
  }
  
  // Host-specific messages
  if (msg.t === "GUEST_MESSAGE") {
    if (state.isHost) {
      handleGuestMessageReceived(msg.message, msg.guestName, msg.guestId, msg.isEmoji);
    }
    return;
  }
  
  // Chat mode update
  if (msg.t === "CHAT_MODE_SET") {
    state.chatMode = msg.mode;
    updateChatModeUI();
    updateDebugState();
    return;
  }
}

function showHome() {
  hide("viewLanding"); 
  show("viewHome"); 
  hide("viewParty");
  hide("viewGuest");
  state.code = null; state.isHost = false; state.playing = false; state.adActive = false;
  state.snapshot = null; state.partyPro = false; state.offlineMode = false;
  state.connected = false;
  state.nowPlayingFilename = null;
  state.upNextFilename = null;
  state.playbackState = "STOPPED";
  state.lastHostEvent = null;
  state.visualMode = "idle";
  
  // Cleanup audio and ObjectURL
  cleanupMusicPlayer();
  
  // Clear Party Pass state when leaving party
  if (state.partyPassTimerInterval) {
    clearInterval(state.partyPassTimerInterval);
    state.partyPassTimerInterval = null;
  }
  state.partyPassActive = false;
  state.partyPassEndTime = null;
  
  setPlanPill();
  updateDebugState();
}

function showLanding() {
  show("viewLanding"); 
  hide("viewHome"); 
  hide("viewParty");
  hide("viewGuest");
  state.code = null; state.isHost = false; state.playing = false; state.adActive = false;
  state.snapshot = null; state.partyPro = false; state.offlineMode = false;
  state.connected = false;
  state.nowPlayingFilename = null;
  state.upNextFilename = null;
  state.playbackState = "STOPPED";
  state.lastHostEvent = null;
  state.visualMode = "idle";
  
  // Cleanup audio and ObjectURL
  cleanupMusicPlayer();
  
  // Clear Party Pass state when leaving party
  if (state.partyPassTimerInterval) {
    clearInterval(state.partyPassTimerInterval);
    state.partyPassTimerInterval = null;
  }
  state.partyPassActive = false;
  state.partyPassEndTime = null;
  
  setPlanPill();
  updateDebugState();
}

function showParty() {
  hide("viewLanding"); hide("viewHome"); show("viewParty");
  el("partyTitle").textContent = state.isHost ? "Host party" : "Guest party";
  
  // Display prototype mode message if in offline/local mode
  if (state.offlineMode && state.isHost) {
    el("partyMeta").textContent = "Party created locally (prototype mode)";
    el("partyMeta").style.color = "var(--accent, #5AA9FF)";
    
    // Show offline warning banner
    const warningEl = el("offlineWarning");
    if (warningEl) {
      warningEl.style.display = "flex";
    }
  } else {
    el("partyMeta").textContent = `Source: ${state.source} · You: ${state.name}${state.isHost ? " (Host)" : ""}`;
    el("partyMeta").style.color = "";
    
    // Hide offline warning banner
    const warningEl = el("offlineWarning");
    if (warningEl) {
      warningEl.style.display = "none";
    }
  }
  
  el("partyCode").textContent = state.code || "------";
  
  // Initialize music player now that viewParty is visible
  // This ensures the audio element reference is properly set
  initializeMusicPlayer();
  
  // Check if Party Pass is active for this party
  checkPartyPassStatus();
  
  setPlanPill();
  updatePartyPassUI();
  renderRoom();
  updatePlaybackUI();
  updateQualityUI();
  
  // Initialize session stats when party starts
  if (!state.sessionStats.startTime) {
    initSessionStats();
  }
  
  // Show host-only features
  if (state.isHost) {
    const crowdEnergyCard = el("crowdEnergyCard");
    const djMomentsCard = el("djMomentsCard");
    const hostGiftSection = el("hostGiftSection");
    
    if (crowdEnergyCard) crowdEnergyCard.classList.remove("hidden");
    if (djMomentsCard) djMomentsCard.classList.remove("hidden");
    
    // Show gift section only if not already Pro
    if (hostGiftSection && !state.partyPassActive && !state.partyPro) {
      hostGiftSection.classList.remove("hidden");
    }
  }
}

function showGuest() {
  hide("viewLanding"); 
  hide("viewHome"); 
  hide("viewParty"); 
  show("viewGuest");
  
  // Update guest meta
  el("guestMeta").textContent = `You: ${state.name}`;
  
  // Update party code
  el("guestPartyCode").textContent = state.code || "------";
  
  // Update connection status
  updateGuestConnectionStatus();
  
  // Update party status
  updateGuestPartyStatus();
  
  // Initialize guest UI
  updateGuestNowPlaying(state.nowPlayingFilename);
  updateGuestUpNext(state.upNextFilename);
  updateGuestPlaybackState(state.playbackState);
  updateGuestVisualMode(state.visualMode);
  
  // Setup volume control
  setupGuestVolumeControl();
  
  setPlanPill();
  updateDebugState();
}

function updateGuestConnectionStatus() {
  const statusEl = el("guestConnectionStatus");
  if (!statusEl) return;
  
  if (state.connected) {
    statusEl.textContent = "Connected";
    statusEl.className = "badge";
    statusEl.style.background = "rgba(92, 255, 138, 0.2)";
    statusEl.style.borderColor = "rgba(92, 255, 138, 0.4)";
  } else {
    statusEl.textContent = "Disconnected";
    statusEl.className = "badge";
    statusEl.style.background = "rgba(255, 90, 106, 0.2)";
    statusEl.style.borderColor = "rgba(255, 90, 106, 0.4)";
  }
}

function updateGuestPartyStatus() {
  const statusTextEl = el("guestPartyStatusText");
  const statusIconEl = el("guestPartyStatusBadge")?.querySelector(".party-status-icon");
  const timerEl = el("guestPartyPassTimer");
  
  if (!statusTextEl) return;
  
  if (state.partyPassActive) {
    if (statusIconEl) statusIconEl.textContent = "🎉";
    statusTextEl.textContent = "Party Pass Active";
    if (timerEl && state.partyPassEndTime) {
      const remaining = Math.max(0, state.partyPassEndTime - Date.now());
      const minutes = Math.floor(remaining / 60000);
      timerEl.textContent = `${minutes}m remaining`;
      timerEl.classList.remove("hidden");
    }
  } else if (state.partyPro) {
    if (statusIconEl) statusIconEl.textContent = "💎";
    statusTextEl.textContent = "Pro";
    if (timerEl) timerEl.classList.add("hidden");
  } else {
    if (statusIconEl) statusIconEl.textContent = "✨";
    statusTextEl.textContent = "Free Plan";
    if (timerEl) timerEl.classList.add("hidden");
  }
}

function updateGuestNowPlaying(filename) {
  const filenameEl = el("guestNowPlayingFilename");
  if (!filenameEl) return;
  
  if (filename) {
    filenameEl.textContent = filename;
  } else {
    filenameEl.textContent = "No track selected";
  }
  
  updateDebugState();
}

function updateGuestUpNext(filename) {
  const sectionEl = el("guestUpNextSection");
  const filenameEl = el("guestUpNextFilename");
  
  if (!sectionEl || !filenameEl) return;
  
  if (filename) {
    filenameEl.textContent = filename;
    sectionEl.classList.remove("hidden");
  } else {
    filenameEl.textContent = "No track queued";
    sectionEl.classList.add("hidden");
  }
  
  updateDebugState();
}

function updateGuestPlaybackState(newState) {
  state.playbackState = newState;
  
  const iconEl = el("guestPlaybackStateIcon");
  const textEl = el("guestPlaybackStateText");
  const badgeEl = iconEl?.parentElement;
  
  if (!iconEl || !textEl || !badgeEl) return;
  
  // Remove all state classes
  badgeEl.classList.remove("paused", "stopped");
  
  switch (newState) {
    case "PLAYING":
      iconEl.textContent = "▶️";
      textEl.textContent = "Playing";
      break;
    case "PAUSED":
      iconEl.textContent = "⏸";
      textEl.textContent = "Paused by Host";
      badgeEl.classList.add("paused");
      break;
    case "STOPPED":
    default:
      iconEl.textContent = "⏹";
      textEl.textContent = "Stopped";
      badgeEl.classList.add("stopped");
      break;
  }
  
  updateDebugState();
}

function updateGuestVisualMode(mode) {
  state.visualMode = mode;
  
  const equalizerEl = el("guestEqualizer");
  if (!equalizerEl) return;
  
  // Remove all mode classes
  equalizerEl.classList.remove("playing", "paused", "idle", "track-change");
  
  // Add the new mode class
  if (mode) {
    equalizerEl.classList.add(mode);
  }
  
  updateDebugState();
}

function setupGuestVolumeControl() {
  const sliderEl = el("guestVolumeSlider");
  const valueEl = el("guestVolumeValue");
  
  if (!sliderEl || !valueEl) return;
  
  // Set initial value
  sliderEl.value = state.guestVolume;
  valueEl.textContent = `${state.guestVolume}%`;
  
  // Update on change
  sliderEl.oninput = () => {
    state.guestVolume = parseInt(sliderEl.value);
    valueEl.textContent = `${state.guestVolume}%`;
    // In a real app, this would control local audio volume
  };
}

// DJ Screen Functions
function showDjScreen() {
  const djOverlay = el("djScreenOverlay");
  if (djOverlay) {
    djOverlay.classList.remove("hidden");
    updateDjScreen();
    updateBackToDjButton();
  }
}

function hideDjScreen() {
  const djOverlay = el("djScreenOverlay");
  if (djOverlay) {
    djOverlay.classList.add("hidden");
    updateBackToDjButton();
  }
}

function updateDjScreen() {
  // Update party code
  const djPartyCodeEl = el("djPartyCode");
  if (djPartyCodeEl) {
    djPartyCodeEl.textContent = state.code || "------";
  }
  
  // Update guest count (exclude host)
  const djGuestCountEl = el("djGuestCount");
  if (djGuestCountEl) {
    const guestCount = (state.snapshot?.members || []).filter(m => !m.isHost).length;
    djGuestCountEl.textContent = guestCount;
  }
  
  // Update now playing
  const djNowPlayingEl = el("djNowPlayingTrack");
  if (djNowPlayingEl && musicState.selectedFile) {
    djNowPlayingEl.textContent = musicState.selectedFile.name;
  } else if (djNowPlayingEl) {
    djNowPlayingEl.textContent = "No Track";
  }
  
  // Update up next display
  const djUpNextEl = el("djUpNext");
  const djUpNextTrackEl = el("djUpNextTrack");
  if (djUpNextEl && djUpNextTrackEl) {
    if (musicState.queuedFile) {
      djUpNextEl.classList.remove("hidden");
      djUpNextTrackEl.textContent = musicState.queuedFile.name;
    } else {
      djUpNextEl.classList.add("hidden");
      djUpNextTrackEl.textContent = "No track queued";
    }
  }
}

function updateBackToDjButton() {
  const btnBackToDj = el("btnBackToDj");
  const djOverlay = el("djScreenOverlay");
  
  if (btnBackToDj) {
    // Show button if: host is playing, and DJ screen is hidden
    const djScreenHidden = djOverlay && djOverlay.classList.contains("hidden");
    if (state.isHost && state.playing && djScreenHidden) {
      btnBackToDj.classList.remove("hidden");
    } else {
      btnBackToDj.classList.add("hidden");
    }
  }
}

function handleGuestMessageReceived(message, guestName, guestId, isEmoji) {
  console.log(`[DJ] Received message from ${guestName}: ${message}, isEmoji: ${isEmoji}`);
  
  // Track reaction/message for session stats (Feature 3)
  if (isEmoji) {
    trackReaction(message);
  } else {
    trackMessage(true); // Track as shoutout
  }
  
  // Increase crowd energy (Feature 1)
  increaseCrowdEnergy(isEmoji ? 5 : 8);
  
  // Trigger beat pulse (Feature 8)
  triggerBeatPulse();
  
  // Check for smart upsell opportunities (Feature 4)
  checkSmartUpsell();
  
  // Handle emoji reactions with special visual effects
  if (isEmoji) {
    createEmojiReactionEffect(message);
  }
  
  // Show DJ screen if not already shown and playing
  if (state.playing) {
    showDjScreen();
  }
  
  // Add message to DJ screen
  const messagesContainer = el("djMessagesContainer");
  const noMessagesEl = el("djNoMessages");
  
  if (messagesContainer) {
    // Hide "no messages" text
    if (noMessagesEl) {
      noMessagesEl.style.display = "none";
    }
    
    // Create message element
    const messageEl = document.createElement("div");
    messageEl.className = isEmoji ? "dj-message dj-message-emoji" : "dj-message";
    messageEl.innerHTML = `
      <div class="dj-message-text">${escapeHtml(message)}</div>
      <div class="dj-message-sender">${escapeHtml(guestName)}</div>
    `;
    
    // Add to container
    messagesContainer.appendChild(messageEl);
    
    // Trigger flash effect
    triggerDjFlash();
    
    // Remove message after 5 seconds
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.classList.add("fade-out");
        setTimeout(() => {
          if (messageEl.parentNode) {
            messageEl.parentNode.removeChild(messageEl);
            
            // Show "no messages" if container is empty
            const remainingMessages = messagesContainer.querySelectorAll(".dj-message");
            if (remainingMessages.length === 0 && noMessagesEl) {
              noMessagesEl.style.display = "block";
            }
          }
        }, 300);
      }
    }, 5000);
  }
  
  // Show toast notification
  toast(`${guestName}: ${message}`);
}

function createEmojiReactionEffect(emoji) {
  // Create floating emoji animation on DJ screen
  const djOverlay = el("djScreenOverlay");
  if (!djOverlay) return;
  
  const emojiEl = document.createElement("div");
  emojiEl.className = "emoji-reaction-float";
  emojiEl.textContent = emoji;
  
  // Random horizontal position
  const randomX = Math.random() * 80 + 10; // 10-90% of width
  emojiEl.style.left = `${randomX}%`;
  emojiEl.style.bottom = "10%";
  
  djOverlay.appendChild(emojiEl);
  
  // Remove after animation completes
  setTimeout(() => {
    if (emojiEl.parentNode) {
      emojiEl.parentNode.removeChild(emojiEl);
    }
  }, 2000);
}

function triggerDjFlash() {
  const flashOverlay = el("djFlashOverlay");
  if (flashOverlay) {
    flashOverlay.classList.add("flash-active");
    setTimeout(() => {
      flashOverlay.classList.remove("flash-active");
    }, 200);
  }
}

function setupGuestMessageButtons() {
  const messageButtons = document.querySelectorAll(".btn-guest-message");
  
  messageButtons.forEach(btn => {
    btn.onclick = () => {
      const message = btn.getAttribute("data-message");
      if (message && state.ws) {
        send({ t: "GUEST_MESSAGE", message: message, isEmoji: false });
        
        // Visual feedback
        btn.classList.add("btn-sending");
        setTimeout(() => {
          btn.classList.remove("btn-sending");
        }, 300);
        
        toast(`Sent: ${message}`);
      }
    };
  });
}

function setupEmojiReactionButtons() {
  const emojiButtons = document.querySelectorAll(".btn-emoji-reaction");
  
  emojiButtons.forEach(btn => {
    btn.onclick = () => {
      const emoji = btn.getAttribute("data-emoji");
      const message = btn.getAttribute("data-message") || emoji;
      if (message && state.ws) {
        send({ t: "GUEST_MESSAGE", message: message, isEmoji: true });
        
        // Visual feedback
        btn.classList.add("btn-sending");
        setTimeout(() => {
          btn.classList.remove("btn-sending");
        }, 300);
        
        toast(`Sent: ${emoji}`);
      }
    };
  });
}

function setupChatModeSelector() {
  const chatModeRadios = document.querySelectorAll('input[name="chatMode"]');
  
  chatModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked && state.ws && state.isHost) {
        const mode = e.target.value;
        send({ t: "CHAT_MODE_SET", mode: mode });
        toast(`Chat mode: ${mode}`);
      }
    });
  });
}

function updateChatModeUI() {
  const mode = state.chatMode;
  
  // Update host UI
  if (state.isHost) {
    const radioOpen = el("chatModeOpen");
    const radioEmojiOnly = el("chatModeEmojiOnly");
    const radioLocked = el("chatModeLocked");
    
    if (radioOpen && mode === "OPEN") radioOpen.checked = true;
    if (radioEmojiOnly && mode === "EMOJI_ONLY") radioEmojiOnly.checked = true;
    if (radioLocked && mode === "LOCKED") radioLocked.checked = true;
  }
  
  // Update guest UI
  if (!state.isHost) {
    const badge = el("guestChatModeBadge");
    const icon = el("guestChatModeIcon");
    const text = el("guestChatModeText");
    const textMessages = el("guestTextMessages");
    const emojiReactions = el("guestEmojiReactions");
    
    if (badge) {
      badge.className = "guest-chat-mode-badge";
      if (mode === "EMOJI_ONLY") badge.classList.add("mode-emoji-only");
      if (mode === "LOCKED") badge.classList.add("mode-locked");
    }
    
    if (icon) {
      if (mode === "OPEN") icon.textContent = "💬";
      if (mode === "EMOJI_ONLY") icon.textContent = "😀";
      if (mode === "LOCKED") icon.textContent = "🔒";
    }
    
    if (text) {
      text.textContent = `Chat: ${mode.replace("_", " ")}`;
    }
    
    // Control visibility and interactivity
    if (textMessages) {
      if (mode === "OPEN") {
        textMessages.style.display = "flex";
        textMessages.classList.remove("disabled");
      } else {
        textMessages.style.display = "none";
      }
    }
    
    if (emojiReactions) {
      if (mode === "LOCKED") {
        emojiReactions.classList.add("disabled");
      } else {
        emojiReactions.classList.remove("disabled");
      }
    }
  }
}

function updateDebugState() {
  // Check if debug mode is enabled
  const urlParams = new URLSearchParams(window.location.search);
  const debugEnabled = urlParams.get('debug') === '1' || localStorage.getItem('debug') === 'true';
  
  const debugPanel = el("debugPanel");
  if (!debugPanel) return;
  
  if (debugEnabled) {
    debugPanel.style.display = "block";
    debugPanel.setAttribute("aria-hidden", "false");
    
    // Update all debug fields
    const versionEl = el("debugAppVersion");
    const roleEl = el("debugRole");
    const partyCodeEl = el("debugPartyCode");
    const connectedEl = el("debugConnected");
    const nowPlayingEl = el("debugNowPlaying");
    const upNextEl = el("debugUpNext");
    const playbackStateEl = el("debugPlaybackState");
    const lastHostEventEl = el("debugLastHostEvent");
    const visualModeEl = el("debugVisualMode");
    
    // Fetch and display app version from server
    if (versionEl && versionEl.textContent === "Loading...") {
      fetch("/health").then(res => {
        const version = res.headers.get("X-App-Version") || "Unknown";
        versionEl.textContent = version;
      }).catch(() => {
        versionEl.textContent = "Unknown";
      });
    }
    
    if (roleEl) roleEl.textContent = state.isHost ? "host" : "guest";
    if (partyCodeEl) partyCodeEl.textContent = state.code || "None";
    if (connectedEl) connectedEl.textContent = state.connected ? "true" : "false";
    if (nowPlayingEl) nowPlayingEl.textContent = state.nowPlayingFilename || "None";
    if (upNextEl) upNextEl.textContent = state.upNextFilename || "None";
    if (playbackStateEl) playbackStateEl.textContent = state.playbackState;
    if (lastHostEventEl) lastHostEventEl.textContent = state.lastHostEvent || "None";
    if (visualModeEl) visualModeEl.textContent = state.visualMode;
  } else {
    debugPanel.style.display = "none";
    debugPanel.setAttribute("aria-hidden", "true");
  }
}

function hashStr(s){
  let h = 2166136261;
  for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function computeQualitySnapshot() {
  const n = state.snapshot?.members?.length || 1;
  let base = 90;
  if (state.source === "external") base -= 8;
  if (state.source === "mic") base -= 3;

  let score = base - Math.min(12, (n - 1) * 1.2);
  if (state.code) {
    const seed = hashStr(state.code + ":" + n);
    const wobble = (seed % 9) - 4;
    score += wobble;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  let tier = "Excellent", hint = "Great conditions";
  if (score < 85) { tier = "Good"; hint = "Minor drift possible"; }
  if (score < 70) { tier = "Limited"; hint = "More phones may degrade"; }
  if (score < 50) { tier = "Poor"; hint = "Blocking new joins"; }

  const baseLimit = state.source === "local" ? 6 : (state.source === "mic" ? 5 : 4);
  let rec = baseLimit;
  if (score < 85) rec = Math.max(2, baseLimit - 1);
  if (score < 70) rec = Math.max(2, baseLimit - 2);
  if (score < 50) rec = 2;

  const hardCap = state.source === "local" ? 10 : 8;
  return { score, tier, hint, rec, hardCap, n };
}

function updateQualityUI() {
  const q = computeQualitySnapshot();
  el("qualityScore").textContent = q.score;
  el("qualityTier").textContent = q.tier;
  el("qualityHint").textContent = q.hint;
  el("qualityFill").style.width = `${q.score}%`;
  el("limitsLine").textContent = `Recommended: ${q.rec} · Hard cap: ${q.hardCap}`;

  let col = "rgba(90,169,255,0.7)";
  if (q.score < 85) col = "rgba(255,198,90,0.75)";
  if (q.score < 70) col = "rgba(255,140,90,0.75)";
  if (q.score < 50) col = "rgba(255,90,106,0.75)";
  el("qualityFill").style.background = col;
}

function updatePlaybackUI() {
  el("btnPlay").disabled = state.adActive;
  el("btnPause").disabled = state.adActive;
  const isProOrPartyPass = state.partyPro || state.partyPassActive;
  el("btnAd").disabled = isProOrPartyPass || state.source === "mic";
  el("adLine").textContent = isProOrPartyPass ? "No ads (Pro)"
    : (state.source === "mic" ? "No ads in mic mode" : "Ads interrupt playback for free users.");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// Music file handling functions
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function updateMusicStatus(message, isError = false) {
  const statusEl = el("statusMessage");
  if (statusEl) {
    statusEl.textContent = message;
    if (isError) {
      statusEl.style.color = "var(--danger)";
    } else {
      statusEl.style.color = "var(--text)";
    }
  }
  console.log(`[Music] Status: ${message}`);
}

function showMusicWarning(message, isError = false) {
  const warningEl = el("musicWarning");
  if (warningEl) {
    warningEl.textContent = message;
    warningEl.classList.remove("hidden");
    if (isError) {
      warningEl.classList.add("error");
    } else {
      warningEl.classList.remove("error");
    }
  }
}

function hideMusicWarning() {
  const warningEl = el("musicWarning");
  if (warningEl) {
    warningEl.classList.add("hidden");
    warningEl.classList.remove("error");
  }
}

function cleanupMusicPlayer() {
  // Stop audio playback
  const audioEl = musicState.audioElement;
  if (audioEl) {
    audioEl.pause();
    audioEl.src = "";
    audioEl.load(); // Reset the audio element
  }
  
  // Revoke ObjectURL to prevent memory leak
  if (musicState.currentObjectURL) {
    URL.revokeObjectURL(musicState.currentObjectURL);
    musicState.currentObjectURL = null;
  }
  
  // Reset music state
  musicState.selectedFile = null;
  
  console.log("[Music] Player cleaned up");
}

function playQueuedTrack() {
  if (!musicState.queuedFile || !musicState.queuedObjectURL) {
    console.log("[DJ Queue] No queued track available");
    toast("No track queued");
    return;
  }

  console.log(`[DJ Queue] Playing queued track: ${musicState.queuedFile.name}`);

  // Clean up current track
  if (musicState.currentObjectURL) {
    URL.revokeObjectURL(musicState.currentObjectURL);
  }

  // Move queued track to current
  musicState.selectedFile = musicState.queuedFile;
  musicState.currentObjectURL = musicState.queuedObjectURL;

  // Clear queue
  musicState.queuedFile = null;
  musicState.queuedObjectURL = null;

  // Update audio element
  const audioEl = musicState.audioElement;
  if (audioEl && musicState.currentObjectURL) {
    audioEl.src = musicState.currentObjectURL;
    audioEl.load();
    
    // Auto-play the queued track
    audioEl.play()
      .then(() => {
        state.playing = true;
        updateMusicStatus(`Playing: ${musicState.selectedFile.name}`);
        console.log("[DJ Queue] Auto-playing queued track");
        
        // Track play for session stats (Feature 3)
        if (!state.sessionStats.tracksPlayed) {
          state.sessionStats.tracksPlayed = 1;
        }
        
        // Start beat-aware UI (Feature 8)
        startBeatPulse();
        
        // Update DJ screen
        updateDjScreen();
        
        // Show DJ screen for host
        if (state.isHost) {
          showDjScreen();
        }
        
        // Broadcast to guests
        if (state.isHost && state.ws) {
          send({ t: "HOST_PLAY" });
        }
        
        // Update back to DJ button visibility
        updateBackToDjButton();
      })
      .catch((error) => {
        console.error("[DJ Queue] Auto-play failed:", error);
        updateMusicStatus(`Ready: ${musicState.selectedFile.name}`);
        toast("Track loaded. Press play to start.");
      });
  } else {
    console.log("[DJ Queue] Playing in simulated mode");
    state.playing = true;
    updateMusicStatus(`Playing: ${musicState.selectedFile.name} (simulated)`);
    
    // Track play for session stats (Feature 3)
    if (!state.sessionStats.tracksPlayed) {
      state.sessionStats.tracksPlayed = 1;
    }
    
    // Start beat-aware UI (Feature 8)
    startBeatPulse();
    
    updateDjScreen();
    
    // Show DJ screen for host even in simulated mode
    if (state.isHost) {
      showDjScreen();
    }
    
    // Update back to DJ button visibility
    updateBackToDjButton();
  }

  toast(`♫ Now playing: ${musicState.selectedFile.name}`);
}

function checkFileTypeSupport(file) {
  const audio = musicState.audioElement || document.createElement("audio");
  
  // Try to check if the browser can play this file type
  if (file.type) {
    const canPlay = audio.canPlayType(file.type);
    if (canPlay === "" || canPlay === "no") {
      return false;
    }
  } else {
    // If file.type is empty, check file extension as fallback
    const extension = file.name.split('.').pop().toLowerCase();
    const commonFormats = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus'];
    if (!commonFormats.includes(extension)) {
      return false;
    }
  }
  
  return true;
}

function handleMusicFileSelection(file) {
  if (!file) return;
  
  console.log(`[Music] File selected:`, file.name, file.type, file.size);
  
  // Revoke old ObjectURL to prevent memory leaks
  if (musicState.currentObjectURL) {
    URL.revokeObjectURL(musicState.currentObjectURL);
    musicState.currentObjectURL = null;
  }
  
  hideMusicWarning();
  
  // Store the selected file
  musicState.selectedFile = file;
  
  // Show file info
  const filenameEl = el("musicFilename");
  const filesizeEl = el("musicFilesize");
  const infoEl = el("musicInfo");
  
  if (filenameEl) filenameEl.textContent = file.name;
  if (filesizeEl) filesizeEl.textContent = formatFileSize(file.size);
  if (infoEl) infoEl.classList.remove("hidden");
  
  // Show "Change file" button, hide "Choose music file" button
  const chooseBtnEl = el("btnChooseMusic");
  const changeBtnEl = el("btnChangeMusic");
  if (chooseBtnEl) chooseBtnEl.classList.add("hidden");
  if (changeBtnEl) changeBtnEl.classList.remove("hidden");
  
  // Check file size (50MB = 52428800 bytes)
  const MAX_SIZE = 52428800;
  const warnings = [];
  
  if (file.size > MAX_SIZE) {
    warnings.push("⚠️ Large file — may take longer to load or stream.");
  }
  
  // Check if browser can play this file type
  const canPlay = checkFileTypeSupport(file);
  if (!canPlay) {
    warnings.push("⚠️ This file type may not play on this device. Try MP3 or M4A.");
  }
  
  // Display warnings
  if (warnings.length > 0) {
    showMusicWarning(warnings.join(" "), !canPlay);
  }
  
  // Create ObjectURL and set audio source
  const objectURL = URL.createObjectURL(file);
  musicState.currentObjectURL = objectURL;
  
  const audioEl = musicState.audioElement;
  if (audioEl) {
    audioEl.src = objectURL;
    audioEl.load(); // Force buffering/loading, especially important for iOS Safari
    updateMusicStatus(`File selected: ${file.name}`);
    
    // Broadcast TRACK_SELECTED to guests
    if (state.isHost && state.ws) {
      state.nowPlayingFilename = file.name;
      send({ t: "HOST_TRACK_SELECTED", filename: file.name });
    }
  }
  
  toast(`✓ Music file selected: ${file.name}`);
}

function initializeMusicPlayer() {
  console.log("[Music] initializeMusicPlayer() called");
  
  // Initialize audio element and its event listeners
  const audioEl = el("hostAudioPlayer");
  console.log("[Music] Audio element found:", !!audioEl);
  
  if (audioEl) {
    // Always update the element reference
    musicState.audioElement = audioEl;
    console.log("[Music] Audio element reference updated");
    
    // Restore the audio src if a file was previously selected
    if (musicState.currentObjectURL) {
      audioEl.src = musicState.currentObjectURL;
      console.log("[Music] Restored audio src to audio element");
    }
    
    // Only add event listeners once
    if (!musicState.audioInitialized) {
      console.log("[Music] Setting up audio element event listeners");
      musicState.audioInitialized = true;
      
      // Audio event listeners
      audioEl.addEventListener("play", () => {
        state.playing = true;
        updateMusicStatus("Playing…");
      });
      
      audioEl.addEventListener("pause", () => {
        state.playing = false;
        updateMusicStatus("Paused");
      });
      
      audioEl.addEventListener("ended", () => {
        state.playing = false;
        updateMusicStatus("Ended");
        
        // Auto-play queued track if available
        if (musicState.queuedFile && state.isHost) {
          console.log("[DJ Queue] Current track ended, playing queued track");
          setTimeout(() => {
            playQueuedTrack();
          }, 500); // Small delay to ensure smooth transition
        }
      });
      
      audioEl.addEventListener("error", (e) => {
        // Only show error if a file was actually selected
        if (!musicState.selectedFile) {
          return;
        }
        
        console.error("[Music] Audio error:", e);
        let errorMsg = "Error: Unable to play this file";
        
        if (audioEl.error) {
          // Use numeric values instead of MediaError constants for better compatibility
          switch (audioEl.error.code) {
            case 1: // MEDIA_ERR_ABORTED
              errorMsg = "Error: Playback aborted";
              break;
            case 2: // MEDIA_ERR_NETWORK
              errorMsg = "Error: Network error";
              break;
            case 3: // MEDIA_ERR_DECODE
              errorMsg = "Error: File format not supported or corrupted";
              break;
            case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
              errorMsg = "Error: File type not supported on this device";
              break;
          }
        }
        
        updateMusicStatus(errorMsg, true);
        showMusicWarning(errorMsg + ". Try a different file format (MP3, M4A).", true);
      });
      
      audioEl.addEventListener("loadedmetadata", () => {
        console.log("[Music] Audio loaded, duration:", audioEl.duration);
      });
    }
  } else {
    console.warn("[Music] Audio element not found - viewParty may not be visible yet");
  }
  
  // File input handler - only set up once
  if (!musicState.fileInputInitialized) {
    const fileInputEl = el("musicFileInput");
    if (fileInputEl) {
      console.log("[Music] Setting up file input handler");
      musicState.fileInputInitialized = true;
      
      fileInputEl.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          handleMusicFileSelection(file);
        }
      });
    }
  }
  
  // Choose music button - set up onclick handlers
  const chooseBtnEl = el("btnChooseMusic");
  if (chooseBtnEl) {
    chooseBtnEl.onclick = () => {
      const fileInputEl = el("musicFileInput");
      if (fileInputEl) {
        fileInputEl.click();
      }
    };
  }
  
  // Change file button
  const changeBtnEl = el("btnChangeMusic");
  if (changeBtnEl) {
    changeBtnEl.onclick = () => {
      const fileInputEl = el("musicFileInput");
      if (fileInputEl) {
        fileInputEl.click();
      }
    };
  }
}


function activatePartyPass() {
  if (!state.code) {
    toast("Join or start a party first!");
    return;
  }
  
  if (state.partyPassActive) {
    toast("Party Pass already active!");
    return;
  }
  
  // Set 2 hours from now
  const twoHours = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
  state.partyPassEndTime = Date.now() + twoHours;
  state.partyPassActive = true;
  state.partyPro = true; // Party Pass gives Pro benefits
  state.isPro = true; // Mark this client as Pro
  
  // Notify server that this client is now Pro (makes whole party Pro)
  send({ t: "SET_PRO", isPro: true });
  
  // Store in localStorage for this party
  if (state.code) {
    localStorage.setItem(`partyPass_${state.code}`, JSON.stringify({
      endTime: state.partyPassEndTime,
      active: true
    }));
  }
  
  // Start the timer - update every minute instead of every second
  updatePartyPassTimer();
  if (state.partyPassTimerInterval) {
    clearInterval(state.partyPassTimerInterval);
  }
  state.partyPassTimerInterval = setInterval(updatePartyPassTimer, 60000); // Update every minute
  
  // Update UI
  setPlanPill();
  updatePartyPassUI();
  updatePlaybackUI();
  
  toast("🎉 Party Pass activated! Enjoy 2 hours of Pro features!");
}

function updatePartyPassTimer() {
  if (!state.partyPassActive || !state.partyPassEndTime) return;
  
  const now = Date.now();
  const remaining = state.partyPassEndTime - now;
  
  if (remaining <= 0) {
    // Party Pass expired
    expirePartyPass();
    return;
  }
  
  // Calculate hours and minutes
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  
  const timerEl = el("partyPassTimer");
  if (timerEl) {
    timerEl.textContent = `${hours}h ${minutes}m remaining`;
  }
}

function expirePartyPass() {
  state.partyPassActive = false;
  state.partyPassEndTime = null;
  // Check if any members have regular Pro (not Party Pass)
  state.partyPro = state.snapshot?.members?.some(m => m.isPro) || false;
  
  if (state.partyPassTimerInterval) {
    clearInterval(state.partyPassTimerInterval);
    state.partyPassTimerInterval = null;
  }
  
  // Remove from localStorage
  if (state.code) {
    localStorage.removeItem(`partyPass_${state.code}`);
  }
  
  setPlanPill();
  updatePartyPassUI();
  updatePlaybackUI();
  
  toast("⏰ Party Pass has expired");
}

function updatePartyPassUI() {
  const banner = el("partyPassBanner");
  const activeStatus = el("partyPassActive");
  const upgradeCard = el("partyPassUpgrade");
  const descEl = el("partyPassDesc");
  const titleEl = el("partyPassTitle");
  const timerEl = el("partyPassTimer");
  
  if (!banner || !activeStatus || !upgradeCard) return;
  
  if (state.partyPassActive) {
    // Host with active Party Pass
    banner.classList.remove("hidden");
    activeStatus.classList.remove("hidden");
    upgradeCard.classList.add("hidden");
    
    if (titleEl) titleEl.textContent = "Party Pass Active";
    if (descEl) descEl.classList.add("hidden");
    if (timerEl) timerEl.classList.remove("hidden");
  } else if (state.partyPro && !state.isHost) {
    // Friend in a Pro/Party Pass party
    banner.classList.remove("hidden");
    activeStatus.classList.remove("hidden");
    upgradeCard.classList.add("hidden");
    
    if (titleEl) titleEl.textContent = "🎉 Party Pass Active";
    if (descEl) descEl.classList.remove("hidden");
    if (timerEl) timerEl.classList.add("hidden");
  } else if (!state.partyPro && state.isHost) {
    // Show upgrade banner for free users on host page
    banner.classList.remove("hidden");
    activeStatus.classList.add("hidden");
    upgradeCard.classList.remove("hidden");
  } else {
    // Hide banner
    banner.classList.add("hidden");
  }
}

function checkPartyPassStatus() {
  if (!state.code) return;
  
  const stored = localStorage.getItem(`partyPass_${state.code}`);
  if (!stored) return;
  
  try {
    const data = JSON.parse(stored);
    if (data.active && data.endTime && state.isHost) {
      const now = Date.now();
      if (data.endTime > now) {
        // Party Pass is still valid - restore it from localStorage (only hosts can restore)
        state.partyPassActive = true;
        state.partyPassEndTime = data.endTime;
        state.partyPro = true;
        
        // Start the timer
        updatePartyPassTimer();
        if (state.partyPassTimerInterval) {
          clearInterval(state.partyPassTimerInterval);
        }
        state.partyPassTimerInterval = setInterval(updatePartyPassTimer, 60000); // Update every minute
        
        setPlanPill();
        updatePartyPassUI();
        updatePlaybackUI();
      } else {
        // Party Pass has expired
        localStorage.removeItem(`partyPass_${state.code}`);
      }
    }
  } catch (e) {
    console.error("Error loading Party Pass state:", e);
  }
}

function renderRoom() {
  const wrap = el("members");
  wrap.innerHTML = "";
  const members = state.snapshot?.members || [];

  members.forEach(m => {
    const div = document.createElement("div");
    div.className = "member";
    const left = document.createElement("div");
    left.innerHTML = `
      <div class="name">${escapeHtml(m.name)} ${m.isHost ? '<span class="badge">Host</span>' : ''}</div>
      <div class="meta">${m.isPro ? "Pro" : "Free"} · ID ${m.id}</div>
    `;
    const right = document.createElement("div");
    if (state.isHost && !m.isHost) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Remove";
      btn.onclick = () => send({ t: "KICK", targetId: m.id });
      right.appendChild(btn);
    } else {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = m.isPro ? "Pro" : "Free";
      right.appendChild(badge);
    }
    div.appendChild(left); div.appendChild(right);
    wrap.appendChild(div);
  });

  updateQualityUI();
  updatePlaybackUI();
  updatePartyPassUI();
}

function openPaywall() { show("modalPaywall"); }
function closePaywall(){ hide("modalPaywall"); }
function openWarn(rec, next) {
  el("warnText").textContent =
    `Recommended is \${rec} phones for the best sound. You’re adding phone #\${next}. This might cause a small delay or echo.`;
  show("modalWarn");
}
function closeWarn(){ hide("modalWarn"); }
function openSpeaker(){ show("modalSpeaker"); }
function closeSpeaker(){ hide("modalSpeaker"); }

function attemptAddPhone() {
  const q = computeQualitySnapshot();
  const next = q.n + 1;

  if (next > q.hardCap) { toast(`Hard cap reached (${q.hardCap})`); return; }
  if (q.score < 50) { toast("Connection is weak — try moving closer or using a hotspot"); return; }

  const isProOrPartyPass = state.partyPro || state.partyPassActive;
  if (!isProOrPartyPass && next > FREE_LIMIT) { openPaywall(); return; }

  if (next > q.rec) {
    if (!isProOrPartyPass) { openPaywall(); return; }
    openWarn(q.rec, next); return;
  }

  toast("Open this link on another phone and tap Join");
}

(async function init(){
  // TODO: Enable real-time sync later in native app
  // For browser prototype, we skip WebSocket connection for Start Party to work instantly
  // await connectWS();
  showLanding();
  
  // Initialize music player
  initializeMusicPlayer();

  // Landing page navigation
  el("btnLandingStart").onclick = () => {
    console.log("[UI] Landing: Start Party clicked");
    showHome();
  };

  el("btnLandingJoin").onclick = () => {
    console.log("[UI] Landing: Join Party clicked");
    showHome();
  };

  el("btnCreate").onclick = async () => {
    console.log("[UI] Start party button clicked");
    const btn = el("btnCreate");
    const statusEl = el("partyStatus");
    const messageEl = el("createStatusMessage");
    
    // Prevent multiple clicks - check if button is already disabled
    if (btn.disabled) {
      console.log("[UI] Button already processing, ignoring click");
      return;
    }
    
    // Helper function to update status
    const updateStatus = (message, isError = false) => {
      if (statusEl) statusEl.classList.remove("hidden");
      if (messageEl) {
        messageEl.textContent = message;
        messageEl.style.color = isError ? "var(--danger, #ff5a6a)" : "var(--text, #fff)";
      }
      console.log(`[Party] ${message}`);
    };
    
    try {
      btn.disabled = true;
      btn.textContent = "Creating party...";
      updateStatus("Creating party…");
      
      // Apply guest anonymity (Feature 7)
      applyGuestAnonymity();
      
      // Get user configuration
      state.source = "local"; // Always use local source for music from phone
      state.isPro = el("togglePro").checked;
      console.log("[UI] Creating party with:", { name: state.name, source: state.source, isPro: state.isPro });
      
      // Call server API to create party
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      
      const response = await fetch("/api/create-party", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Handle 503 (Service Unavailable - Redis not ready)
      if (response.status === 503) {
        const errorData = await response.json().catch(() => ({ error: "Server not ready" }));
        const errorMsg = errorData.error || "Server not ready - Redis unavailable";
        updateStatus(errorMsg, true);
        throw new Error("Server not ready. Please wait a moment and try again.");
      }
      
      // Handle other error responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        const errorMsg = errorData.error || `Server error: ${response.status}`;
        updateStatus(errorMsg, true);
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      const partyCode = data.partyCode;
      
      console.log("[Party] Party created via API:", partyCode);
      
      // Set party state
      state.code = partyCode;
      state.isHost = true;
      state.offlineMode = false; // Mark as server-backed mode
      
      // Initialize snapshot with host member
      state.snapshot = {
        members: [{
          id: "host-" + Date.now(),
          name: state.name,
          isHost: true,
          isPro: state.isPro
        }]
      };
      
      // Show party view
      showParty();
      
      // Show success toast
      toast(`Party created: ${partyCode}`);
      
      // Hide status
      if (statusEl) statusEl.classList.add("hidden");
      
    } catch (error) {
      console.error("[Party] Error creating party:", error);
      
      // Check if it's a network error (server not running)
      if (error.name === "AbortError") {
        updateStatus("Server not responding. Is the server running?", true);
      } else if (error.message.includes("Failed to fetch")) {
        updateStatus("Cannot reach server. Is the server running?", true);
      } else {
        updateStatus(error.message || "Failed to create party", true);
      }
      
      // Re-enable button
      btn.disabled = false;
      btn.textContent = "Start party";
    }
  };

  el("btnJoin").onclick = async () => {
    console.log("[UI] Join party button clicked");
    const btn = el("btnJoin");
    const statusEl = el("joinStatus");
    const messageEl = el("joinStatusMessage");
    const debugEl = el("joinDebugInfo");
    const code = el("joinCode").value.trim().toUpperCase();
    
    if (!code) {
      toast("Enter a party code");
      return;
    }
    
    // Prevent multiple clicks
    if (btn.disabled) {
      console.log("[UI] Button already processing, ignoring click");
      return;
    }
    
    // Helper function to update status
    const updateStatus = (message, isError = false) => {
      if (statusEl) statusEl.classList.remove("hidden");
      if (messageEl) {
        messageEl.textContent = message;
        messageEl.style.color = isError ? "var(--danger, #ff5a6a)" : "var(--text, #fff)";
      }
      console.log(`[Party] ${message}`);
    };
    
    // Helper function to update debug info
    const updateDebug = (message) => {
      if (debugEl) {
        debugEl.textContent = message;
      }
    };
    
    try {
      btn.disabled = true;
      btn.textContent = "Joining...";
      updateStatus("Connecting to party…");
      
      // Apply guest anonymity (Feature 7)
      applyGuestAnonymity();
      
      state.isPro = el("togglePro").checked;
      console.log("[UI] Joining party with:", { code, name: state.name, isPro: state.isPro });
      
      // Retry logic for party lookup with exponential backoff
      let lastError = null;
      let response = null;
      
      for (let attempt = 1; attempt <= PARTY_LOOKUP_RETRIES; attempt++) {
        try {
          // Update status with retry count and exponential backoff info
          if (attempt > 1) {
            updateStatus(`Connecting to party… (attempt ${attempt}/${PARTY_LOOKUP_RETRIES})`);
          } else {
            updateStatus("Connecting to party…");
          }
          
          // Create AbortController for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
          
          const endpoint = "POST /api/join-party";
          updateDebug(`Endpoint: ${endpoint} (attempt ${attempt})`);
          updateDebugPanel(endpoint, null);
          
          response = await fetch("/api/join-party", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              partyCode: code
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          // If we get a response, break out of retry loop
          break;
        } catch (fetchError) {
          lastError = fetchError;
          console.log(`[Party] Join attempt ${attempt} failed:`, fetchError.message);
          
          // If this is not the last attempt and it's a network/timeout error, retry with exponential backoff
          if (attempt < PARTY_LOOKUP_RETRIES) {
            const backoffDelay = PARTY_LOOKUP_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            console.log(`[Party] Retrying in ${backoffDelay}ms...`);
            updateDebug(`Network error - retrying in ${backoffDelay}ms`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }
        }
      }
      
      // If all retries failed, throw error
      if (!response && lastError) {
        // Provide browser-only mode friendly error messages
        let errorMsg;
        if (lastError.name === "AbortError") {
          errorMsg = "Server not responding. Try again.";
        } else if (lastError.message.includes("Failed to fetch")) {
          errorMsg = "Multi-device sync requires the server to be running. Use 'npm start' to enable joining parties.";
        } else {
          errorMsg = lastError.message;
        }
        
        const endpoint = "POST /api/join-party";
        updateDebugPanel(endpoint, `${endpoint} (${lastError.name === "AbortError" ? "timeout" : "network error"})`);
        throw new Error(errorMsg);
      }
      
      updateStatus("Server responded…");
      
      // Check for 501 (Unsupported method) which happens with simple HTTP servers
      if (response.status === 501) {
        const errorMsg = "Multi-device sync requires the server to be running. Use 'npm start' to enable joining parties.";
        const endpoint = "POST /api/join-party";
        updateDebugPanel(endpoint, "Server doesn't support POST (browser-only mode)");
        throw new Error(errorMsg);
      }
      
      // Check for 503 (Service Unavailable - Redis not ready)
      if (response.status === 503) {
        const errorData = await response.json().catch(() => ({ error: "Server not ready" }));
        const errorMsg = errorData.error || "Server not ready - Redis unavailable";
        const endpoint = "POST /api/join-party";
        updateDebugPanel(endpoint, `HTTP 503: ${errorMsg}`);
        updateDebug(`HTTP 503 - ${errorMsg}`);
        updateStatus("Server is starting up. Please wait a moment and try again.", true);
        throw new Error("Server is starting up. Please wait a moment and try again.");
      }
      
      // Handle all error responses with exact backend message
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        const errorMsg = errorData.error || `Server error: ${response.status}`;
        const endpoint = "POST /api/join-party";
        const statusMessage = `HTTP ${response.status}: ${errorMsg}`;
        updateDebugPanel(endpoint, statusMessage);
        updateDebug(`HTTP ${response.status} - ${errorMsg}`);
        
        // Provide actionable error message for 404
        if (response.status === 404) {
          updateStatus("Party not found. Please check the code and try again.", true);
          throw new Error("Party not found. Please check the code and try again.");
        }
        
        // For other errors, display exact backend message
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      console.log("[API] Join response:", data);
      updateDebugPanel(endpoint, null); // Clear error on success
      
      updateStatus(`Joining party ${code}…`);
      
      // Now connect via WebSocket and join the party
      send({ t: "JOIN", code, name: state.name, isPro: state.isPro });
      
      // The WebSocket handler will call showParty() when JOINED message is received
      // Clear status after a short delay
      setTimeout(() => {
        if (statusEl) statusEl.classList.add("hidden");
      }, 2000);
      
    } catch (error) {
      console.error("[Party] Error joining party:", error);
      updateStatus(error.message || "Error joining party. Try again.", true);
      
      // Show toast with error
      toast(error.message || "Error joining party");
    } finally {
      // ALWAYS re-enable button and reset text
      btn.disabled = false;
      btn.textContent = "Join party";
    }
  };

  el("togglePro").onchange = (e) => {
    state.isPro = !!e.target.checked;
    send({ t: "SET_PRO", isPro: state.isPro });
  };

  el("btnLeave").onclick = () => { 
    // Show party recap before leaving
    if (state.isHost) {
      showPartyRecap();
    }
    
    if (state.ws) {
      state.ws.close(); 
    } else {
      // In prototype mode (no WebSocket), navigate back to landing manually
      if (!state.isHost) {
        showLanding();
      }
    }
  };

  // Guest leave button handler
  const btnGuestLeave = el("btnGuestLeave");
  if (btnGuestLeave) {
    btnGuestLeave.onclick = () => {
      if (state.ws) {
        state.ws.close();
      } else {
        showLanding();
      }
    };
  }

  el("btnCopy").onclick = async () => {
    if (state.offlineMode) {
      toast("⚠️ Prototype mode - code won't work for joining from other devices");
      return;
    }
    try { await navigator.clipboard.writeText(state.code || ""); toast("Copied code"); }
    catch { toast("Copy failed (permission)"); }
  };

  el("btnPlay").onclick = () => {
    if (state.adActive) return;
    
    const audioEl = musicState.audioElement;
    if (audioEl && audioEl.src && musicState.selectedFile) {
      // Play from user gesture
      audioEl.play()
        .then(() => {
          state.playing = true;
          updateMusicStatus("Playing…");
          console.log("[Music] Playback started");
          
          // Track play for session stats (Feature 3)
          if (!state.sessionStats.tracksPlayed) {
            state.sessionStats.tracksPlayed = 1;
          }
          
          // Start beat-aware UI (Feature 8)
          startBeatPulse();
          
          // Show DJ screen for host
          if (state.isHost) {
            showDjScreen();
          }
          
          // Broadcast PLAY to guests
          if (state.isHost && state.ws) {
            send({ t: "HOST_PLAY" });
          }
          
          // Update back to DJ button visibility
          updateBackToDjButton();
        })
        .catch((error) => {
          console.error("[Music] Play failed:", error);
          let errorMsg = "Error: Playback failed";
          
          if (error.name === "NotAllowedError") {
            errorMsg = "⚠️ Your browser blocked autoplay. Tap Play to start audio.";
            showMusicWarning(errorMsg, false);
          } else if (error.name === "NotSupportedError") {
            errorMsg = "Error: File type not supported";
            showMusicWarning(errorMsg + ". Try MP3 or M4A.", true);
          } else {
            errorMsg = `Error: ${error.message || "Unable to play"}`;
            showMusicWarning(errorMsg, true);
          }
          
          updateMusicStatus(errorMsg, true);
          toast(errorMsg);
        });
    } else if (musicState.queuedFile && musicState.queuedObjectURL) {
      // If no current track but there's a queued track, play it
      console.log("[Music] No current track, playing queued track");
      playQueuedTrack();
    } else {
      state.playing = true;
      updateMusicStatus("Play (simulated - no music file loaded)");
      toast("Play (simulated)");
      
      // Track play for session stats (Feature 3)
      if (!state.sessionStats.tracksPlayed) {
        state.sessionStats.tracksPlayed = 1;
      }
      
      // Start beat-aware UI (Feature 8)
      startBeatPulse();
      
      // Show DJ screen for host even in simulated mode
      if (state.isHost) {
        showDjScreen();
      }
      
      // Broadcast PLAY to guests even in simulated mode
      if (state.isHost && state.ws) {
        send({ t: "HOST_PLAY" });
      }
      
      // Update back to DJ button visibility
      updateBackToDjButton();
    }
  };
  
  el("btnPause").onclick = () => {
    if (state.adActive) return;
    
    const audioEl = musicState.audioElement;
    if (audioEl && audioEl.src && musicState.selectedFile) {
      audioEl.pause();
      state.playing = false;
      updateMusicStatus("Paused");
    } else {
      state.playing = false;
      updateMusicStatus("Pause (simulated)");
      toast("Pause (simulated)");
    }
    
    // Stop beat-aware UI (Feature 8)
    stopBeatPulse();
    
    // Broadcast PAUSE to guests
    if (state.isHost && state.ws) {
      send({ t: "HOST_PAUSE" });
    }
    
    // Update back to DJ button visibility (should hide when paused)
    updateBackToDjButton();
  };

  el("btnAd").onclick = () => {
    if (state.partyPro || state.partyPassActive || state.source === "mic") return;
    state.adActive = true; state.playing = false; updatePlaybackUI();
    toast("Ad (20s) — supporters remove ads");
    setTimeout(() => { state.adActive = false; updatePlaybackUI(); toast("Ad finished"); }, 20000);
  };

  // DJ Screen Controls
  const btnCloseDj = el("btnCloseDj");
  if (btnCloseDj) {
    btnCloseDj.onclick = () => {
      hideDjScreen();
    };
  }

  const btnDjPlay = el("btnDjPlay");
  if (btnDjPlay) {
    btnDjPlay.onclick = () => {
      // Trigger the main play button
      el("btnPlay").click();
    };
  }

  const btnDjPause = el("btnDjPause");
  if (btnDjPause) {
    btnDjPause.onclick = () => {
      // Trigger the main pause button
      el("btnPause").click();
    };
  }

  const btnDjNext = el("btnDjNext");
  if (btnDjNext) {
    btnDjNext.onclick = () => {
      // Play queued track if available
      if (musicState.queuedFile) {
        playQueuedTrack();
      } else {
        toast("No track queued");
      }
    };
  }

  // Back to DJ View button
  const btnBackToDj = el("btnBackToDj");
  if (btnBackToDj) {
    btnBackToDj.onclick = () => {
      showDjScreen();
    };
  }

  // DJ Queue Track button
  const btnDjQueueTrack = el("btnDjQueueTrack");
  const djQueueFileInput = el("djQueueFileInput");
  if (btnDjQueueTrack && djQueueFileInput) {
    btnDjQueueTrack.onclick = () => {
      djQueueFileInput.click();
    };

    djQueueFileInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-m4a', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/aac'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|ogg|webm|aac)$/i)) {
        toast("⚠️ Invalid file type. Please select an audio file.");
        return;
      }

      // Clean up old queued file URL
      if (musicState.queuedObjectURL) {
        URL.revokeObjectURL(musicState.queuedObjectURL);
      }

      // Store queued file
      musicState.queuedFile = file;
      musicState.queuedObjectURL = URL.createObjectURL(file);

      toast(`✓ Queued: ${file.name}`);
      console.log(`[DJ Queue] Queued next track: ${file.name}`);
      
      // Update DJ screen to show queued track
      updateDjScreen();

      // Clear the file input so the same file can be selected again
      djQueueFileInput.value = '';
    };
  }

  // Setup guest message buttons
  setupGuestMessageButtons();
  
  // Setup emoji reaction buttons
  setupEmojiReactionButtons();
  
  // Setup chat mode selector (for host)
  setupChatModeSelector();

  el("btnAddPhone").onclick = attemptAddPhone;

  el("btnSpeaker").onclick = () => { if (!state.partyPro && !state.partyPassActive) openPaywall(); else openSpeaker(); };

  el("btnProYes").onclick = () => {
    el("togglePro").checked = true;
    state.isPro = true;
    send({ t: "SET_PRO", isPro: true });
    closePaywall();
    toast("Support mode on (this device)");
  };
  el("btnProNo").onclick = closePaywall;

  el("btnWarnCancel").onclick = closeWarn;
  el("btnWarnAnyway").onclick = () => { closeWarn(); toast("Okay — you chose to add more phones"); };

  el("btnSpeakerOk").onclick = closeSpeaker;

  // Party Pass activation buttons
  const btnActivateLanding = el("btnActivatePartyPassLanding");
  if (btnActivateLanding) {
    btnActivateLanding.onclick = () => {
      toast("Start a party to activate Party Pass");
      showHome();
    };
  }

  const btnActivateParty = el("btnActivatePartyPass");
  if (btnActivateParty) {
    btnActivateParty.onclick = () => {
      activatePartyPass();
    };
  }

  // Pro Monthly subscription button
  const btnSubscribeMonthly = el("btnSubscribeMonthly");
  if (btnSubscribeMonthly) {
    btnSubscribeMonthly.onclick = () => {
      console.log("[UI] Subscribe Monthly clicked");
      showHome();
    };
  }
})();


// ========================================
// FEATURE 1: CROWD ENERGY METER
// ========================================

function initCrowdEnergyMeter() {
  // Start decay interval
  if (state.crowdEnergyDecayInterval) {
    clearInterval(state.crowdEnergyDecayInterval);
  }
  
  state.crowdEnergyDecayInterval = setInterval(() => {
    if (state.crowdEnergy > 0) {
      state.crowdEnergy = Math.max(0, state.crowdEnergy - 1);
      updateCrowdEnergyDisplay();
    }
  }, 2000); // Decay by 1 every 2 seconds
}

function increaseCrowdEnergy(amount = 5) {
  state.crowdEnergy = Math.min(100, state.crowdEnergy + amount);
  if (state.crowdEnergy > state.crowdEnergyPeak) {
    state.crowdEnergyPeak = state.crowdEnergy;
    if (state.crowdEnergyPeak > state.sessionStats.peakEnergy) {
      state.sessionStats.peakEnergy = state.crowdEnergyPeak;
    }
  }
  updateCrowdEnergyDisplay();
}

function updateCrowdEnergyDisplay() {
  const valueEl = el("crowdEnergyValue");
  const fillEl = el("crowdEnergyFill");
  const peakEl = el("crowdEnergyPeakIndicator");
  const peakValueEl = el("crowdEnergyPeakValue");
  
  if (valueEl) valueEl.textContent = Math.round(state.crowdEnergy);
  if (fillEl) fillEl.style.width = `${state.crowdEnergy}%`;
  if (peakEl) peakEl.style.left = `${state.crowdEnergyPeak}%`;
  if (peakValueEl) peakValueEl.textContent = Math.round(state.crowdEnergyPeak);
  
  // Apply energy-based glow effects
  const card = el("crowdEnergyCard");
  if (card) {
    card.classList.remove("energy-glow-low", "energy-glow-medium", "energy-glow-high");
    if (state.crowdEnergy > 70) {
      card.classList.add("energy-glow-high");
    } else if (state.crowdEnergy > 40) {
      card.classList.add("energy-glow-medium");
    } else if (state.crowdEnergy > 10) {
      card.classList.add("energy-glow-low");
    }
  }
  
  // Update DJ screen crowd energy display
  const djValueEl = el("djCrowdEnergyValue");
  const djFillEl = el("djCrowdEnergyFill");
  const djPeakEl = el("djCrowdEnergyPeakIndicator");
  const djPeakValueEl = el("djCrowdEnergyPeakValue");
  
  if (djValueEl) djValueEl.textContent = Math.round(state.crowdEnergy);
  if (djFillEl) djFillEl.style.width = `${state.crowdEnergy}%`;
  if (djPeakEl) djPeakEl.style.left = `${state.crowdEnergyPeak}%`;
  if (djPeakValueEl) djPeakValueEl.textContent = Math.round(state.crowdEnergyPeak);
}

// ========================================
// FEATURE 2: DJ MOMENT BUTTONS
// ========================================

function initDJMoments() {
  const momentButtons = document.querySelectorAll(".btn-dj-moment, .btn-dj-moment-view");
  momentButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const moment = btn.dataset.moment;
      triggerDJMoment(moment);
    });
  });
}

function triggerDJMoment(moment) {
  // Clear previous moment
  if (state.momentTimeout) {
    clearTimeout(state.momentTimeout);
  }
  
  // Set current moment
  state.currentMoment = moment;
  
  // Update party view UI
  const currentMomentDisplay = el("currentMomentDisplay");
  const currentMomentValue = el("currentMomentValue");
  
  if (currentMomentDisplay) {
    currentMomentDisplay.classList.remove("hidden");
  }
  if (currentMomentValue) {
    currentMomentValue.textContent = moment.replace("_", " ");
  }
  
  // Update DJ screen UI
  const djCurrentMomentDisplay = el("djCurrentMomentDisplay");
  const djCurrentMomentValue = el("djCurrentMomentValue");
  
  if (djCurrentMomentDisplay) {
    djCurrentMomentDisplay.classList.remove("hidden");
  }
  if (djCurrentMomentValue) {
    djCurrentMomentValue.textContent = moment.replace("_", " ");
  }
  
  // Update button states (both party view and DJ view)
  document.querySelectorAll(".btn-dj-moment, .btn-dj-moment-view").forEach(btn => {
    if (btn.dataset.moment === moment) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  
  // Apply visual effects
  applyMomentEffect(moment);
  
  // Auto-clear after 8 seconds
  state.momentTimeout = setTimeout(() => {
    state.currentMoment = null;
    if (currentMomentDisplay) {
      currentMomentDisplay.classList.add("hidden");
    }
    if (djCurrentMomentDisplay) {
      djCurrentMomentDisplay.classList.add("hidden");
    }
    document.querySelectorAll(".btn-dj-moment, .btn-dj-moment-view").forEach(btn => {
      btn.classList.remove("active");
    });
  }, 8000);
  
  toast(`DJ Moment: ${moment.replace("_", " ")}`);
}

function applyMomentEffect(moment) {
  const partyView = el("viewParty");
  if (!partyView) return;
  
  // Remove all effect classes
  partyView.classList.remove(
    "moment-effect-drop",
    "moment-effect-build", 
    "moment-effect-break",
    "moment-effect-hands-up"
  );
  
  // Add appropriate effect class
  const effectClass = `moment-effect-${moment.toLowerCase().replace("_", "-")}`;
  partyView.classList.add(effectClass);
  
  // Remove class after animation
  setTimeout(() => {
    partyView.classList.remove(effectClass);
  }, 1000);
}

// ========================================
// FEATURE 3: PARTY END RECAP
// ========================================

function initSessionStats() {
  state.sessionStats = {
    startTime: Date.now(),
    tracksPlayed: 0,
    totalReactions: 0,
    totalShoutouts: 0,
    totalMessages: 0,
    emojiCounts: {},
    peakEnergy: 0
  };
}

function trackReaction(emoji) {
  state.sessionStats.totalReactions++;
  if (emoji) {
    state.sessionStats.emojiCounts[emoji] = (state.sessionStats.emojiCounts[emoji] || 0) + 1;
  }
}

function trackMessage(isShoutout = false) {
  state.sessionStats.totalMessages++;
  if (isShoutout) {
    state.sessionStats.totalShoutouts++;
  }
}

function showPartyRecap() {
  const modal = el("modalPartyRecap");
  if (!modal) return;
  
  // Calculate duration
  const durationMs = Date.now() - (state.sessionStats.startTime || Date.now());
  const durationMin = Math.floor(durationMs / 60000);
  
  // Update recap values
  const recapDuration = el("recapDuration");
  const recapTracks = el("recapTracks");
  const recapPeakEnergy = el("recapPeakEnergy");
  const recapReactions = el("recapReactions");
  
  if (recapDuration) recapDuration.textContent = `${durationMin} min`;
  if (recapTracks) recapTracks.textContent = state.sessionStats.tracksPlayed;
  if (recapPeakEnergy) recapPeakEnergy.textContent = state.sessionStats.peakEnergy;
  if (recapReactions) recapReactions.textContent = state.sessionStats.totalReactions;
  
  // Show top emojis
  const topEmojisList = el("topEmojisList");
  if (topEmojisList) {
    const sortedEmojis = Object.entries(state.sessionStats.emojiCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    if (sortedEmojis.length > 0) {
      topEmojisList.innerHTML = sortedEmojis.map(([emoji, count]) => `
        <div class="top-emoji-item">
          <span class="top-emoji-icon">${emoji}</span>
          <span class="top-emoji-count">${count}</span>
        </div>
      `).join('');
    } else {
      topEmojisList.innerHTML = '<span class="muted tiny">No reactions yet</span>';
    }
  }
  
  modal.classList.remove("hidden");
}

function initPartyRecap() {
  const btnCloseRecap = el("btnCloseRecap");
  if (btnCloseRecap) {
    btnCloseRecap.onclick = () => {
      const modal = el("modalPartyRecap");
      if (modal) modal.classList.add("hidden");
      showLanding();
    };
  }
}

// ========================================
// FEATURE 4: SMART UPSELL TIMING
// ========================================

function checkSmartUpsell() {
  // Only show upsells at specific moments:
  // 1. When adding 3rd phone (already handled in existing code)
  // 2. After 3 tracks played and high energy
  // 3. After 10 minutes of party time
  
  if (state.partyPassActive || state.partyPro) {
    return; // Already upgraded
  }
  
  const partyDuration = Date.now() - (state.sessionStats.startTime || Date.now());
  const partyMinutes = partyDuration / 60000;
  
  // Show upsell after 10 minutes
  if (partyMinutes > 10 && state.sessionStats.tracksPlayed >= 2) {
    showSmartUpsell("You've been partying for 10+ minutes! Upgrade for the full experience.");
    return;
  }
  
  // Show upsell after 3 tracks with high energy
  if (state.sessionStats.tracksPlayed >= 3 && state.crowdEnergy > 60) {
    showSmartUpsell("The party's heating up! Unlock Pro features now.");
    return;
  }
}

function showSmartUpsell(message) {
  const banner = el("partyPassBanner");
  const upgrade = el("partyPassUpgrade");
  
  if (banner && upgrade) {
    banner.classList.remove("hidden");
    upgrade.classList.remove("hidden");
    
    // Update message if needed
    const tagline = upgrade.querySelector(".party-pass-upgrade-tagline");
    if (tagline && message) {
      tagline.textContent = message;
    }
  }
}

// ========================================
// FEATURE 5: HOST-GIFTED PARTY PASS
// ========================================

function initHostGiftPartyPass() {
  const btnGiftPartyPass = el("btnGiftPartyPass");
  if (btnGiftPartyPass) {
    btnGiftPartyPass.onclick = () => {
      // Simulate payment flow
      if (confirm("Purchase Party Pass for £2.99 to unlock Pro features for everyone in this party?")) {
        activateGiftedPartyPass();
      }
    };
  }
}

function activateGiftedPartyPass() {
  state.partyPassActive = true;
  state.partyPro = true;
  state.partyPassEndTime = Date.now() + (2 * 60 * 60 * 1000); // 2 hours
  
  // Start timer
  startPartyPassTimer();
  
  // Update UI
  updatePartyPassUI();
  setPlanPill();
  
  // Hide gift section
  const giftSection = el("hostGiftSection");
  if (giftSection) giftSection.classList.add("hidden");
  
  toast("🎉 Party Pass activated! Everyone now has Pro features!");
  
  // In a real app, would broadcast this to all guests
}

// ========================================
// FEATURE 6: PARENT-FRIENDLY INFO TOGGLE
// ========================================

function initParentInfo() {
  const btnParentInfo = el("btnParentInfo");
  const modalParentInfo = el("modalParentInfo");
  const btnCloseParentInfo = el("btnCloseParentInfo");
  
  if (btnParentInfo && modalParentInfo) {
    btnParentInfo.onclick = () => {
      modalParentInfo.classList.remove("hidden");
    };
  }
  
  if (btnCloseParentInfo && modalParentInfo) {
    btnCloseParentInfo.onclick = () => {
      modalParentInfo.classList.add("hidden");
    };
  }
}

// ========================================
// FEATURE 7: GUEST ANONYMITY BY DEFAULT
// ========================================

function getAnonymousGuestName() {
  const guestNum = state.nextGuestNumber++;
  return `Guest ${guestNum}`;
}

function applyGuestAnonymity() {
  // When creating or joining party, use anonymous name if no nickname provided
  const hostNameInput = el("hostName");
  const guestNameInput = el("guestName");
  
  if (hostNameInput && !hostNameInput.value.trim()) {
    const anonName = getAnonymousGuestName();
    state.name = anonName;
    state.guestNickname = null;
  } else if (hostNameInput) {
    state.name = hostNameInput.value.trim();
    state.guestNickname = state.name;
  }
  
  if (guestNameInput && !guestNameInput.value.trim()) {
    const anonName = getAnonymousGuestName();
    state.name = anonName;
    state.guestNickname = null;
  } else if (guestNameInput) {
    state.name = guestNameInput.value.trim();
    state.guestNickname = state.name;
  }
}

// ========================================
// FEATURE 8: BEAT-AWARE UI
// ========================================

function initBeatAwareUI() {
  // Start subtle pulse on playing state
  if (state.playing) {
    startBeatPulse();
  }
}

function startBeatPulse() {
  const partyView = el("viewParty");
  const crowdEnergyCard = el("crowdEnergyCard");
  
  // Add subtle pulse class based on energy level
  if (state.crowdEnergy > 50) {
    if (partyView) partyView.classList.add("beat-pulse-subtle");
    if (crowdEnergyCard) crowdEnergyCard.classList.add("beat-pulse-subtle");
  }
}

function stopBeatPulse() {
  const partyView = el("viewParty");
  const crowdEnergyCard = el("crowdEnergyCard");
  
  if (partyView) partyView.classList.remove("beat-pulse-subtle");
  if (crowdEnergyCard) crowdEnergyCard.classList.remove("beat-pulse-subtle");
}

function triggerBeatPulse() {
  // Trigger single pulse on reactions/moments
  const partyView = el("viewParty");
  if (partyView) {
    partyView.classList.add("beat-pulse");
    setTimeout(() => {
      partyView.classList.remove("beat-pulse");
    }, 600);
  }
}

// ========================================
// FEATURE 9: PARTY THEMES
// ========================================

function initThemeSelector() {
  const btnThemeToggle = el("btnThemeToggle");
  if (btnThemeToggle) {
    btnThemeToggle.onclick = cycleTheme;
  }
  
  // Load saved theme
  const savedTheme = localStorage.getItem("partyTheme") || "neon";
  applyTheme(savedTheme);
}

function cycleTheme() {
  const themes = ["neon", "dark-rave", "festival", "minimal"];
  const currentIndex = themes.indexOf(state.partyTheme);
  const nextIndex = (currentIndex + 1) % themes.length;
  const nextTheme = themes[nextIndex];
  
  applyTheme(nextTheme);
  toast(`Theme: ${nextTheme.replace("-", " ").toUpperCase()}`);
}

function applyTheme(theme) {
  const body = document.body;
  
  // Remove all theme classes
  body.classList.remove("theme-neon", "theme-dark-rave", "theme-festival", "theme-minimal");
  
  // Add new theme class
  body.classList.add(`theme-${theme}`);
  
  // Update state
  state.partyTheme = theme;
  
  // Save to localStorage
  localStorage.setItem("partyTheme", theme);
}

// ========================================
// INITIALIZE ALL FEATURES
// ========================================

function initializeAllFeatures() {
  initCrowdEnergyMeter();
  initDJMoments();
  initPartyRecap();
  initHostGiftPartyPass();
  initParentInfo();
  initThemeSelector();
  initBeatAwareUI();
  initSessionStats();
  
  console.log("[Features] All 9 features initialized");
}

// Call initialization when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAllFeatures);
} else {
  initializeAllFeatures();
}


// ---- Promo Code Logic (Prototype) ----
const PROMO_CODES = ["SS-PARTY-A9K2","SS-PARTY-QM7L","SS-PARTY-Z8P3"];
let promoUsed = false;

const promoBtn = document.getElementById("promoBtn");
const promoModal = document.getElementById("promoModal");
const promoApply = document.getElementById("promoApply");
const promoInput = document.getElementById("promoInput");
const promoClose = document.getElementById("promoClose");

if (promoBtn) {
  promoBtn.onclick = () => promoModal.classList.remove("hidden");
  promoClose.onclick = () => promoModal.classList.add("hidden");

  promoApply.onclick = () => {
    const code = promoInput.value.trim().toUpperCase();
    if (promoUsed) {
      alert("This party already used a promo code.");
      return;
    }
    if (!PROMO_CODES.includes(code)) {
      alert("Invalid or expired promo code.");
      return;
    }
    promoUsed = true;
    window.partyPro = true;
    promoModal.classList.add("hidden");
    alert("🎉 Pro unlocked for this party!");
    updateUI?.();
  };
}
