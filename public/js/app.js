// ============================================================
// Version — build time is fetched from server at startup
// ============================================================

// ============================================================
// Constants (mirrored from server)
// ============================================================
const SUIT_SYM  = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
const SAME_COLOR = { S: 'C', C: 'S', H: 'D', D: 'H' };
const RANK_VAL   = { '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };

// ============================================================
// App state
// ============================================================
let socket       = null;
let mySocketId   = null;
let myName       = '';
let mySeat       = -1;
let roomId       = '';
let roomHostId   = null;      // socket id of the room host
let gameState    = null;
let roomPlayers  = [];        // [{id, name, seat, isBot}]

// WebRTC
let localStream  = null;
const peers                 = new Map(); // socketId -> RTCPeerConnection
const remoteStreams          = new Map(); // socketId -> MediaStream (cached for re-apply)
const peerVideoTransceivers  = new Map(); // socketId -> RTCRtpTransceiver (pre-reserved for camera-off starts)
// Holds ICE candidates that arrive before setRemoteDescription completes.
// Critical on Safari/iPad where candidates are generated very quickly.
const iceCandidateQueues = new Map(); // socketId -> RTCIceCandidateInit[]
let roomSeriesType = 'single';  // mirrors server room.seriesType
let micEnabled   = false;
let camEnabled   = false;
let chatVisible  = true; // hidden by default on mobile (toggled by JS)
const mediaStates = {};  // { [seat]: { muted, videoOff } }

// Turn nudge timers
let _nudgeTimeout  = null;
let _nudgeInterval = null;

function startNudge() {
  clearNudge();
  _nudgeTimeout = setTimeout(() => {
    toast("It's your turn!", 'warning');
    _nudgeInterval = setInterval(() => toast("It's your turn!", 'warning'), 10000);
  }, 5000);
}

function clearNudge() {
  clearTimeout(_nudgeTimeout);
  clearInterval(_nudgeInterval);
  _nudgeTimeout = null;
  _nudgeInterval = null;
}
let RTC_CFG      = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// ============================================================
// Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash.slice(1).toUpperCase();
  if (hash) el('room-input').value = hash;

  // Version badge — fetch build timestamp from server so it always reflects the latest deploy
  fetch('/api/version').then(r => r.json()).then(({ buildTime }) => {
    const vb = el('version-badge');
    if (!vb) return;
    const d = new Date(buildTime);
    const mo = d.getMonth() + 1, dy = d.getDate();
    const hr = d.getHours(), mn = String(d.getMinutes()).padStart(2, '0');
    vb.textContent = `Build ${mo}/${dy} ${hr}:${mn} P`;
  }).catch(() => {});

  el('join-form').addEventListener('submit', handleJoin);
  el('new-room-btn').addEventListener('click', () => {
    const code = randomRoomId();
    el('room-input').value = code;
    window.location.hash = code;
  });
});

function randomRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function handleJoin(e) {
  e.preventDefault();
  myName = el('name-input').value.trim() || 'Player';
  roomId = (el('room-input').value.trim().toUpperCase()) || randomRoomId();
  window.location.hash = roomId;

  // Fetch TURN/STUN config from server (supports env-var TURN credentials)
  try {
    const res = await fetch('/api/rtc-config');
    RTC_CFG = await res.json();
  } catch { /* keep defaults */ }

  await initMedia();
  connectSocket();
}

// ============================================================
// Media / WebRTC
// ============================================================
async function initMedia() {
  // Start with an empty stream — no camera acquired, no LED
  localStream = new MediaStream();
  const v = el('video-local');
  if (v) { v.srcObject = localStream; v.muted = true; }
  const pv = el('video-preview');
  if (pv) pv.srcObject = localStream;

  // Acquire mic only (no video = no camera LED)
  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTrack = audioStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = false;   // mic off by default
      localStream.addTrack(audioTrack);
    }
  } catch (err) {
    console.warn('Mic unavailable:', err.message);
  }

  syncMediaBtns();
}

// Acquire camera on demand (called when user enables camera)
async function acquireCamera() {
  try {
    const vidStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 160 }, height: { ideal: 120 }, facingMode: { ideal: 'user' } },
    });
    const newTrack = vidStream.getVideoTracks()[0];
    if (!newTrack) return;

    // Swap out any stale video track
    localStream.getVideoTracks().forEach(t => { localStream.removeTrack(t); t.stop(); });
    localStream.addTrack(newTrack);

    // Push into existing peer connections without renegotiation.
    // Always look up via the transceiver (handles null-track senders after camera release).
    for (const [peerId, pc] of peers) {
      const vt = peerVideoTransceivers.get(peerId)
               || pc.getTransceivers().find(t => !t.stopped && t.receiver?.track?.kind === 'video');
      if (vt?.sender) await vt.sender.replaceTrack(newTrack);
    }

    // MediaStream is live so video elements update automatically,
    // but reassigning srcObject forces a re-render on some browsers
    const v = el('video-local');
    if (v) v.srcObject = localStream;
    const pv = el('video-preview');
    if (pv) pv.srcObject = localStream;
  } catch (err) {
    camEnabled = false;
    toast('Could not access camera: ' + err.message, 'error');
  }
}

// Release camera completely — stops tracks so OS turns off the LED
function releaseCamera() {
  localStream.getVideoTracks().forEach(t => { localStream.removeTrack(t); t.stop(); });
  for (const [peerId, pc] of peers) {
    const vt = peerVideoTransceivers.get(peerId)
             || pc.getTransceivers().find(t => !t.stopped && t.receiver?.track?.kind === 'video');
    if (vt?.sender) vt.sender.replaceTrack(null);
  }
}

