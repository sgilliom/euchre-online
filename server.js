const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Database = require('better-sqlite3');
const { router: gameRouter, init: initGame } = require('./game-routes');

const app = express();
const server = http.createServer(app);

// ── SQLite setup ──────────────────────────────────────────────────
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'game.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS game_sessions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL,
    question_ids      TEXT NOT NULL DEFAULT '[]',
    score             INTEGER DEFAULT 0,
    max_possible      INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    completed         INTEGER DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at      DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS session_answers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL,
    question_id     INTEGER NOT NULL,
    selected_choice TEXT NOT NULL,
    is_correct      INTEGER NOT NULL,
    score_earned    INTEGER DEFAULT 0,
    ai_feedback     TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES game_sessions(id)
  );
`);
initGame(db);
const io = new Server(server, {
  // Required for reverse-proxy deployments (Render, Railway, etc.)
  transports: ['websocket', 'polling'],
  // Keep connections alive through Render's 55-second idle proxy timeout
  pingInterval: 20000,   // send ping every 20 s
  pingTimeout:  55000,   // wait 55 s for pong before declaring disconnect
});

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Game API routes ───────────────────────────────────────────────
app.use('/api/game', gameRouter);

// Build/deploy timestamp — resets every time the server process starts (i.e. every deploy)
const BUILD_TIME = new Date().toISOString();

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/version', (req, res) => res.json({ buildTime: BUILD_TIME }));

// RTC config endpoint — set TURN_URL / TURN_USERNAME / TURN_CREDENTIAL for internet play
app.get('/api/rtc-config', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    // Free public TURN relay — works for mobile/cellular and symmetric NAT
    { urls: 'turn:openrelay.metered.ca:80',               username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',              username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp',username: 'openrelayproject', credential: 'openrelayproject' },
  ];
  if (process.env.TURN_URL) {
    // Custom TURN takes priority — insert at front
    iceServers.unshift({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
  }
  res.json({ iceServers });
});

app.get('/phd-game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'phd-game.html')));
app.get('/phd-simulator', (req, res) => res.sendFile(path.join(__dirname, 'public', 'phd-simulator.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ============================================================
// Card constants
// ============================================================
const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];
const SAME_COLOR = { S: 'C', C: 'S', H: 'D', D: 'H' };
const RANK_VAL = { '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

// ============================================================
// Card utilities
// ============================================================
function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank });
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function effSuit(card, trump) {
  if (!trump) return card.suit;
  if (card.rank === 'J' && card.suit === SAME_COLOR[trump]) return trump;
  return card.suit;
}

function cardPower(card, trump, ledSuit) {
  const es = effSuit(card, trump);
  if (es === trump) {
    if (card.rank === 'J' && card.suit === trump) return 100;
    if (card.rank === 'J' && card.suit === SAME_COLOR[trump]) return 90;
    return RANK_VAL[card.rank] + 50;
  }
  if (ledSuit && es === ledSuit) return RANK_VAL[card.rank];
  return 0;
}

function trickWinner(trick, trump) {
  const led = effSuit(trick[0].card, trump);
  let best = trick[0];
  let bestPow = cardPower(trick[0].card, trump, led);
  for (let i = 1; i < trick.length; i++) {
    const pow = cardPower(trick[i].card, trump, led);
    if (pow > bestPow) { bestPow = pow; best = trick[i]; }
  }
  return best.seat;
}

function isMisdeal(hands) {
  for (const hand of Object.values(hands)) {
    if (!hand.some(c => ['J', 'Q', 'K', 'A'].includes(c.rank))) return true;
  }
  return false;
}

function canFollowSuit(hand, ledSuit, trump) {
  return hand.some(c => effSuit(c, trump) === ledSuit);
}

function isLegalPlay(card, hand, trick, trump) {
  if (!trick || trick.length === 0) return true;
  const led = effSuit(trick[0].card, trump);
  if (canFollowSuit(hand, led, trump)) return effSuit(card, trump) === led;
  return true;
}

// ============================================================
// Room / game state
// ============================================================
const rooms = new Map();

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, {
    id, players: [], game: null, hostId: null,
    seriesType: 'single',   // 'single' | 'bo3' | 'bo5'
    seriesWins: [0, 0],     // wins per team across games in current series
  });
  return rooms.get(id);
}

function bySocket(socketId) {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.id === socketId);
    if (player) return { player, room };
  }
  return null;
}

function team(seat) { return seat % 2; }

// ============================================================
// Bot players
// ============================================================
const BOT_NAMES = ['North (AI)', 'East (AI)', 'South (AI)', 'West (AI)'];

function addBotsToRoom(room) {
  const taken = new Set(room.players.map(p => p.seat));
  for (let seat = 0; seat < 4; seat++) {
    if (!taken.has(seat)) {
      room.players.push({
        id: `bot-${room.id}-${seat}`,
        name: BOT_NAMES[seat],
        seat,
        isBot: true,
      });
    }
  }
}

function triggerBotAction(room) {
  const g = room.game;
  if (!g) return;
  if (g.trickPause) return;  // wait until 2-second trick display is done
  const currentPlayer = room.players.find(p => p.seat === g.currentTurn);
  if (!currentPlayer) return;
  if (!currentPlayer.isBot && !currentPlayer.autoPlay) return;

  const seat  = currentPlayer.seat;
  const phase = g.phase;
  const delay = 700 + Math.random() * 700;
  setTimeout(() => {
    if (!room.game || room.game.phase !== phase) return;
    // Re-look up the player by seat so we always use the current player object.
    // A disconnect/reconnect between the triggerBotAction call and this callback
    // can change the player's id (and therefore their hand key), so using the
    // original captured reference would access g.hands[staleId] === undefined.
    const actor = room.players.find(p => p.seat === seat);
    if (!actor || (!actor.isBot && !actor.autoPlay)) return;
    if (phase === 'bidding1')            botBidRound1(room, actor);
    else if (phase === 'bidding2')       botBidRound2(room, actor);
    else if (phase === 'dealer_discard') botDiscard(room, actor);
    else if (phase === 'playing')        botPlayCard(room, actor);
  }, delay);
}

function botBidRound1(room, botPlayer) {
  const g = room.game;
  if (g.phase !== 'bidding1' || g.currentTurn !== botPlayer.seat) return;

  const hand = g.hands[botPlayer.id];
  if (!hand) return;
  const ts = g.upcard.suit;
  const trumpCount = hand.filter(c => effSuit(c, ts) === ts).length;
  const isDealer = botPlayer.seat === g.dealer;

  if (trumpCount >= 2 || (isDealer && trumpCount >= 1)) {
    g.trump = ts;
    g.maker = botPlayer.seat;
    g.makerTeam = team(botPlayer.seat);
    g.goingAlone = false;
    g.alonePlayer = null;
    const dealer = room.players.find(p => p.seat === g.dealer);
    if (dealer) g.hands[dealer.id].push(g.upcard);
    g.phase = 'dealer_discard';
    g.currentTurn = g.dealer;
  } else {
    advanceBid(room);
  }
  broadcast(room);
  triggerBotAction(room);
}

function botBidRound2(room, botPlayer) {
  const g = room.game;
  if (g.phase !== 'bidding2' || g.currentTurn !== botPlayer.seat) return;

  const hand = g.hands[botPlayer.id];
  if (!hand) return;
  const isDealer = botPlayer.seat === g.dealer;

  // Count effective trump cards per eligible suit
  const scores = {};
  for (const s of ['S', 'H', 'D', 'C']) {
    if (s === g.turnedDownSuit) continue;
    scores[s] = hand.filter(c => effSuit(c, s) === s).length;
  }
  const bestSuit = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const bestCount = scores[bestSuit];

  if (isDealer || bestCount >= 2) {
    g.trump = bestSuit;
    g.maker = botPlayer.seat;
    g.makerTeam = team(botPlayer.seat);
    g.goingAlone = false;
    g.alonePlayer = null;
    setTrumpAndPlay(room);
  } else {
    advanceBid(room);
  }
  broadcast(room);
  triggerBotAction(room);
}

function botDiscard(room, botPlayer) {
  const g = room.game;
  if (g.phase !== 'dealer_discard' || botPlayer.seat !== g.dealer) return;

  const hand = g.hands[botPlayer.id];
  if (!hand) return;
  // Discard lowest non-trump card; if all trump, discard lowest trump
  const nonTrump = hand.filter(c => effSuit(c, g.trump) !== g.trump);
  const pool = nonTrump.length > 0 ? nonTrump : hand;
  const worst = pool.reduce((lo, c) => RANK_VAL[c.rank] < RANK_VAL[lo.rank] ? c : lo);
  hand.splice(hand.indexOf(worst), 1);

  setTrumpAndPlay(room);
  broadcast(room);
  triggerBotAction(room);
}

function botPlayCard(room, botPlayer) {
  const g = room.game;
  if (g.phase !== 'playing' || g.currentTurn !== botPlayer.seat) return;
  if (g.goingAlone && botPlayer.seat === (g.alonePlayer + 2) % 4) return;

  const hand = g.hands[botPlayer.id];
  if (!hand) return;
  const legal = hand.filter(c => isLegalPlay(c, hand, g.currentTrick, g.trump));
  const isMyTeamMaker = g.makerTeam === team(botPlayer.seat);

  let chosen;
  if (g.currentTrick.length === 0) {
    // Leading
    const trumpCards = legal.filter(c => effSuit(c, g.trump) === g.trump);
    const nonTrump = legal.filter(c => effSuit(c, g.trump) !== g.trump);
    if (isMyTeamMaker && trumpCards.length >= 2) {
      // Lead trump to pull opponents' trump
      chosen = trumpCards.reduce((best, c) =>
        cardPower(c, g.trump, g.trump) > cardPower(best, g.trump, g.trump) ? c : best);
    } else if (nonTrump.length > 0) {
      chosen = nonTrump.reduce((best, c) =>
        RANK_VAL[c.rank] > RANK_VAL[best.rank] ? c : best);
    } else {
      chosen = trumpCards.reduce((best, c) =>
        cardPower(c, g.trump, g.trump) > cardPower(best, g.trump, g.trump) ? c : best);
    }
  } else {
    // Following
    const led = effSuit(g.currentTrick[0].card, g.trump);
    const bestPow = Math.max(...g.currentTrick.map(t => cardPower(t.card, g.trump, led)));
    const winners = legal.filter(c => cardPower(c, g.trump, led) > bestPow);

    if (winners.length > 0) {
      // Win with cheapest winning card
      chosen = winners.reduce((best, c) =>
        cardPower(c, g.trump, led) < cardPower(best, g.trump, led) ? c : best);
    } else {
      // Can't win — dump lowest value card
      chosen = legal.reduce((best, c) =>
        cardPower(c, g.trump, led) < cardPower(best, g.trump, led) ? c : best);
    }
  }

  const idx = hand.findIndex(c => c.suit === chosen.suit && c.rank === chosen.rank);
  hand.splice(idx, 1);
  g.currentTrick.push({ card: chosen, seat: botPlayer.seat });

  const playersInTrick = g.goingAlone ? 3 : 4;
  if (g.currentTrick.length === playersInTrick) {
    const winner = trickWinner(g.currentTrick, g.trump);
    g.trickCount[team(winner)]++;
    g.lastTrick = { cards: [...g.currentTrick], winner };
    g.trickPause = true;
    broadcast(room); // show all 4 cards for 2 seconds
    setTimeout(() => {
      if (!room.game) return;
      room.game.trickPause = false;
      if (g.trickCount[0] + g.trickCount[1] === 5) {
        scoreHand(room);
        broadcast(room);
      } else {
        g.currentTrick = [];
        let lead = winner;
        if (g.goingAlone && lead === (g.alonePlayer + 2) % 4) lead = (lead + 1) % 4;
        g.currentTurn = lead;
        broadcast(room);
        triggerBotAction(room);
      }
    }, 2000);
  } else {
    let next = (botPlayer.seat + 1) % 4;
    if (g.goingAlone && next === (g.alonePlayer + 2) % 4) next = (next + 1) % 4;
    g.currentTurn = next;
    broadcast(room);
    triggerBotAction(room);
  }
}

// ============================================================
// New hand setup
// ============================================================
function dealHand(room) {
  const { players } = room;
  // Sort by seat to ensure consistent deal order
  const bySeats = [0, 1, 2, 3].map(s => players.find(p => p.seat === s));
  let hands, upcard, attempts = 0;

  do {
    attempts++;
    const deck = shuffle(createDeck());
    hands = {};
    for (let i = 0; i < 4; i++) hands[bySeats[i].id] = deck.slice(i * 5, i * 5 + 5);
    upcard = deck[20];
  } while (isMisdeal(hands) && attempts < 10);

  const g = room.game;
  g.hands = hands;
  g.upcard = upcard;
  g.trump = null;
  g.maker = null;
  g.makerTeam = null;
  g.goingAlone = false;
  g.alonePlayer = null;
  g.turnedDown = false;
  g.turnedDownSuit = null;
  g.currentTrick = [];
  g.trickCount = [0, 0];
  g.lastTrick = null;
  g.lastHandResult = null;
  g.phase = 'bidding1';
  g.currentTurn = (g.dealer + 1) % 4;
  g.biddingStart = g.currentTurn;
  g.misdealCount = attempts - 1;
}

function startGame(room) {
  room.game = {
    phase: 'waiting',
    dealer: Math.floor(Math.random() * 4),
    scores: [0, 0],
    roundsPlayed: 0,
    hands: {},
    upcard: null,
    trump: null,
    maker: null,
    makerTeam: null,
    goingAlone: false,
    alonePlayer: null,
    turnedDown: false,
    turnedDownSuit: null,
    currentTurn: 0,
    biddingStart: 0,
    currentTrick: [],
    trickCount: [0, 0],
    lastTrick: null,
    lastHandResult: null,
    misdealCount: 0,
  };
  dealHand(room);
}

// ============================================================
// Bidding helpers
// ============================================================
function advanceBid(room) {
  const g = room.game;
  const next = (g.currentTurn + 1) % 4;

  if (g.phase === 'bidding1') {
    if (next === g.biddingStart) {
      g.turnedDown = true;
      g.turnedDownSuit = g.upcard.suit;
      g.phase = 'bidding2';
      g.currentTurn = g.biddingStart;
    } else {
      g.currentTurn = next;
    }
  } else if (g.phase === 'bidding2') {
    if (next === g.biddingStart) {
      g.dealer = (g.dealer + 1) % 4;
      dealHand(room);
    } else {
      g.currentTurn = next;
    }
  }
}

function setTrumpAndPlay(room) {
  const g = room.game;
  let lead = (g.dealer + 1) % 4;
  if (g.goingAlone) {
    const partner = (g.alonePlayer + 2) % 4;
    if (lead === partner) lead = (lead + 1) % 4;
  }
  g.phase = 'playing';
  g.currentTurn = lead;
  g.currentTrick = [];
}

// ============================================================
// Scoring
// ============================================================
function scoreHand(room) {
  const g = room.game;
  const mt = g.makerTeam;
  const dt = 1 - mt;
  const mTricks = g.trickCount[mt];
  const dTricks = g.trickCount[dt];
  let pts = [0, 0];
  let msg;

  if (mTricks >= 3) {
    if (mTricks === 5) {
      if (g.goingAlone) {
        pts[mt] = 4;
        msg = `${playerName(room, g.alonePlayer)} went alone and swept all 5! 4 points!`;
      } else {
        pts[mt] = 2;
        msg = `Makers swept all 5 tricks! 2 points!`;
      }
    } else {
      pts[mt] = 1;
      msg = `Makers won ${mTricks} tricks. 1 point.`;
    }
  } else {
    pts[dt] = 2;
    msg = `EUCHRE! Defenders won ${dTricks} tricks. 2 points!`;
  }

  g.scores[0] += pts[0];
  g.scores[1] += pts[1];
  g.lastHandResult = { pts, msg, trickCount: [...g.trickCount] };

  if (g.scores[0] >= 10 || g.scores[1] >= 10) {
    g.winner = g.scores[0] >= 10 ? 0 : 1;
    if (room.seriesType !== 'single') {
      room.seriesWins[g.winner]++;
      const needed = room.seriesType === 'bo3' ? 2 : 3;
      if (room.seriesWins[g.winner] >= needed) {
        // Series complete
        g.phase = 'series_over';
      } else {
        // Game over within a series — show result briefly, then start next game
        g.phase = 'game_over';
        setTimeout(() => {
          if (room.game && room.game.phase === 'game_over') {
            startGame(room);
            broadcast(room);
            triggerBotAction(room);
          }
        }, 5000);
      }
    } else {
      g.phase = 'game_over';
    }
  } else {
    g.phase = 'hand_result';
    g.dealer = (g.dealer + 1) % 4;
    g.roundsPlayed++;
    setTimeout(() => {
      if (room.game && room.game.phase === 'hand_result') {
        dealHand(room);
        broadcast(room);
        triggerBotAction(room);
      }
    }, 4000);
  }
}

function playerName(room, seat) {
  const p = room.players.find(p => p.seat === seat);
  return p ? p.name : `Seat ${seat + 1}`;
}

// ============================================================
// State broadcasting
// ============================================================
function publicState(room) {
  const g = room.game;
  if (!g) return null;
  const sittingOutSeat = g.goingAlone ? (g.alonePlayer + 2) % 4 : -1;
  return {
    phase: g.phase,
    dealer: g.dealer,
    currentTurn: g.currentTurn,
    trump: g.trump,
    upcard: g.upcard,
    turnedDown: g.turnedDown,
    turnedDownSuit: g.turnedDownSuit,
    maker: g.maker,
    makerTeam: g.makerTeam,
    goingAlone: g.goingAlone,
    alonePlayer: g.alonePlayer,
    currentTrick: g.currentTrick,
    trickCount: g.trickCount,
    scores: g.scores,
    lastTrick: g.lastTrick,
    lastHandResult: g.lastHandResult,
    winner: g.winner,
    seriesType: room.seriesType,
    seriesWins: [...room.seriesWins],
    misdealCount: g.misdealCount,
    canThrowIn: (() => {
      if (g.phase !== 'playing' || g.trickPause) return false;
      const mt = g.makerTeam;
      const dt = 1 - mt;
      return (g.trickCount[mt] >= 3 && g.trickCount[dt] >= 1) || g.trickCount[dt] >= 3;
    })(),
    cardCounts: room.players.reduce((a, p) => {
      a[p.seat] = (p.seat === sittingOutSeat) ? 0 : (g.hands[p.id] || []).length;
      return a;
    }, {}),
  };
}

function broadcast(room) {
  const pub = publicState(room);
  const allPlayers = room.players.map(q => ({ name: q.name, seat: q.seat, isBot: !!q.isBot, autoPlay: !!q.autoPlay }));
  for (const p of room.players) {
    if (p.isBot) continue;
    const sock = io.sockets.sockets.get(p.id);
    if (!sock) continue;
    sock.emit('game_state', {
      ...pub,
      myHand: room.game.hands[p.id] || [],
      mySeat: p.seat,
      players: allPlayers,
    });
  }
}

function broadcastRoom(room) {
  io.to(room.id).emit('room_state', {
    roomId: room.id,
    players: room.players.map(p => ({ id: p.id, name: p.name, seat: p.seat, isBot: !!p.isBot })),
    gameStarted: !!room.game,
    hostId: room.hostId,
    seriesType: room.seriesType,
    seriesWins: [...room.seriesWins],
  });
}

// ============================================================
// Socket.io events
// ============================================================
io.on('connection', socket => {
  console.log('connect', socket.id);

  // --- Join room ---
  socket.on('join_room', ({ roomId, playerName: name }) => {
    const room = getRoom(roomId);
    // Count human seats only
    const humanCount = room.players.filter(p => !p.isBot).length;
    if (humanCount >= 4) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    // Assign seat in partner-first order: 0, 2, 1, 3
    // This puts the 1st & 2nd human across from each other (partners),
    // so each player sees their human teammate at the top of their screen.
    const SEAT_ORDER = [0, 2, 1, 3];
    const humanSeats = new Set(room.players.filter(p => !p.isBot).map(p => p.seat));
    const seat = SEAT_ORDER.find(s => !humanSeats.has(s)) ?? 0;

    // Remove a bot from this seat if present
    room.players = room.players.filter(p => !(p.isBot && p.seat === seat));

    const player = { id: socket.id, name: name || `Player ${seat + 1}`, seat, autoPlay: false };
    room.players.push(player);
    if (!room.hostId) room.hostId = socket.id; // first human to join is the host
    socket.join(roomId);
    socket.data.roomId = roomId;

    socket.to(roomId).emit('player_joined', { id: socket.id, name: player.name, seat, isBot: false });

    socket.emit('joined_room', {
      roomId, seat, name: player.name,
      hostId: room.hostId,
      seriesType: room.seriesType,
      players: room.players.map(p => ({ id: p.id, name: p.name, seat: p.seat, isBot: !!p.isBot })),
    });

    broadcastRoom(room);

    if (room.game) broadcast(room);
  });

  // --- Start game (host only, fills bots if needed) ---
  socket.on('start_game', () => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { room } = r;
    if (room.game) return;
    if (socket.id !== room.hostId) return;
    addBotsToRoom(room);
    broadcastRoom(room);
    if (room.players.length === 4) {
      startGame(room);
      broadcast(room);
      triggerBotAction(room);
    }
  });

  // --- Start with AI players ---
  socket.on('start_with_bots', () => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { room } = r;
    if (room.game) return;
    if (room.players.filter(p => !p.isBot).length < 1) return;

    addBotsToRoom(room);
    broadcastRoom(room);
    setTimeout(() => {
      startGame(room);
      broadcast(room);
      triggerBotAction(room);
    }, 800);
  });

  // --- Swap seats (host only, pre-game) ---
  socket.on('swap_seats', ({ seat1, seat2 }) => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { room } = r;
    if (room.game) return;                     // can't swap after game starts
    if (socket.id !== room.hostId) return;     // host only
    const p1 = room.players.find(p => p.seat === seat1);
    if (!p1) return;
    const p2 = room.players.find(p => p.seat === seat2);
    if (p2) {
      [p1.seat, p2.seat] = [seat2, seat1]; // swap both players
    } else {
      p1.seat = seat2;                     // move to empty seat
    }
    broadcastRoom(room);
  });

  // --- WebRTC signaling relay ---
  socket.on('webrtc_offer',  ({ targetId, offer })     => io.to(targetId).emit('webrtc_offer',  { fromId: socket.id, offer }));
  socket.on('webrtc_answer', ({ targetId, answer })    => io.to(targetId).emit('webrtc_answer', { fromId: socket.id, answer }));
  socket.on('webrtc_ice',    ({ targetId, candidate }) => io.to(targetId).emit('webrtc_ice',    { fromId: socket.id, candidate }));

  // --- Bidding: order up ---
  socket.on('bid_order_up', ({ goAlone }) => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { player, room } = r;
    const g = room.game;
    if (g.phase !== 'bidding1' || g.currentTurn !== player.seat) return;

    g.trump = g.upcard.suit;
    g.maker = player.seat;
    g.makerTeam = team(player.seat);
    g.goingAlone = !!goAlone;
    g.alonePlayer = goAlone ? player.seat : null;

    const dealer = room.players.find(p => p.seat === g.dealer);
    if (dealer) g.hands[dealer.id].push(g.upcard);

    g.phase = 'dealer_discard';
    g.currentTurn = g.dealer;
    broadcast(room);
    triggerBotAction(room);
  });

  // --- Bidding: pass ---
  socket.on('bid_pass', () => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { player, room } = r;
    const g = room.game;
    if (!['bidding1', 'bidding2'].includes(g.phase) || g.currentTurn !== player.seat) return;
    if (g.phase === 'bidding2' && player.seat === g.dealer) {
      socket.emit('error', { message: 'Stick the dealer! You must call a suit.' });
      return;
    }
    advanceBid(room);
    broadcast(room);
    triggerBotAction(room);
  });

  // --- Bidding: name trump (round 2) ---
  socket.on('bid_name_suit', ({ suit, goAlone }) => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { player, room } = r;
    const g = room.game;
    if (g.phase !== 'bidding2' || g.currentTurn !== player.seat) return;
    if (suit === g.turnedDownSuit) {
      socket.emit('error', { message: 'Cannot name the turned-down suit.' });
      return;
    }
    g.trump = suit;
    g.maker = player.seat;
    g.makerTeam = team(player.seat);
    g.goingAlone = !!goAlone;
    g.alonePlayer = goAlone ? player.seat : null;
    setTrumpAndPlay(room);
    broadcast(room);
    triggerBotAction(room);
  });

  // --- Dealer discards ---
  socket.on('dealer_discard', ({ card }) => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { player, room } = r;
    const g = room.game;
    if (g.phase !== 'dealer_discard' || player.seat !== g.dealer) return;
    const hand = g.hands[socket.id];
    const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (idx === -1) return;
    hand.splice(idx, 1);
    setTrumpAndPlay(room);
    broadcast(room);
    triggerBotAction(room);
  });

  // --- Play a card ---
  socket.on('play_card', ({ card }) => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { player, room } = r;
    const g = room.game;
    if (g.phase !== 'playing' || g.currentTurn !== player.seat) return;

    if (g.goingAlone && player.seat === (g.alonePlayer + 2) % 4) return;

    const hand = g.hands[socket.id];
    const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (idx === -1) return;

    if (!isLegalPlay(card, hand, g.currentTrick, g.trump)) {
      socket.emit('error', { message: 'You must follow suit.' });
      return;
    }

    hand.splice(idx, 1);
    g.currentTrick.push({ card, seat: player.seat });

    const playersInTrick = g.goingAlone ? 3 : 4;

    if (g.currentTrick.length === playersInTrick) {
      const winner = trickWinner(g.currentTrick, g.trump);
      g.trickCount[team(winner)]++;
      g.lastTrick = { cards: [...g.currentTrick], winner };
      g.trickPause = true;
      broadcast(room); // show all 4 cards for 2 seconds
      setTimeout(() => {
        if (!room.game) return;
        room.game.trickPause = false;
        if (g.trickCount[0] + g.trickCount[1] === 5) {
          scoreHand(room);
          broadcast(room);
        } else {
          g.currentTrick = [];
          let lead = winner;
          if (g.goingAlone && lead === (g.alonePlayer + 2) % 4) lead = (lead + 1) % 4;
          g.currentTurn = lead;
          broadcast(room);
          triggerBotAction(room);
        }
      }, 2000);
    } else {
      let next = (player.seat + 1) % 4;
      if (g.goingAlone && next === (g.alonePlayer + 2) % 4) next = (next + 1) % 4;
      g.currentTurn = next;
      broadcast(room);
      triggerBotAction(room);
    }
  });

  // --- Throw in the cards (concede when outcome is determined) ---
  socket.on('throw_in', () => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { player, room } = r;
    const g = room.game;
    if (g.phase !== 'playing' || g.trickPause) return;
    const mt = g.makerTeam;
    const dt = 1 - mt;
    const canThrowIn = (g.trickCount[mt] >= 3 && g.trickCount[dt] >= 1) || g.trickCount[dt] >= 3;
    if (!canThrowIn) return;
    io.to(room.id).emit('system_msg', { text: `${player.name} threw in the cards!` });
    scoreHand(room);
    broadcast(room);
  });

  // --- Toggle "play for me" (autoPlay) ---
  socket.on('toggle_auto_play', () => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { player, room } = r;
    if (!room.game) return;
    player.autoPlay = !player.autoPlay;
    const msg = player.autoPlay
      ? `${player.name} is letting AI play for them`
      : `${player.name} is back in control`;
    io.to(room.id).emit('system_msg', { text: msg });
    broadcast(room);
    if (player.autoPlay) triggerBotAction(room);
  });

  // --- Chat ---
  socket.on('chat_message', ({ message }) => {
    const r = bySocket(socket.id);
    if (!r) return;
    io.to(r.room.id).emit('chat_message', {
      name: r.player.name,
      seat: r.player.seat,
      message: String(message).substring(0, 300),
    });
  });

  // --- Series type selection (host only, pre-game) ---
  socket.on('select_series', ({ seriesType }) => {
    const r = bySocket(socket.id);
    if (!r || r.room.game || socket.id !== r.room.hostId) return;
    if (!['single', 'bo3', 'bo5'].includes(seriesType)) return;
    r.room.seriesType = seriesType;
    broadcastRoom(r.room);
  });

  // --- Restart / new series ---
  socket.on('restart_game', ({ seriesType, countCurrentGame } = {}) => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { room } = r;
    // Optionally change series type (called from game-over overlay buttons)
    if (seriesType && ['single', 'bo3', 'bo5'].includes(seriesType)) {
      const oldType = room.seriesType;
      room.seriesType = seriesType;
      // Carry the just-finished single-game result into the new series
      if (countCurrentGame && seriesType !== 'single' && room.game && room.game.winner != null) {
        room.seriesWins = [0, 0];
        room.seriesWins[room.game.winner] = 1;
      } else {
        room.seriesWins = [0, 0];
      }
    } else {
      room.seriesWins = [0, 0];
    }
    const hadBots = room.players.some(p => p.isBot);
    // Remove old bots; re-add if needed
    room.players = room.players.filter(p => !p.isBot);
    if (hadBots || room.players.length < 4) addBotsToRoom(room);
    if (room.players.length === 4) {
      startGame(room);
      broadcast(room);
      triggerBotAction(room);
    }
  });

  // --- Media state (mute / camera) ---
  socket.on('media_state', ({ muted, videoOff }) => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { player, room } = r;
    player.muted    = !!muted;
    player.videoOff = !!videoOff;
    // Relay to everyone else in the room so they can show the indicator
    socket.to(room.id).emit('player_media_state', {
      seat: player.seat, muted: player.muted, videoOff: player.videoOff,
    });
  });

  // --- Rejoin in-progress game (reconnect within grace period) ---
  socket.on('rejoin_game', ({ roomId, playerName, seat }) => {
    const room = rooms.get(roomId);
    if (!room || !room.game) return;

    // Two reconnect scenarios:
    // (a) Slow reconnect (> 6s): bot was placed — find it by seat + isBot
    // (b) Fast reconnect (< 6s): original player record still present with old socket id
    const target =
      room.players.find(p => p.isBot && p.seat === seat) ||
      room.players.find(p => !p.isBot && p.seat === seat && p.id !== socket.id);
    if (!target) return; // seat is held by another active human

    const oldId = target.id;
    target.id       = socket.id;
    target.name     = playerName;
    target.isBot    = false;
    target.autoPlay = false;

    // Re-key this player's hand from old ID → new socket ID so they can still play.
    // Without this, broadcast() sends myHand:[] and the player's cards are gone.
    if (room.game.hands && room.game.hands[oldId]) {
      room.game.hands[socket.id] = room.game.hands[oldId];
      delete room.game.hands[oldId];
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.emit('joined_room', {
      roomId, seat, name: playerName,
      hostId: room.hostId,
      players: room.players.map(p => ({ id: p.id, name: p.name, seat: p.seat, isBot: !!p.isBot })),
    });
    broadcastRoom(room);
    broadcast(room);
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    const r = bySocket(socket.id);
    if (!r) return;
    const { player, room } = r;
    const { seat, name } = player;

    // Notify others immediately
    io.to(room.id).emit('player_left', { id: socket.id, name, seat });

    // Give the player 6 seconds to reconnect before handing their seat to a bot
    setTimeout(() => {
      // If the player already rejoined (id changed) their slot is no longer in the list
      if (room.players.find(p => p.id === socket.id)) {
        // Still the old socket id — player never came back
        room.players = room.players.filter(p => p.id !== socket.id);
        const humansLeft = room.players.filter(p => !p.isBot).length;
        if (humansLeft === 0) {
          rooms.delete(room.id);
        } else if (room.game && room.game.phase !== 'game_over') {
          // Re-key the departing player's hand to the bot ID they're about to receive
          // so the bot can actually read the hand and play cards.
          const botId = `bot-${room.id}-${seat}`;
          if (room.game.hands && room.game.hands[socket.id]) {
            room.game.hands[botId] = room.game.hands[socket.id];
            delete room.game.hands[socket.id];
          }
          addBotsToRoom(room);
          broadcastRoom(room);
          broadcast(room);
          triggerBotAction(room);
        } else {
          broadcastRoom(room);
        }
      }
    }, 6000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Euchre running at http://localhost:${PORT}`);

  // Self-ping every 10 minutes to keep Render.com instance awake.
  // Always use localhost so the http module works (external URL may be https://).
  setInterval(() => {
    http.get(`http://localhost:${PORT}/health`, res => {
      res.resume(); // discard response body
    }).on('error', err => console.warn('Keep-alive ping failed:', err.message));
  }, 10 * 60 * 1000);
});
