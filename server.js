const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ─── Stock Catalog (Indian Market) ──────────────────────────────────────────
const STOCK_CATALOG = [
  { ticker: 'RELIANCE', name: 'Reliance Industries',       basePrice: 2950.00, volatility: 0.012 },
  { ticker: 'TCS',      name: 'Tata Consultancy Services', basePrice: 4150.00, volatility: 0.010 },
  { ticker: 'HDFCBANK', name: 'HDFC Bank',                 basePrice: 1650.00, volatility: 0.015 },
  { ticker: 'TATAMOTORS', name: 'Tata Motors',             basePrice:  980.00, volatility: 0.022 },
  { ticker: 'ZOMATO',   name: 'Zomato',                    basePrice:  230.00, volatility: 0.035 },
  { ticker: 'SUZLON',   name: 'Suzlon Energy',             basePrice:   65.00, volatility: 0.045 },
];

// ─── News Headlines (Indian Market) ─────────────────────────────────────────
const NEWS_EVENTS = [
  { headline: 'Reliance Jio announces ₹75,000 Cr 5G expansion across Tier-2 cities!',       ticker: 'RELIANCE',    sentiment: 'bullish',  multiplier:  0.065 },
  { headline: 'SEBI launches probe into Reliance Industries insider trading allegations',    ticker: 'RELIANCE',    sentiment: 'bearish',  multiplier: -0.055 },
  { headline: 'TCS bags massive ₹15,000 Cr digital transformation deal with UK govt!',      ticker: 'TCS',         sentiment: 'bullish',  multiplier:  0.070 },
  { headline: 'TCS Q3 results disappoint — attrition rate hits 2-year high',                ticker: 'TCS',         sentiment: 'bearish',  multiplier: -0.060 },
  { headline: 'RBI holds repo rate steady — HDFC Bank set to benefit from credit growth',    ticker: 'HDFCBANK',    sentiment: 'bullish',  multiplier:  0.050 },
  { headline: 'HDFC Bank reports spike in NPAs — asset quality concerns mount!',             ticker: 'HDFCBANK',    sentiment: 'bearish',  multiplier: -0.065 },
  { headline: 'Tata Motors EV sales surge 300% — dominates Indian EV market!',               ticker: 'TATAMOTORS',  sentiment: 'bullish',  multiplier:  0.070 },
  { headline: 'Tata Motors recalls 50,000 Nexon EVs over battery safety concerns',          ticker: 'TATAMOTORS',  sentiment: 'bearish',  multiplier: -0.060 },
  { headline: 'Zomato acquires quick-commerce rival — Blinkit GMV doubles!',                 ticker: 'ZOMATO',      sentiment: 'bullish',  multiplier:  0.065 },
  { headline: 'Suzlon bags ₹8,000 Cr wind energy order from Adani Green!',                  ticker: 'SUZLON',      sentiment: 'bullish',  multiplier:  0.070 },
  { headline: 'Suzlon promoters pledge additional shares — market spooked!',                 ticker: 'SUZLON',      sentiment: 'bearish',  multiplier: -0.060 },
  { headline: 'Zomato Q3 margins squeeze — profitability concerns resurface!',               ticker: 'ZOMATO',      sentiment: 'bearish',  multiplier: -0.065 },
];

// ─── Room State ─────────────────────────────────────────────────────────────
const rooms = new Map();

function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function createRoomState(hostId, hostName, durationMinutes = 10) {
  // Deep-copy stocks with live prices
  const stocks = STOCK_CATALOG.map(s => ({
    ...s,
    price: s.basePrice,
    changePercent: 0,
    activeSentiment: 0,
    newsDuration: 0,
  }));

  const validMinutes = [10, 20, 30].includes(Number(durationMinutes)) ? Number(durationMinutes) : 10;
  const durationSeconds = validMinutes * 60;

  return {
    hostId,
    players: new Map(),  // socketId → { name, cash, portfolio: { ticker: qty } }
    stocks,
    durationMinutes: validMinutes,
    durationSeconds,
    timer: durationSeconds,
    tickInterval: null,
    newsInterval: null,
    gameStarted: false,
  };
}

function addPlayer(room, socketId, name) {
  const portfolio = {};
  STOCK_CATALOG.forEach(s => { portfolio[s.ticker] = 0; });
  room.players.set(socketId, { name, cash: 1000000, portfolio });
}

function getPlayerList(room) {
  const list = [];
  room.players.forEach((p, id) => list.push({ name: p.name, id }));
  return list;
}

