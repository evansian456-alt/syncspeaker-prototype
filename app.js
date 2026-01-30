const FREE_LIMIT = 2;
const API_TIMEOUT_MS = 5000; // 5 second timeout for API calls

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
  // Guest-specific state
  nowPlayingFilename: null,
  upNextFilename: null,
  playbackState: "STOPPED", // PLAYING, PAUSED, STOPPED
  lastHostEvent: null, // PLAY, PAUSE, TRACK_SELECTED, NEXT_TRACK_QUEUED, TRACK_CHANGED
  visualMode: "idle", // playing, paused, idle
  connected: false,
  guestVolume: 80
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
      handleGuestMessageReceived(msg.message, msg.guestName, msg.guestId);
    }
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

function handleGuestMessageReceived(message, guestName, guestId) {
  console.log(`[DJ] Received message from ${guestName}: ${message}`);
  
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
    messageEl.className = "dj-message";
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
        send({ t: "GUEST_MESSAGE", message: message });
        
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
    const roleEl = el("debugRole");
    const partyCodeEl = el("debugPartyCode");
    const connectedEl = el("debugConnected");
    const nowPlayingEl = el("debugNowPlaying");
    const upNextEl = el("debugUpNext");
    const playbackStateEl = el("debugPlaybackState");
    const lastHostEventEl = el("debugLastHostEvent");
    const visualModeEl = el("debugVisualMode");
    
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
        
        // Update DJ screen
        updateDjScreen();
        
        // Broadcast to guests
        if (state.isHost && state.ws) {
          send({ t: "HOST_PLAY" });
        }
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
    updateDjScreen();
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
    console.log("[UI] Start party button clicked - PROTOTYPE MODE (no backend dependency)");
    const btn = el("btnCreate");
    
    // Prevent multiple clicks - check if button is already disabled
    if (btn.disabled) {
      console.log("[UI] Button already processing, ignoring click");
      return;
    }
    
    // BROWSER PROTOTYPE MODE: Create party instantly without network dependency
    // Disable button briefly for visual feedback
    btn.disabled = true;
    btn.textContent = "Creating party...";
    
    // Get user configuration
    state.name = el("hostName").value.trim() || "Host";
    state.source = "local"; // Always use local source for music from phone
    state.isPro = el("togglePro").checked;
    console.log("[UI] Creating party with:", { name: state.name, source: state.source, isPro: state.isPro });
    
    // Generate party code client-side (6 random letters/numbers)
    const partyCode = generatePartyCode();
    console.log("[Party] Generated party code:", partyCode);
    
    // Set party state immediately
    state.code = partyCode;
    state.isHost = true;
    state.offlineMode = true; // Mark as prototype/offline mode
    
    // Initialize snapshot with host member for prototype mode
    state.snapshot = {
      members: [{
        id: "host-" + Date.now(),
        name: state.name,
        isHost: true,
        isPro: state.isPro
      }]
    };
    
    // Show party view immediately
    showParty();
    
    // Show success toast
    toast(`Party created: ${partyCode}`);
    
    // TODO: Enable real-time sync later in native app
    // For browser prototype, we skip WebSocket connection to ensure Start Party works instantly
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
      updateStatus("Joining party…");
      
      state.name = el("guestName").value.trim() || "Guest";
      state.isPro = el("togglePro").checked;
      console.log("[UI] Joining party with:", { code, name: state.name, isPro: state.isPro });
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      
      const endpoint = "POST /api/join-party";
      updateDebug(`Endpoint: ${endpoint}`);
      updateDebugPanel(endpoint, null);
      updateStatus("Calling server…");
      
      let response;
      try {
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
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Provide browser-only mode friendly error messages
        let errorMsg;
        if (fetchError.name === "AbortError") {
          errorMsg = "Server not responding. Try again.";
        } else if (fetchError.message.includes("Failed to fetch")) {
          errorMsg = "Multi-device sync requires the server to be running. Use 'npm start' to enable joining parties.";
        } else {
          errorMsg = fetchError.message;
        }
        
        updateDebugPanel(endpoint, `${endpoint} (${fetchError.name === "AbortError" ? "timeout" : "network error"})`);
        throw new Error(errorMsg);
      }
      
      updateStatus("Server responded…");
      
      // Check for 501 (Unsupported method) which happens with simple HTTP servers
      if (response.status === 501) {
        const errorMsg = "Multi-device sync requires the server to be running. Use 'npm start' to enable joining parties.";
        updateDebugPanel(endpoint, "Server doesn't support POST (browser-only mode)");
        throw new Error(errorMsg);
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        const errorMsg = errorData.error || `Server error: ${response.status}`;
        updateDebugPanel(endpoint, errorMsg);
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
    if (state.ws) {
      state.ws.close(); 
    } else {
      // In prototype mode (no WebSocket), navigate back to landing manually
      showLanding();
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
    } else {
      state.playing = true;
      updateMusicStatus("Play (simulated - no music file loaded)");
      toast("Play (simulated)");
      
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

  // Free Plan button
  const btnStartFreePlan = el("btnStartFreePlan");
  if (btnStartFreePlan) {
    btnStartFreePlan.onclick = () => {
      console.log("[UI] Start Free Plan clicked");
      showHome();
    };
  }

  // Pro Monthly subscription button
  const btnSubscribeMonthly = el("btnSubscribeMonthly");
  if (btnSubscribeMonthly) {
    btnSubscribeMonthly.onclick = () => {
      console.log("[UI] Subscribe Monthly clicked");
      toast("Pro Monthly subscription coming soon!");
      // In a real app, this would navigate to a payment/subscription page
    };
  }
})();


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
