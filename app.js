const FREE_LIMIT = 2;

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
  snapshot: null
};

const el = (id) => document.getElementById(id);
const toastEl = el("toast");

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 2200);
}

function show(id) { el(id).classList.remove("hidden"); }
function hide(id) { el(id).classList.add("hidden"); }

function setPlanPill() {
  const pill = el("planPill");
  pill.textContent = state.partyPro ? "Supporter · party unlocked" : "Free · up to 2 phones";
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
      showHome();
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
  if (msg.t === "WELCOME") { state.clientId = msg.clientId; return; }
  if (msg.t === "CREATED") {
    state.code = msg.code; state.isHost = true; showParty(); toast(`Party created: ${msg.code}`); return;
  }
  if (msg.t === "JOINED") {
    state.code = msg.code; state.isHost = false; showParty(); toast(`Joined party ${msg.code}`); return;
  }
  if (msg.t === "ROOM") {
    state.snapshot = msg.snapshot;
    state.partyPro = (msg.snapshot?.members || []).some(m => m.isPro);
    setPlanPill();
    renderRoom();
    return;
  }
  if (msg.t === "ENDED") { toast("Party ended (host left)"); showHome(); return; }
  if (msg.t === "KICKED") { toast("Removed by host"); showHome(); return; }
  if (msg.t === "ERROR") { toast(msg.message || "Error"); return; }
}

function showHome() {
  show("viewHome"); hide("viewParty");
  state.code = null; state.isHost = false; state.playing = false; state.adActive = false;
  state.snapshot = null; state.partyPro = false;
  setPlanPill();
}

function showParty() {
  hide("viewHome"); show("viewParty");
  el("partyTitle").textContent = state.isHost ? "Host party" : "Guest party";
  el("partyMeta").textContent = `Source: ${state.source} · You: ${state.name}${state.isHost ? " (Host)" : ""}`;
  el("partyCode").textContent = state.code || "------";
  setPlanPill();
  renderRoom();
  updatePlaybackUI();
  updateQualityUI();
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
  el("btnAd").disabled = state.partyPro || state.source === "mic";
  el("adLine").textContent = state.partyPro ? "No ads (Pro)"
    : (state.source === "mic" ? "No ads in mic mode" : "Ads interrupt playback for free users.");
  
  // Update equalizer animation based on playing state
  const equalizer = el("equalizer");
  if (equalizer) {
    if (state.playing && !state.adActive) {
      equalizer.classList.remove("paused");
    } else {
      equalizer.classList.add("paused");
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
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

  if (!state.partyPro && next > FREE_LIMIT) { openPaywall(); return; }

  if (next > q.rec) {
    if (!state.partyPro) { openPaywall(); return; }
    openWarn(q.rec, next); return;
  }

  toast("Open this link on another phone and tap Join");
}

(async function init(){
  await connectWS();
  showHome();

  el("btnCreate").onclick = () => {
    console.log("[UI] Start party button clicked");
    state.name = el("hostName").value.trim() || "Host";
    state.source = el("source").value;
    state.isPro = el("togglePro").checked;
    console.log("[UI] Creating party with:", { name: state.name, source: state.source, isPro: state.isPro });
    send({ t: "CREATE", name: state.name, isPro: state.isPro, source: state.source });
  };

  el("btnJoin").onclick = () => {
    const code = el("joinCode").value.trim().toUpperCase();
    if (!code) { toast("Enter a party code"); return; }
    state.name = el("guestName").value.trim() || "Guest";
    state.isPro = el("togglePro").checked;
    send({ t: "JOIN", code, name: state.name, isPro: state.isPro });
  };

  el("togglePro").onchange = (e) => {
    state.isPro = !!e.target.checked;
    send({ t: "SET_PRO", isPro: state.isPro });
  };

  el("btnLeave").onclick = () => { if (state.ws) state.ws.close(); };

  el("btnCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(state.code || ""); toast("Copied code"); }
    catch { toast("Copy failed (permission)"); }
  };

  el("btnPlay").onclick = () => { 
    if (state.adActive) return; 
    state.playing = true; 
    updatePlaybackUI();
    toast("Play (simulated)"); 
  };
  el("btnPause").onclick = () => { 
    if (state.adActive) return; 
    state.playing = false; 
    updatePlaybackUI();
    toast("Pause (simulated)"); 
  };

  el("btnAd").onclick = () => {
    if (state.partyPro || state.source === "mic") return;
    state.adActive = true; state.playing = false; updatePlaybackUI();
    toast("Ad (20s) — supporters remove ads");
    setTimeout(() => { state.adActive = false; updatePlaybackUI(); toast("Ad finished"); }, 20000);
  };

  el("btnAddPhone").onclick = attemptAddPhone;

  el("btnSpeaker").onclick = () => { if (!state.partyPro) openPaywall(); else openSpeaker(); };

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