// ─── Market Engine ──────────────────────────────────────────────────────────
function tickPrices(room) {
  room.stocks.forEach(stock => {
    if (stock.newsDuration > 0) {
      // Small follow-through (0.5% to 1% per tick) in direction of news
      const followThrough = (0.005 + Math.random() * 0.005) * stock.activeSentiment;
      stock.price = stock.price * (1 + followThrough);
      stock.newsDuration--;
    } else {
      // Standard background noise clamped strictly to ±0.5% to ±1.5% range
      const mag = 0.005 + Math.random() * 0.010;
      const noise = Math.random() < 0.5 ? mag : -mag;
      
      // Mean reversion toward base price (gentle pull keeping unprovoked drift within ~5%)
      const reversion = (stock.basePrice - stock.price) * 0.03;
      stock.price = stock.price * (1 + noise) + reversion;
      
      // Clamp overall unprovoked drift to ±5% of base price
      const minPrice = stock.basePrice * 0.88;
      const maxPrice = stock.basePrice * 1.12;
      stock.price = Math.min(Math.max(stock.price, minPrice), maxPrice);
    }

    stock.price = Math.max(stock.price, 1);
    stock.changePercent = ((stock.price - stock.basePrice) / stock.basePrice) * 100;
  });
}

function broadcastPrices(roomCode, room) {
  const stockData = room.stocks.map(s => ({
    ticker: s.ticker,
    name: s.name,
    price: Math.round(s.price * 100) / 100,
    changePercent: Math.round(s.changePercent * 100) / 100,
  }));
  io.to(roomCode).emit('priceUpdate', { stocks: stockData });
}

// ─── Leaderboard ────────────────────────────────────────────────────────────
function calculateNetWorth(player, stocks) {
  let stockValue = 0;
  stocks.forEach(s => {
    const qty = player.portfolio[s.ticker] || 0;
    stockValue += qty * s.price;
  });
  return {
    cash: Math.round(player.cash * 100) / 100,
    stockValue: Math.round(stockValue * 100) / 100,
    netWorth: Math.round((player.cash + stockValue) * 100) / 100,
  };
}

function broadcastLeaderboard(roomCode, room) {
  const entries = [];
  room.players.forEach((player, id) => {
    const { netWorth } = calculateNetWorth(player, room.stocks);
    entries.push({ name: player.name, netWorth, id });
  });
  entries.sort((a, b) => b.netWorth - a.netWorth);
  entries.forEach((e, i) => { e.rank = i + 1; });
  io.to(roomCode).emit('leaderboard', entries);
}

function broadcastPortfolios(roomCode, room) {
  room.players.forEach((player, id) => {
    const { cash, stockValue, netWorth } = calculateNetWorth(player, room.stocks);
    io.to(id).emit('portfolioUpdate', {
      cash,
      stockValue,
      netWorth,
      portfolio: { ...player.portfolio },
    });
  });
}

// ─── News Engine ────────────────────────────────────────────────────────────
function fireNewsEvent(roomCode, room) {
  const event = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
  
  // Broadcast news headline immediately
  io.to(roomCode).emit('newsFlash', {
    headline: event.headline,
    ticker: event.ticker,
    sentiment: event.sentiment,
  });

  // Delay actual price shock execution by exactly 3 seconds (3000ms)
  setTimeout(() => {
    if (!rooms.has(roomCode)) return;
    const stock = room.stocks.find(s => s.ticker === event.ticker);
    if (stock) {
      // Execute news impact move (capped ±5% to ±7%)
      stock.price = stock.price * (1 + event.multiplier);
      
      // Clamp overall total movement cap to max ±12% of base price
      const minLimit = stock.basePrice * 0.88;
      const maxLimit = stock.basePrice * 1.12;
      stock.price = Math.min(Math.max(stock.price, minLimit), maxLimit);
      
      stock.changePercent = ((stock.price - stock.basePrice) / stock.basePrice) * 100;
      stock.activeSentiment = Math.sign(event.multiplier);
      stock.newsDuration = 3; // 3 follow-through ticks
      
      broadcastPrices(roomCode, room);
    }
  }, 3000);
}

// ─── Game Loop ──────────────────────────────────────────────────────────────
function startGame(roomCode, room) {
  room.gameStarted = true;
  room.timer = room.durationSeconds || 600;

  // Send initial state
  const stockData = room.stocks.map(s => ({
    ticker: s.ticker,
    name: s.name,
    price: Math.round(s.price * 100) / 100,
    changePercent: 0,
  }));
  io.to(roomCode).emit('gameStarted', { stocks: stockData, timer: room.timer });

  // Send initial portfolios
  broadcastPortfolios(roomCode, room);

  // 1-second tick: prices, leaderboard, timer
  room.tickInterval = setInterval(() => {
    room.timer--;
    tickPrices(room);
    broadcastPrices(roomCode, room);
    broadcastLeaderboard(roomCode, room);
    broadcastPortfolios(roomCode, room);
    io.to(roomCode).emit('timerUpdate', { remaining: room.timer });

    if (room.timer <= 0) {
      endGame(roomCode, room);
    }
  }, 1000);

  // News every 15 seconds
  room.newsInterval = setInterval(() => {
    if (room.timer > 5) { // don't fire news in last 5 seconds
      fireNewsEvent(roomCode, room);
    }
  }, 15000);
}