async function createPeer(peerId, initiator) {
  closePeer(peerId);
  const pc = new RTCPeerConnection(RTC_CFG);
  peers.set(peerId, pc);

  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  // Ensure a video transceiver is tracked for the initiator so replaceTrack() works
  // when camera is toggled on later — without renegotiation.
  // If camera was already on, addTrack() above already created a video transceiver — find it.
  // If camera was off, create a sendrecv placeholder transceiver (no actual track yet).
  // The answerer never calls addTransceiver here; its video transceiver is captured in handleOffer
  // after setRemoteDescription (doing it before would add a duplicate m-line → SDP mismatch).
  if (initiator) {
    let vt = pc.getTransceivers().find(t => t.receiver?.track?.kind === 'video');
    if (!vt) vt = pc.addTransceiver('video', { direction: 'sendrecv' });
    peerVideoTransceivers.set(peerId, vt);
  }

  pc.ontrack = ev => {
    console.log(`[WebRTC] ontrack from ${peerId.slice(0,6)} kind=${ev.track.kind} streams=${ev.streams.length}`);
    // Keep one canonical stream per peer. ev.streams[0] can be undefined on Safari,
    // and audio/video may arrive on different stream objects — always accumulate into one.
    let stream = remoteStreams.get(peerId);
    if (!stream) {
      stream = (ev.streams && ev.streams[0]) || new MediaStream();
      remoteStreams.set(peerId, stream);
    }
    if (!stream.getTrackById(ev.track.id)) stream.addTrack(ev.track);
    applyRemoteStream(peerId, stream);
  };

  pc.onicecandidate = ev => {
    if (ev.candidate) socket.emit('webrtc_ice', { targetId: peerId, candidate: ev.candidate });
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[WebRTC] ICE ${peerId.slice(0,6)} → ${pc.iceConnectionState}`);
  };

  pc.onsignalingstatechange = () => {
    console.log(`[WebRTC] sig ${peerId.slice(0,6)} → ${pc.signalingState}`);
  };

  // Attempt ICE restart on failure — helps recover without a full page reload.
  // NOTE: do NOT include offerToReceiveAudio/Video here — in Unified Plan those
  // options create extra recvonly transceivers on Safari, causing SDP mismatches.
  pc.onconnectionstatechange = () => {
    console.log(`[WebRTC] conn ${peerId.slice(0,6)} → ${pc.connectionState} (initiator=${initiator})`);
    if (pc.connectionState === 'failed' && initiator) {
      console.log(`[WebRTC] restarting ICE for ${peerId.slice(0,6)}`);
      pc.createOffer({ iceRestart: true })
        .then(o => pc.setLocalDescription(o))
        .then(() => socket.emit('webrtc_offer', { targetId: peerId, offer: pc.localDescription }))
        .catch(err => console.warn('[WebRTC] ICE restart failed:', err.message));
    }
  };

  if (initiator) {
    // Do NOT pass offerToReceiveAudio/Video — we use addTrack() which already creates
    // sendrecv transceivers in Unified Plan. Those legacy flags cause Safari to add
    // extra recvonly transceivers on top, producing a 4-m-line SDP that mismatches
    // the answerer's 2-m-line answer and breaks media flow on iPad specifically.
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log(`[WebRTC] offer sent to ${peerId.slice(0,6)} m-lines=${(offer.sdp.match(/^m=/gm)||[]).length}`);
    socket.emit('webrtc_offer', { targetId: peerId, offer });
  }
  return pc;
}

// Apply queued ICE candidates that arrived before setRemoteDescription completed.
async function flushIceCandidates(peerId) {
  const queue = iceCandidateQueues.get(peerId);
  iceCandidateQueues.delete(peerId);
  if (!queue) return;
  const pc = peers.get(peerId);
  if (!pc) return;
  for (const c of queue) {
    try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
  }
}

async function handleOffer({ fromId, offer }) {
  console.log(`[WebRTC] offer recv from ${fromId.slice(0,6)} m-lines=${(offer.sdp.match(/^m=/gm)||[]).length}`);
  const pc = await createPeer(fromId, false);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  // Capture the video transceiver the browser auto-creates when processing the offer's m=video line.
  // Force direction to sendrecv: without this, Chrome/Safari may default to recvonly when the
  // answerer has no local video track, causing the answer SDP to say recvonly — which prevents
  // the initiator from firing ontrack for the answerer's video (one-way video at best).
  if (!peerVideoTransceivers.has(fromId)) {
    const vt = pc.getTransceivers().find(t => !t.stopped && t.receiver?.track?.kind === 'video');
    if (vt) {
      vt.direction = 'sendrecv';
      peerVideoTransceivers.set(fromId, vt);
    }
  }
  // Flush any ICE candidates that arrived while setRemoteDescription was pending
  await flushIceCandidates(fromId);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  console.log(`[WebRTC] answer sent to ${fromId.slice(0,6)} m-lines=${(answer.sdp.match(/^m=/gm)||[]).length}`);
  socket.emit('webrtc_answer', { targetId: fromId, answer });
}

async function handleAnswer({ fromId, answer }) {
  const pc = peers.get(fromId);
  if (pc && pc.signalingState !== 'stable') {
    console.log(`[WebRTC] answer recv from ${fromId.slice(0,6)} m-lines=${(answer.sdp.match(/^m=/gm)||[]).length}`);
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    await flushIceCandidates(fromId);
  }
}

async function handleIce({ fromId, candidate }) {
  const pc = peers.get(fromId);
  if (!pc) return;
  // Queue candidates until setRemoteDescription has completed — on Safari/iPad
  // candidates arrive almost immediately and would otherwise be silently dropped.
  if (!pc.remoteDescription || !pc.remoteDescription.type) {
    const q = iceCandidateQueues.get(fromId) || [];
    q.push(candidate);
    iceCandidateQueues.set(fromId, q);
    return;
  }
  try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
}

function closePeer(id) {
  const pc = peers.get(id);
  if (pc) { pc.close(); peers.delete(id); }
  remoteStreams.delete(id);
  iceCandidateQueues.delete(id);
  peerVideoTransceivers.delete(id);
}

// Apply a stored stream to the correct video element based on current seat layout.
// Safe to call at any time; re-called when game screen becomes visible.
function applyRemoteStream(peerId, stream) {
  const p = roomPlayers.find(q => q.id === peerId);
  if (!p || mySeat === -1) return;
  const pos = displayPos(p.seat);
  if (pos === 'bottom') return;
  const v = el(`video-${pos}`);
  console.log(`[WebRTC] applyRemoteStream ${peerId.slice(0,6)} → ${pos} el=${!!v} tracks=${stream.getTracks().length}`);
  if (!v) return;
  v.srcObject = stream;
  v.play().catch(err => {
    // iOS Safari blocks autoplay on unmuted video when the original user gesture
    // has expired. Install a one-shot document listener so the next tap anywhere
    // on the screen retries playback — works for all remote video elements.
    console.warn(`[WebRTC] play() blocked (${err.name}), waiting for user gesture`);
    const retry = () => {
      document.querySelectorAll('video').forEach(vid => {
        if (vid.srcObject && vid.paused) vid.play().catch(() => {});
      });
    };
    document.addEventListener('click',     retry, { once: true, passive: true });
    document.addEventListener('touchstart', retry, { once: true, passive: true });
  });
}

// Re-apply all cached remote streams — called after game screen transitions in
// so that streams set while the waiting room was visible actually play.
function applyAllRemoteStreams() {
  for (const [peerId, stream] of remoteStreams) applyRemoteStream(peerId, stream);
}

// Visible "↺" button handler — user tap provides the gesture iOS Safari needs
// to unblock autoplay, then re-applies all streams and forces play() on all
// video elements. Also re-initiates any dead peer connections.
function reconnectVideo() {
  // Re-apply cached streams (covers case where ontrack fired but play() was blocked)
  applyAllRemoteStreams();
  // Force play on every video with a source — user gesture makes this safe on iOS
  document.querySelectorAll('video').forEach(v => {
    if (v.srcObject && v.paused) v.play().catch(() => {});
  });
  // Re-initiate connections to peers whose ICE connection is dead
  for (const [peerId, pc] of peers) {
    const state = pc.iceConnectionState;
    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      console.log(`[WebRTC] reconnectVideo: re-initiating to ${peerId.slice(0,6)} (was ${state})`);
      createPeer(peerId, true);
    }
  }
}

function clearRemoteVideo(seat) {
  if (mySeat === -1) return;
  const v = el(`video-${displayPos(seat)}`);
  if (v) v.srcObject = null;
}

// ============================================================
// Socket.io
// ============================================================
function connectSocket() {
  socket = io();

  socket.on('connect', () => {
    mySocketId = socket.id;
    // Reconnecting mid-game: try to reclaim our seat instead of joining fresh
    if (gameState && roomId && mySeat !== -1) {
      socket.emit('rejoin_game', { roomId, playerName: myName, seat: mySeat });
    } else {
      socket.emit('join_room', { roomId, playerName: myName });
    }
  });

  socket.on('joined_room', ({ seat, players, hostId, seriesType }) => {
    mySeat = seat;
    roomPlayers = players;
    roomHostId = hostId;
    if (seriesType) roomSeriesType = seriesType;
    showWaiting(players);
    // Initiate WebRTC to all already-present human peers
    for (const p of players) {
      if (p.id !== mySocketId && !p.isBot) createPeer(p.id, true);
    }
  });

  socket.on('room_state', ({ players, hostId, seriesType }) => {
    roomPlayers = players;
    if (hostId !== undefined) roomHostId = hostId;
    if (seriesType) { roomSeriesType = seriesType; }
    if (!gameState) showWaiting(players);
  });

  socket.on('player_joined', ({ id, name, seat, isBot }) => {
    if (!roomPlayers.find(p => p.id === id)) roomPlayers.push({ id, name, seat, isBot });
    if (!gameState) showWaiting(roomPlayers);
    if (!isBot) appendSystemMsg(`${name} joined`);
  });

  socket.on('player_left', ({ id, name, seat }) => {
    roomPlayers = roomPlayers.filter(p => p.id !== id);
    closePeer(id);
    clearRemoteVideo(seat);
    toast(`${name} left the game`, 'warning');
    if (gameState) { appendSystemMsg(`${name} left`); renderGame(); }
  });

  socket.on('game_state', state => {
    // Always sync mySeat from the server's authoritative value to prevent stale-seat rendering bugs
    if (state.mySeat !== undefined) mySeat = state.mySeat;
    gameState = state;
    showScreen('game');
    renderGame();
    // Nudge player if it's their turn to play a card
    if (state.phase === 'playing' && state.currentTurn === mySeat) {
      startNudge();
    } else {
      clearNudge();
    }
    if (state.phase === 'hand_result' && state.lastHandResult) {
      showHandResult(state);
    } else if (state.phase === 'series_over') {
      showSeriesOver(state);
    } else if (state.phase === 'game_over') {
      showGameOver(state);
    } else {
      hideOverlay();
    }
  });

  socket.on('webrtc_offer',  handleOffer);
  socket.on('webrtc_answer', handleAnswer);
  socket.on('webrtc_ice',    handleIce);

  socket.on('player_media_state', ({ seat, muted, videoOff }) => {
    mediaStates[seat] = { muted, videoOff };
    updateMuteBadge(seat);
  });

  socket.on('error', ({ message }) => toast(message, 'error'));

  socket.on('chat_message', ({ name, message }) => appendChat(name, message));
  socket.on('system_msg',   ({ text })           => appendSystemMsg(text));

  socket.on('disconnect', () => toast('Connection lost — reconnecting…', 'warning'));
  socket.on('connect_error', () => toast('Cannot reach server — retrying…', 'error'));
}

// ============================================================
// Display position (relative to my seat)
// 0 → bottom (me), 1 → left, 2 → top, 3 → right
// ============================================================
function displayPos(seat) {
  if (mySeat === -1) return 'top';
  const rel = (seat - mySeat + 4) % 4;
  return ['bottom', 'left', 'top', 'right'][rel];
}

// ============================================================
// Screen helpers
// ============================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el(`screen-${id}`).classList.add('active');
}

// ---- Waiting room team setup ----
let _dragSeat    = null;   // desktop drag-and-drop
let _selectedSeat = null;  // touch tap-to-move

function showWaiting(players) {
  if (gameState) return;
  showScreen('waiting');
  el('room-code-display').textContent = roomId;
  el('share-url').value = window.location.href;

  const humanCount = players.filter(p => !p.isBot).length;
  const isHost = (mySocketId === roomHostId);
  const bySeats = Array.from({length: 4}, (_, i) => players.find(p => p.seat === i) || null);
  const teamOf = s => (s === 0 || s === 2) ? 0 : 1;

  function playerCard(seat) {
    const p = bySeats[seat];
    const isEmpty = !p;
    const isMe = p && p.id === mySocketId;
    const isBot = p && p.isBot;
    const draggable = isHost && !isEmpty ? 'draggable="true"' : '';
    const hostAttrs = isHost && !isEmpty
      ? `data-seat="${seat}" onclick="tapCard(${seat})" ondragstart="dragCard(${seat})" ondragend="dragEnd()"`
      : '';
    return `<div class="wp-card${isEmpty ? ' empty' : ''}${isMe ? ' me' : ''}${isBot ? ' bot' : ''}" ${draggable} ${hostAttrs}>
      <span class="wp-seat">Seat ${seat + 1}</span>
      <span class="wp-name">${isEmpty
        ? '<em>Empty</em>'
        : (isBot ? '🤖 ' : '') + esc(p.name) + (isMe ? ' <span class="wp-you">(You)</span>' : '')
      }</span>
      ${isHost && !isEmpty ? `<button class="btn-move-team" onclick="event.stopPropagation();moveToTeam(${seat},${teamOf(seat)===0?1:0})">→ Team ${teamOf(seat)===0?2:1}</button>` : ''}
    </div>`;
  }

  // team cols are drop zones
  const dropAttrs = t => isHost
    ? `ondragover="event.preventDefault()" ondrop="dropOnTeam(${t})" onclick="tapTeam(${t})" class="team-col drop-zone"`
    : `class="team-col"`;

  el('team-setup').innerHTML = `
    <div class="team-layout">
      <div ${dropAttrs(0)}>
        <div class="team-label team-a">Team 1</div>
        ${playerCard(0)}
        ${playerCard(2)}
      </div>
      <div ${dropAttrs(1)}>
        <div class="team-label team-b">Team 2</div>
        ${playerCard(1)}
        ${playerCard(3)}
      </div>
    </div>
    ${isHost ? '<p class="host-hint">Drag players between teams, or tap a player then tap the other team</p>' : ''}
  `;

  const msgEl    = el('waiting-message');
  const btnBots  = el('start-bots-btn');
  const btnStart = el('start-game-btn');
  if (humanCount < 4) {
    msgEl.textContent = `Waiting for ${4 - humanCount} more player(s)…`;
    if (isHost) { if (btnBots) btnBots.classList.remove('hidden'); }
    else        { if (btnBots) btnBots.classList.add('hidden'); }
    if (btnStart) btnStart.classList.add('hidden');
  } else {
    msgEl.textContent = isHost ? 'All players present – press Start when ready!' : 'All players present – waiting for host to start…';
    if (btnBots) btnBots.classList.add('hidden');
    if (isHost) { if (btnStart) btnStart.classList.remove('hidden'); }
    else        { if (btnStart) btnStart.classList.add('hidden'); }
  }

  // Series selector — host picks format, others see read-only label
  const selEl = el('series-selector');
  if (selEl) {
    const LABELS = { single: 'Single Game', bo3: 'Best of 3', bo5: 'Best of 5' };
    if (isHost) {
      selEl.innerHTML = `<span class="series-sel-label">Format:</span>` +
        ['single', 'bo3', 'bo5'].map(t =>
          `<button class="btn btn-series${roomSeriesType === t ? ' active' : ''}"
                   onclick="selectSeries('${t}')">${LABELS[t]}</button>`
        ).join('');
    } else {
      selEl.innerHTML = `<span class="series-sel-label">Format: <strong>${LABELS[roomSeriesType]}</strong></span>`;
    }
  }

  syncMediaBtns();
}

// Desktop drag
function dragCard(seat) { _dragSeat = seat; }
function dragEnd()      { _dragSeat = null; }
function dropOnTeam(targetTeam) {
  if (_dragSeat === null) return;
  moveToTeam(_dragSeat, targetTeam);
  _dragSeat = null;
}

// Touch / click tap-to-move: tap a card to select, then tap the other team col to move
function tapCard(seat) {
  if (_selectedSeat === seat) {
    // deselect
    _selectedSeat = null;
    document.querySelectorAll('.wp-card').forEach(c => c.classList.remove('wp-selected'));
  } else {
    _selectedSeat = seat;
    document.querySelectorAll('.wp-card').forEach(c => c.classList.remove('wp-selected'));
    const cards = document.querySelectorAll('.wp-card[data-seat]');
    cards.forEach(c => { if (parseInt(c.dataset.seat) === seat) c.classList.add('wp-selected'); });
  }
}
function tapTeam(targetTeam) {
  if (_selectedSeat === null) return;
  const currentTeam = (_selectedSeat === 0 || _selectedSeat === 2) ? 0 : 1;
  if (currentTeam !== targetTeam) moveToTeam(_selectedSeat, targetTeam);
  _selectedSeat = null;
  document.querySelectorAll('.wp-card').forEach(c => c.classList.remove('wp-selected'));
}

// Move a player at fromSeat to targetTeam (0=seats0,2 / 1=seats1,3).
// Picks bot slot → empty seat → human (first slot).
function moveToTeam(fromSeat, targetTeam) {
  const teamSeats = targetTeam === 0 ? [0, 2] : [1, 3];
  const bySeats = Array.from({length: 4}, (_, i) => roomPlayers.find(p => p.seat === i) || null);
  let destSeat = null;
  for (const s of teamSeats) {                    // prefer bot
    if (bySeats[s] && bySeats[s].isBot) { destSeat = s; break; }
  }
  if (destSeat === null) {
    for (const s of teamSeats) {                  // then empty
      if (!bySeats[s]) { destSeat = s; break; }
    }
  }
  if (destSeat === null) destSeat = teamSeats[0]; // else first human
  if (socket) socket.emit('swap_seats', { seat1: fromSeat, seat2: destSeat });
}


function startWithBots() {
  if (socket) socket.emit('start_with_bots');
}
function requestStartGame() {
  if (socket) socket.emit('start_game');
}
function throwIn() {
  if (socket) socket.emit('throw_in');
}
function toggleAutoPlay() {
  if (socket) socket.emit('toggle_auto_play');
}

// Render the compact "Play for me" toggle in the bottom-right-top row
function renderAutoPlayBtn(s) {
  const wrap = el('auto-play-wrap');
  if (!wrap) return;
  const inactivePhases = ['waiting', 'game_over', 'series_over'];
  if (!s || inactivePhases.includes(s.phase)) { wrap.innerHTML = ''; return; }
  const p    = s.players?.find(q => q.seat === mySeat);
  const isOn = p?.autoPlay;
  wrap.innerHTML = `<button class="btn-auto-play${isOn ? ' active' : ''}" onclick="toggleAutoPlay()"
    title="${isOn ? 'Resume playing yourself' : 'Let AI play for you while you step away'}">
    <span class="ap-icon">${isOn ? '🤖' : '🎮'}</span><span class="ap-label">${isOn ? 'AI On' : 'Play for Me'}</span>
  </button>`;
}

// ---- Video tap-to-expand ----
function toggleVideoExpand(pos) {
  const wrap = pos === 'local'
    ? document.querySelector('.local-video-wrap')
    : document.querySelector(`#zone-${pos} .player-video-wrap`);
  if (!wrap) return;
  const expanding = !wrap.classList.contains('video-expanded');
  collapseAllVideos();
  if (expanding) {
    wrap.classList.add('video-expanded');
    const bd = el('video-expand-backdrop');
    if (bd) bd.classList.add('visible');
  }
}
function collapseAllVideos() {
  document.querySelectorAll('.video-expanded').forEach(w => w.classList.remove('video-expanded'));
  const bd = el('video-expand-backdrop');
  if (bd) bd.classList.remove('visible');
}

// ============================================================
// Game rendering
// ============================================================
function renderGame() {
  const s = gameState;
  if (!s) return;

  renderHeader(s);
  renderAllZones(s);
  renderTrick(s);
  renderUpcard(s);
  renderMyHand(s);
  renderActions(s);
  renderAutoPlayBtn(s);
  renderTrickCounter(s);
  highlightTurn(s);
}

// --- Header ---
function renderHeader(s) {
  el('room-badge').textContent = `Room: ${roomId}`;

  el('score-0').textContent = s.scores[0];
  el('score-1').textContent = s.scores[1];

  const p0 = s.players?.filter(p => p.seat % 2 === 0).map(p => p.name).join(' & ') || 'Team 1';
  const p1 = s.players?.filter(p => p.seat % 2 === 1).map(p => p.name).join(' & ') || 'Team 2';
  el('team0-names').textContent = p0;
  el('team1-names').textContent = p1;

  // Show series record in header when playing a multi-game series
  const srEl = el('series-record');
  if (srEl) {
    if (s.seriesType && s.seriesType !== 'single') {
      const sw = s.seriesWins || [0, 0];
      const lbl = s.seriesType === 'bo3' ? 'Bo3' : 'Bo5';
      srEl.textContent = `${lbl} ${sw[0]}–${sw[1]}`;
      srEl.style.display = '';
    } else {
      srEl.style.display = 'none';
    }
  }

  const td = el('trump-display');
  if (s.trump) {
    td.innerHTML = `Trump: <span class="suit-${s.trump}">${SUIT_SYM[s.trump]}</span>`;
  } else if (s.upcard && !s.turnedDown && s.phase === 'bidding1') {
    td.innerHTML = `Up: <span class="suit-${s.upcard.suit}">${s.upcard.rank}${SUIT_SYM[s.upcard.suit]}</span>`;
  } else {
    td.textContent = '';
  }

  const dealer = pname(s, s.dealer);
  let info = `Dealer: ${dealer}`;
  if (s.goingAlone && s.alonePlayer != null) info += ` | ${pname(s, s.alonePlayer)} going alone!`;
  if (s.misdealCount > 0) info += ` | ${s.misdealCount} misdeal(s)`;
  el('game-info').textContent = info;
}

// --- All player zones ---
function renderAllZones(s) {
  for (let seat = 0; seat < 4; seat++) {
    const pos = displayPos(seat);
    if (pos === 'bottom') { renderBottomLabels(s); continue; }

    const p = s.players?.find(q => q.seat === seat);
    const nameEl  = el(`name-${pos}`);
    const cardsEl = el(`cards-${pos}`);
    const vlabel  = el(`vlabel-${pos}`);
    const videoEl = el(`video-${pos}`);

    const isDealer   = seat === s.dealer;
    const isMaker    = seat === s.maker && s.trump;
    const sittingOut = s.goingAlone && seat === (s.alonePlayer + 2) % 4;
    const isBot      = p && p.isBot;
    const isAutoPlay = p && !p.isBot && p.autoPlay;

    let label = p ? esc(p.name) : '—';
    if (isBot)       label = '🤖 ' + label;
    if (isAutoPlay)  label = '🤖 ' + label;
    if (isDealer)    label += ' <span class="badge badge-dealer">Dealer</span>';
    if (isMaker)     label += ` <span class="badge badge-maker badge-suit-${s.trump}">${SUIT_SYM[s.trump]} Made it</span>`;
    if (isAutoPlay)  label += ' <span class="badge badge-autoplay">AI</span>';
    if (sittingOut) label += ' <span class="badge badge-out">Sitting out</span>';

    nameEl.innerHTML = label;
    nameEl.className = `player-label${seat === s.currentTurn && s.phase==='playing' ? ' active-turn' : ''}`;
    if (vlabel) vlabel.textContent = p ? p.name : '';

    // Show bot avatar or real video
    if (videoEl) {
      if (isBot) {
        videoEl.style.display = 'none';
        // Show bot avatar if not already there
        let avatar = videoEl.nextElementSibling;
        if (!avatar || !avatar.classList.contains('bot-avatar')) {
          avatar = document.createElement('div');
          avatar.className = 'bot-avatar';
          avatar.textContent = '🤖';
          videoEl.parentNode.insertBefore(avatar, videoEl.nextSibling);
        }
      } else {
        videoEl.style.display = '';
        // Remove bot avatar if present
        const avatar = videoEl.nextElementSibling;
        if (avatar && avatar.classList.contains('bot-avatar')) avatar.remove();
      }
    }

    const count = sittingOut ? 0 : (s.cardCounts?.[seat] ?? 0);
    cardsEl.className = 'card-backs';
    cardsEl.innerHTML = Array(count).fill('<div class="card-back"></div>').join('');
  }
  // Re-apply any remote streams that arrived while the waiting screen was visible
  applyAllRemoteStreams();
}

function renderBottomLabels(s) {
  const p = s.players?.find(q => q.seat === mySeat);
  const nameEl = el('name-bottom');
  const vlabel = el('vlabel-bottom');
  if (!nameEl) return;
  const isDealer   = mySeat === s.dealer;
  const isMaker    = mySeat === s.maker && s.trump;
  const isAutoPlay = p && p.autoPlay;
  let label = p ? esc(p.name) : myName;
  if (isDealer)   label += ' <span class="badge badge-dealer">Dealer</span>';
  if (isMaker)    label += ` <span class="badge badge-maker badge-suit-${s.trump}">${SUIT_SYM[s.trump]} Made it</span>`;
  if (isAutoPlay) label += ' <span class="badge badge-autoplay">AI</span>';
  nameEl.innerHTML = label;
  if (vlabel) vlabel.textContent = p ? p.name : myName;
}

// --- Trick area ---
function renderTrick(s) {
  // Hide trick area during non-playing phases to free up vertical space (especially on phone)
  const trickAreaEl = el('trick-area');
  if (trickAreaEl) {
    trickAreaEl.style.display =
      (s.phase === 'playing' || s.phase === 'hand_result' || s.phase === 'dealer_discard') ? '' : 'none';
  }

  const slots = { top: el('trick-top'), left: el('trick-left'),
                  right: el('trick-right'), bottom: el('trick-bottom') };
  for (const sl of Object.values(slots)) sl.innerHTML = '';
  el('trick-center').innerHTML = s.trump
    ? `<div class="trump-badge-center">` +
        `<span class="suit-${s.trump}">${SUIT_SYM[s.trump]}</span>` +
        `<small>trump</small>` +
        (s.maker != null ? `<small class="trump-maker-name">${esc(pname(s, s.maker))}</small>` : '') +
      `</div>`
    : '';

  if (s.currentTrick && s.currentTrick.length > 0) {
    for (const { card, seat } of s.currentTrick) {
      const pos = displayPos(seat);
      const slotEl = slots[pos];
      if (slotEl) {
        const playerLabel = pname(s, seat);
        slotEl.innerHTML = cardHTML(card, 'trick-card') +
          `<div class="trick-card-label">${esc(playerLabel)}</div>`;
      }
    }
  }

  const ltMsg = el('last-trick-msg');
  if (s.lastTrick && (!s.currentTrick || s.currentTrick.length === 0)) {
    ltMsg.textContent = `${pname(s, s.lastTrick.winner)} won last trick`;
  } else {
    ltMsg.textContent = '';
  }

  // Hand trick score strip — visible to everyone in the center zone
  const ht = el('hand-tricks');
  if (ht) {
    if (s.phase === 'playing' || s.phase === 'hand_result') {
      const t0 = s.trickCount[0], t1 = s.trickCount[1];
      const dots = n => '●'.repeat(n) + '○'.repeat(5 - n);
      ht.innerHTML =
        `<span class="ht-team ht-t0">${dots(t0)}</span>` +
        `<span class="ht-sep">${t0}&ndash;${t1}</span>` +
        `<span class="ht-team ht-t1">${dots(t1)}</span>`;
      ht.style.display = '';
    } else {
      ht.style.display = 'none';
    }
  }
}

// --- Upcard ---
function renderUpcard(s) {
  const area = el('upcard-area');
  if (s.upcard && !s.turnedDown && s.phase === 'bidding1') {
    const dealerName = pname(s, s.dealer);
    const dealerPos  = displayPos(s.dealer);
    // On phone the zone-center has auto height (no free space), so auto-margin
    // positioning has no effect and can cause overlap when side zones are taller.
    // Only apply the dealer-edge positioning on non-phone screens.
    const isPhone = window.innerWidth < 600;
    if (!isPhone) {
      area.style.marginTop    = dealerPos === 'bottom' ? 'auto' : '';
      area.style.marginBottom = dealerPos === 'top'    ? 'auto' : '';
      area.style.alignSelf    = dealerPos === 'left'   ? 'flex-start'
                              : dealerPos === 'right'  ? 'flex-end' : 'center';
    } else {
      area.style.marginTop = area.style.marginBottom = '';
      area.style.alignSelf = 'center';
    }
    area.innerHTML = `<div class="upcard-label">${esc(dealerName)}'s deal</div>${cardHTML(s.upcard, 'trick-card')}`;
  } else if (s.turnedDown) {
    area.style.marginTop = area.style.marginBottom = area.style.alignSelf = '';
    area.innerHTML = `<div class="upcard-label" style="color:#666">Turned down</div>`;
  } else {
    area.style.marginTop = area.style.marginBottom = area.style.alignSelf = '';
    area.innerHTML = '';
  }
}

// --- Hand sorting ---
// Groups cards by suit, keeping the left bower with the trump group.
// Suit order: non-trump suits (Spades, Hearts, Diamonds, Clubs order),
// trump group last so it stands out on the right.
function sortHand(cards, trump) {
  if (!cards || cards.length === 0) return cards;
  const leftBowerSuit = trump ? SAME_COLOR[trump] : null;
  const SUIT_PRI = { S: 0, H: 1, D: 2, C: 3 };

  function effectiveSuit(card) {
    if (trump && card.rank === 'J' && card.suit === leftBowerSuit) return trump;
    return card.suit;
  }

  function suitKey(card) {
    const eff = effectiveSuit(card);
    if (eff === trump) return 4; // trump always last (rightmost group)
    return SUIT_PRI[eff];
  }

  function rankKey(card) {
    // Right bower is highest trump, left bower is second highest
    if (trump && card.rank === 'J' && card.suit === trump)          return 16; // right bower
    if (trump && card.rank === 'J' && card.suit === leftBowerSuit)  return 15; // left bower
    return RANK_VAL[card.rank]; // 9→9, 10→10, J→11, Q→12, K→13, A→14
  }

  return [...cards].sort((a, b) => {
    const sd = suitKey(a) - suitKey(b);
    if (sd !== 0) return sd;
    return rankKey(a) - rankKey(b); // low→high within suit; bowers rightmost in trump
  });
}

// --- My hand ---
function renderMyHand(s) {
  const handEl = el('my-hand');
  if (!s.myHand) return;

  const isPlayPhase    = s.phase === 'playing'        && s.currentTurn === mySeat;
  const isDiscardPhase = s.phase === 'dealer_discard' && s.dealer === mySeat;
  const sittingOut     = s.goingAlone && mySeat === (s.alonePlayer + 2) % 4;

  if (sittingOut) {
    handEl.innerHTML = '<div class="sitting-out-msg">You are sitting out this hand</div>';
    return;
  }

  const sortedHand = sortHand(s.myHand, s.trump);

  handEl.innerHTML = sortedHand.map(card => {
    let cls = 'hand-card';
    if (isPlayPhase) {
      cls += cardPlayable(card, s.myHand, s.currentTrick, s.trump) ? ' playable' : ' unplayable';
    } else if (isDiscardPhase) {
      cls += ' playable';
    }
    return `<div class="card ${card.suit} ${cls}"
                 onclick="onCardClick('${card.suit}','${card.rank}')"
                 title="${card.rank} of ${SUIT_NAME[card.suit]}">
              <div class="c-rank">${card.rank}</div>
              <div class="c-suit">${SUIT_SYM[card.suit]}</div>
            </div>`;
  }).join('');
}

// --- Actions ---
function renderActions(s) {
  const act = el('actions');
  act.innerHTML = '';

  if (s.phase === 'bidding1' && s.currentTurn === mySeat) {
    const isMyDeal = s.dealer === mySeat;
    const bidVerb  = isMyDeal ? 'Pick Up' : 'Order Up';
    act.innerHTML = `
      <span class="action-label">${isMyDeal ? 'Pick up' : 'Order up'}
        <strong class="suit-${s.upcard.suit}">${s.upcard.rank}${SUIT_SYM[s.upcard.suit]}</strong>?
      </span>
      <label class="go-alone-label"><input type="checkbox" id="chk-alone"> Go Alone</label>
      <button class="btn btn-success" onclick="orderUp()">${bidVerb}</button>
      <button class="btn btn-secondary" onclick="doPass()">Pass</button>`;

  } else if (s.phase === 'bidding1') {
    const p = s.players?.find(q => q.seat === s.currentTurn);
    const label = p && p.isBot ? `🤖 ${pname(s, s.currentTurn)} is thinking…` : `${pname(s, s.currentTurn)} is deciding…`;
    act.innerHTML = `<span class="action-label waiting">${label}</span>`;

  } else if (s.phase === 'bidding2' && s.currentTurn === mySeat) {
    const isDealer = s.dealer === mySeat;
    const suits = ['S','H','D','C'].filter(su => su !== s.turnedDownSuit);
    act.innerHTML = `
      <span class="action-label">${isDealer ? 'Stick the dealer – name trump:' : 'Name trump or pass:'}</span>
      <label class="go-alone-label"><input type="checkbox" id="chk-alone"> Go Alone</label>
      ${suits.map(su => `<button class="btn btn-suit btn-${su}" onclick="nameTrump('${su}')">
        ${SUIT_SYM[su]} ${SUIT_NAME[su]}</button>`).join('')}
      ${!isDealer ? `<button class="btn btn-secondary" onclick="doPass()">Pass</button>` : ''}`;

  } else if (s.phase === 'bidding2') {
    const isDealer = s.dealer === s.currentTurn;
    const p = s.players?.find(q => q.seat === s.currentTurn);
    const bot = p && p.isBot ? '🤖 ' : '';
    act.innerHTML = `<span class="action-label waiting">${bot}${pname(s, s.currentTurn)}${isDealer ? ' must call (stuck)' : ' is deciding'}…</span>`;

  } else if (s.phase === 'dealer_discard' && s.dealer === mySeat) {
    act.innerHTML = `<span class="action-label">
      Picked up <strong class="suit-${s.upcard.suit}">${s.upcard.rank}${SUIT_SYM[s.upcard.suit]}</strong>
      — tap a card below to discard it</span>`;

  } else if (s.phase === 'dealer_discard') {
    const p = s.players?.find(q => q.seat === s.dealer);
    const bot = p && p.isBot ? '🤖 ' : '';
    act.innerHTML = `<span class="action-label waiting">${bot}${pname(s, s.dealer)} is discarding…</span>`;

  } else if (s.phase === 'playing') {
    const myPlayerInfo = s.players?.find(q => q.seat === mySeat);
    const myAutoPlay   = myPlayerInfo?.autoPlay;
    const sittingOut   = s.goingAlone && mySeat === (s.alonePlayer + 2) % 4;
    if (sittingOut) {
      act.innerHTML = `<span class="action-label">You are sitting out</span>`;
    } else if (myAutoPlay) {
      act.innerHTML = `<span class="action-label" style="color:#ff9800;font-weight:600">🤖 AI is playing for you</span>`;
    } else if (s.currentTurn === mySeat) {
      act.innerHTML = `<span class="action-label" style="color:#ffd54f;font-weight:700">Your turn – play a card</span>`;
    } else {
      const p = s.players?.find(q => q.seat === s.currentTurn);
      const bot = (p && p.isBot) || (p && p.autoPlay) ? '🤖 ' : '';
      act.innerHTML = `<span class="action-label waiting">${bot}${pname(s, s.currentTurn)}'s turn…</span>`;
    }
    if (s.canThrowIn) {
      act.innerHTML += `<button class="btn btn-throw-in" onclick="throwIn()" title="Outcome is decided – end the hand now">Throw In</button>`;
    }

  } else if (s.phase === 'hand_result') {
    act.innerHTML = `<span class="action-label waiting">Next hand starting soon…</span>`;

  } else if (s.phase === 'game_over' || s.phase === 'series_over') {
    act.innerHTML = `<button class="btn btn-primary" onclick="socket.emit('restart_game',{})">Play Again</button>`;
  }

}

// --- Trick counter ---
function renderTrickCounter(s) {
  const el2 = el('trick-counter');
  if (!el2) return;
  if (s.phase !== 'playing' && s.phase !== 'hand_result') { el2.innerHTML = ''; return; }
  const myTeam = mySeat % 2;
  const theirTeam = 1 - myTeam;
  el2.innerHTML = `
    <div class="tc-row"><span class="tc-us">Our tricks:</span>  <strong>${s.trickCount[myTeam]}</strong></div>
    <div class="tc-row"><span class="tc-them">Their tricks:</span> <strong>${s.trickCount[theirTeam]}</strong></div>
    ${s.maker != null ? `<div style="font-size:.72rem;color:#aaa;margin-top:2px">Maker: ${pname(s,s.maker)}</div>` : ''}`;
}

// --- Turn highlight ---
function highlightTurn(s) {
  for (let seat = 0; seat < 4; seat++) {
    const pos = displayPos(seat);
    const zone = el(`zone-${pos}`);
    if (zone) zone.classList.toggle('is-turn', seat === s.currentTurn && s.phase === 'playing');
  }
}

// ============================================================
// Overlays
// ============================================================
function showHandResult(s) {
  const r = s.lastHandResult;
  const myTeam   = mySeat % 2;
  const myPts    = r.pts[myTeam];
  const makerWon = r.pts[s.makerTeam] > 0; // makers got ≥ 3 tricks

  // "Euchred" only applies to the maker team when they failed to get 3 tricks
  let heading;
  if (myPts > 0 && !makerWon) {
    heading = '🎉 Euchre! You got 2 points!';
  } else if (myPts > 0) {
    heading = '🎉 You scored!';
  } else if (!makerWon) {
    // My team made the bid but got euchred
    heading = '😬 Euchred!';
  } else {
    // Makers won the hand; defending team got 0 pts — not a euchre
    heading = '📋 Makers scored';
  }

  el('overlay-content').innerHTML = `
    <h2>${heading}</h2>
    <p>${esc(r.msg)}</p>
    <div class="score-line">
      <span style="color:#64b5f6">${s.scores[0]}</span>
      &nbsp;–&nbsp;
      <span style="color:#ef9a9a">${s.scores[1]}</span>
    </div>
    <p style="color:#888;font-size:.8rem">Next hand in 4 seconds…</p>`;
  el('overlay').classList.remove('hidden');
}

function selectSeries(type) {
  roomSeriesType = type;
  if (socket) socket.emit('select_series', { seriesType: type });
  showWaiting(roomPlayers);
}

function showGameOver(s) {
  const myTeam = mySeat % 2;
  const won = s.winner === myTeam;
  const scoreHTML = `<div class="score-line">
    <span style="color:#64b5f6">${s.scores[0]}</span> &nbsp;–&nbsp;
    <span style="color:#ef9a9a">${s.scores[1]}</span></div>`;

  if (s.seriesType !== 'single') {
    // Mid-series game over — show result + series tally, next game auto-starts in 5 s
    const sw = s.seriesWins || [0, 0];
    el('overlay-content').innerHTML = `
      <h2>${won ? '🏆 Game Won!' : '💀 Game Lost'}</h2>
      ${scoreHTML}
      <p class="series-status">Series: <span style="color:#64b5f6">${sw[0]}</span> – <span style="color:#ef9a9a">${sw[1]}</span></p>
      <p style="color:#888;font-size:.8rem;margin:.4rem 0">Next game starting in 5 seconds…</p>`;
  } else {
    // Single game — offer format choices for next play
    el('overlay-content').innerHTML = `
      <h2>${won ? '🏆 Your Team Wins!' : '💀 Your Team Lost'}</h2>
      ${scoreHTML}
      <div class="overlay-btns">
        <button class="btn btn-primary"   onclick="socket.emit('restart_game',{})">Play Again</button>
        <button class="btn btn-secondary" onclick="socket.emit('restart_game',{seriesType:'bo3',countCurrentGame:true})">Best of 3</button>
        <button class="btn btn-secondary" onclick="socket.emit('restart_game',{seriesType:'bo5',countCurrentGame:true})">Best of 5</button>
        <button class="btn btn-leave"     onclick="leaveGame()">Leave</button>
      </div>`;
  }
  el('overlay').classList.remove('hidden');
}

function showSeriesOver(s) {
  const myTeam = mySeat % 2;
  const won = s.winner === myTeam;
  const label = s.seriesType === 'bo3' ? 'Best of 3' : 'Best of 5';
  const sw = s.seriesWins || [0, 0];
  el('overlay-content').innerHTML = `
    <h2>${won ? '🏆 Series Won!' : '💀 Series Lost'}</h2>
    <p style="color:#aaa;margin:.2rem 0 .5rem">${label}</p>
    <div class="score-line">
      <span style="color:#64b5f6">${sw[0]}</span> &nbsp;–&nbsp;
      <span style="color:#ef9a9a">${sw[1]}</span>
    </div>
    <div class="overlay-btns">
      <button class="btn btn-primary"   onclick="socket.emit('restart_game',{})">Play Again</button>
      <button class="btn btn-secondary" onclick="socket.emit('restart_game',{seriesType:'single'})">Single Game</button>
      <button class="btn btn-leave"     onclick="leaveGame()">Leave</button>
    </div>`;
  el('overlay').classList.remove('hidden');
}

function hideOverlay() {
  el('overlay').classList.add('hidden');
}

// ============================================================
// Card utilities (client-side)
// ============================================================
function effSuit(card, trump) {
  if (!trump) return card.suit;
  if (card.rank === 'J' && card.suit === SAME_COLOR[trump]) return trump;
  return card.suit;
}

function cardPlayable(card, hand, trick, trump) {
  if (!trick || trick.length === 0) return true;
  const led = effSuit(trick[0].card, trump);
  const canFollow = hand.some(c => effSuit(c, trump) === led);
  if (canFollow) return effSuit(card, trump) === led;
  return true;
}

function cardHTML(card, extraClass = '') {
  return `<div class="card ${card.suit} ${extraClass}">
    <div class="c-rank">${card.rank}</div>
    <div class="c-suit">${SUIT_SYM[card.suit]}</div>
  </div>`;
}

// ============================================================
// Game actions
// ============================================================
function onCardClick(suit, rank) {
  if (!gameState || !socket) return;
  const s = gameState;
  const card = { suit, rank };

  if (s.phase === 'playing' && s.currentTurn === mySeat) {
    if (!cardPlayable(card, s.myHand, s.currentTrick, s.trump)) {
      toast('You must follow suit!', 'error');
      return;
    }
    socket.emit('play_card', { card });

  } else if (s.phase === 'dealer_discard' && s.dealer === mySeat) {
    socket.emit('dealer_discard', { card });
  }
}

function orderUp() {
  if (!socket) return;
  const goAlone = el('chk-alone')?.checked || false;
  socket.emit('bid_order_up', { goAlone });
}

function doPass() {
  if (!socket) return;
  socket.emit('bid_pass');
}

function nameTrump(suit) {
  if (!socket) return;
  const goAlone = el('chk-alone')?.checked || false;
  socket.emit('bid_name_suit', { suit, goAlone });
}

// ============================================================
// Chat
// ============================================================
function sendChat() {
  const inp = el('chat-input');
  if (!inp || !inp.value.trim() || !socket) return;
  socket.emit('chat_message', { message: inp.value.trim() });
  inp.value = '';
}

function appendChat(name, message) {
  const msgs = el('chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `<strong>${esc(name)}:</strong> ${esc(message)}`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendSystemMsg(text) {
  const msgs = el('chat-messages');
  if (msgs) {
    const div = document.createElement('div');
    div.className = 'chat-system';
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }
  const log = el('game-log');
  if (log) {
    const entry = document.createElement('div');
    entry.className = 'game-log-entry';
    entry.textContent = text;
    log.prepend(entry);
    // Keep only last 4 entries
    while (log.children.length > 4) log.removeChild(log.lastChild);
  }
}

// ============================================================
// Misc helpers
// ============================================================
function el(id) { return document.getElementById(id); }

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function pname(s, seat) {
  const p = s.players?.find(p => p.seat === seat);
  return p ? p.name : `Seat ${seat + 1}`;
}

function toast(msg, type = 'info') {
  const t = el('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

function copyLink() {
  navigator.clipboard?.writeText(el('share-url').value)
    .then(() => toast('Link copied!', 'success'))
    .catch(() => toast('Select and copy the link manually', 'info'));
}

// ============================================================
// Media controls
// ============================================================
function toggleMute() {
  micEnabled = !micEnabled;
  if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  syncMediaBtns();
  if (socket) socket.emit('media_state', { muted: !micEnabled, videoOff: !camEnabled });
}

async function toggleCamera() {
  camEnabled = !camEnabled;
  if (camEnabled) {
    await acquireCamera();
  } else {
    releaseCamera();
  }
  syncMediaBtns();
  if (socket) socket.emit('media_state', { muted: !micEnabled, videoOff: !camEnabled });
}

function syncMediaBtns() {
  // In-game mic button
  const mBtn = el('btn-mute');
  if (mBtn) {
    mBtn.textContent = micEnabled ? '🎤' : '🔇';
    mBtn.title       = micEnabled ? 'Mute mic' : 'Unmute mic';
    mBtn.classList.toggle('off', !micEnabled);
  }
  // In-game camera button
  const cBtn = el('btn-cam');
  if (cBtn) {
    cBtn.textContent = camEnabled ? '📷' : '🚫';
    cBtn.title       = camEnabled ? 'Turn off camera' : 'Turn on camera';
    cBtn.classList.toggle('off', !camEnabled);
  }
  // In-game local video visibility
  const v = el('video-local');
  if (v) v.style.visibility = camEnabled ? '' : 'hidden';
  // Waiting-room mic button
  const wmBtn = el('btn-waiting-mic');
  if (wmBtn) {
    wmBtn.textContent = micEnabled ? '🎤  Mic On' : '🔇  Mic Off';
    wmBtn.classList.toggle('off', !micEnabled);
  }
  // Waiting-room camera button
  const wcBtn = el('btn-waiting-cam');
  if (wcBtn) {
    wcBtn.textContent = camEnabled ? '📷  Camera On' : '🚫  Camera Off';
    wcBtn.classList.toggle('off', !camEnabled);
  }
  // Waiting-room preview overlay
  const overlay = el('preview-cam-off');
  if (overlay) overlay.style.display = camEnabled ? 'none' : '';
}

// Show/hide the 🔇 badge on a remote player's video tile
function updateMuteBadge(seat) {
  if (mySeat === -1) return;
  const pos = displayPos(seat);
  if (pos === 'bottom') return; // that's us — button already shows state
  const badge = el(`mute-${pos}`);
  if (!badge) return;
  const state = mediaStates[seat];
  badge.classList.toggle('hidden', !state?.muted);
}

// ============================================================
// Video feed visibility toggle
// ============================================================
let videoFeedsVisible = true;
function toggleVideoFeeds() {
  videoFeedsVisible = !videoFeedsVisible;
  el('screen-game').classList.toggle('hide-video', !videoFeedsVisible);
  const btn = el('btn-video-feeds');
  if (btn) {
    btn.textContent = videoFeedsVisible ? '📹' : '📵';
    btn.title = videoFeedsVisible ? 'Hide video feeds' : 'Show video feeds';
    btn.classList.toggle('feeds-hidden', !videoFeedsVisible);
  }
}

// ============================================================
// Fullscreen
// ============================================================
function toggleFullscreen() {
  const btn = el('btn-fullscreen');
  if (!document.fullscreenElement) {
    (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen
      ? document.documentElement.requestFullscreen?.() || document.documentElement.webkitRequestFullscreen?.()
      : null);
    if (btn) btn.textContent = '✕';
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen
      ? document.exitFullscreen?.() || document.webkitExitFullscreen?.()
      : null);
    if (btn) btn.textContent = '⛶';
  }
}
document.addEventListener('fullscreenchange', () => {
  const btn = el('btn-fullscreen');
  if (btn) btn.textContent = document.fullscreenElement ? '✕' : '⛶';
});

// ============================================================
// Leave game
// ============================================================
function leaveGame() {
  el('overlay-content').innerHTML = `
    <h2 style="color:#ef9a9a">Leave Game?</h2>
    <p style="margin:.6rem 0 1.2rem">Your seat will be taken over by an AI player.</p>
    <div style="display:flex;gap:.8rem;justify-content:center">
      <button class="btn btn-danger"    onclick="confirmLeave()">Yes, Leave</button>
      <button class="btn btn-secondary" onclick="hideOverlay()">Stay</button>
    </div>`;
  el('overlay').classList.remove('hidden');
}

function confirmLeave() {
  // Reload cleanly — server detects disconnect and adds a bot
  location.reload();
}

// ============================================================
// Chat toggle (mobile)
// ============================================================
function toggleChat() {
  chatVisible = !chatVisible;
  const panel = el('chat-panel');
  const btn   = el('chat-toggle');
  if (panel) panel.classList.toggle('mobile-hidden', !chatVisible);
  if (btn)   btn.style.opacity = chatVisible ? '1' : '.5';
}

// Hide chat by default on small screens
function initChatVisibility() {
  if (window.innerWidth < 600) {
    chatVisible = false;
    const panel = el('chat-panel');
    if (panel) panel.classList.add('mobile-hidden');
  }
}

document.addEventListener('DOMContentLoaded', initChatVisibility);