function endGame(roomCode, room) {
  clearInterval(room.tickInterval);
  clearInterval(room.newsInterval);

  const standings = [];
  room.players.forEach((player, id) => {
    const { netWorth } = calculateNetWorth(player, room.stocks);
    standings.push({ name: player.name, netWorth, id });
  });
  standings.sort((a, b) => b.netWorth - a.netWorth);
  standings.forEach((e, i) => { e.rank = i + 1; });

  io.to(roomCode).emit('gameOver', { standings });

  // Clean up room after a delay
  setTimeout(() => { rooms.delete(roomCode); }, 60000);
}

// ─── Socket Handlers ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  socket.on('createRoom', ({ playerName, durationMinutes }) => {
    let roomCode;
    do { roomCode = generateRoomCode(); } while (rooms.has(roomCode));

    const room = createRoomState(socket.id, playerName, durationMinutes);
    addPlayer(room, socket.id, playerName);
    rooms.set(roomCode, room);

    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit('roomCreated', { roomCode, durationMinutes: room.durationMinutes });
    io.to(roomCode).emit('playerJoined', { players: getPlayerList(room) });
    console.log(`🏠 Room ${roomCode} created by ${playerName} (${room.durationMinutes} mins)`);
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found. Check the code and try again.' });
      return;
    }
    if (room.gameStarted) {
      socket.emit('error', { message: 'Game already in progress. Cannot join.' });
      return;
    }
    if (room.players.has(socket.id)) {
      socket.emit('error', { message: 'You are already in this room.' });
      return;
    }

    addPlayer(room, socket.id, playerName);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit('roomJoined', { roomCode });
    io.to(roomCode).emit('playerJoined', { players: getPlayerList(room) });
    console.log(`👤 ${playerName} joined ${roomCode}`);
  });

  socket.on('startGame', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.hostId) {
      socket.emit('error', { message: 'Only the host can start the game.' });
      return;
    }
    if (room.gameStarted) return;

    console.log(`🎮 Game started in ${roomCode}`);
    startGame(roomCode, room);
  });

  socket.on('executeTrade', ({ roomCode, ticker, action, quantity }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameStarted) {
      socket.emit('tradeResult', { success: false, message: 'Game not active.' });
      return;
    }

    const player = room.players.get(socket.id);
    if (!player) {
      socket.emit('tradeResult', { success: false, message: 'Player not found.' });
      return;
    }

    const stock = room.stocks.find(s => s.ticker === ticker);
    if (!stock) {
      socket.emit('tradeResult', { success: false, message: 'Invalid stock.' });
      return;
    }

    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      socket.emit('tradeResult', { success: false, message: 'Invalid quantity.' });
      return;
    }

    const totalCost = stock.price * qty;

    if (action === 'BUY') {
      if (player.cash < totalCost) {
        socket.emit('tradeResult', {
          success: false,
          message: `Insufficient funds. Need ₹${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} but only have ₹${player.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`,
        });
        return;
      }
      player.cash -= totalCost;
      player.portfolio[ticker] = (player.portfolio[ticker] || 0) + qty;
      socket.emit('tradeResult', {
        success: true,
        message: `Bought ${qty} shares of ${ticker} at ₹${stock.price.toFixed(2)}`,
        cash: Math.round(player.cash * 100) / 100,
        portfolio: { ...player.portfolio },
      });
    } else if (action === 'SELL') {
      const held = player.portfolio[ticker] || 0;
      if (held < qty) {
        socket.emit('tradeResult', {
          success: false,
          message: `Insufficient shares. You hold ${held} shares of ${ticker}.`,
        });
        return;
      }
      player.cash += totalCost;
      player.portfolio[ticker] -= qty;
      socket.emit('tradeResult', {
        success: true,
        message: `Sold ${qty} shares of ${ticker} at ₹${stock.price.toFixed(2)}`,
        cash: Math.round(player.cash * 100) / 100,
        portfolio: { ...player.portfolio },
      });
    } else {
      socket.emit('tradeResult', { success: false, message: 'Invalid action.' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.players.delete(socket.id);
    io.to(roomCode).emit('playerJoined', { players: getPlayerList(room) });

    // If room is empty, clean up
    if (room.players.size === 0) {
      clearInterval(room.tickInterval);
      clearInterval(room.newsInterval);
      rooms.delete(roomCode);
      console.log(`🗑️  Room ${roomCode} deleted (empty)`);
    }
  });
});

// ─── Start Server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🏦 MockEx Stock Exchange running on http://localhost:${PORT}\n`);
});
