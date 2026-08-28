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

// ─── Stock Catalog (Exact INR Base Prices) ──────────────────────────────────
const STOCK_CATALOG = [
  { ticker: 'RELIANCE',   name: 'Reliance Industries',       basePrice: 2949.98, volatility: 0.012 },
  { ticker: 'TCS',        name: 'Tata Consultancy Services', basePrice: 4149.98, volatility: 0.010 },
  { ticker: 'HDFCBANK',   name: 'HDFC Bank',                 basePrice: 1650.04, volatility: 0.015 },
  { ticker: 'TATAMOTORS', name: 'Tata Motors',             basePrice:  979.98, volatility: 0.022 },
  { ticker: 'ZOMATO',     name: 'Zomato',                    basePrice:  230.01, volatility: 0.035 },
  { ticker: 'SUZLON',     name: 'Suzlon Energy',             basePrice:   65.00, volatility: 0.045 },
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

function createRoomState(hostId, hostName, modeOrMinutes = '10') {
  const stocks = STOCK_CATALOG.map(s => ({
    ...s,
    price: s.basePrice,
    changePercent: 0,
    activeSentiment: 0,
    newsDuration: 0,
  }));

  const isMatch = String(modeOrMinutes).toLowerCase() === 'match';
  const validMinutes = [10, 20, 30].includes(Number(modeOrMinutes)) ? Number(modeOrMinutes) : 10;
  const durationSeconds = isMatch ? 600 : validMinutes * 60; // 600s per round for match

  return {
    hostId,
    hostName,
    mode: isMatch ? 'match' : 'standard',
    players: new Map(), // socketId → { name, cash, portfolio: { ticker: { qty, avgPrice } } }
    stocks,
    durationMinutes: isMatch ? 40 : validMinutes,
    durationSeconds,
    timer: durationSeconds,
    phase: isMatch ? 'round1' : 'active', // match phases: round1, break1, round2, break2, round3, finished
    phaseTimer: isMatch ? 600 : durationSeconds,
    isMarketFrozen: false,
    tickInterval: null,
    newsInterval: null,
    gameStarted: false,
  };
}

function addPlayer(room, socketId, name) {
  // If match mode and player is host, host is Master (not a player)
  if (room.mode === 'match' && socketId === room.hostId) {
    return;
  }
  const portfolio = {};
  STOCK_CATALOG.forEach(s => {
    portfolio[s.ticker] = { qty: 0, avgPrice: 0 };
  });
  room.players.set(socketId, { name, cash: 1000000, portfolio });
}

function getPlayerList(room) {
  const list = [];
  room.players.forEach((p, id) => list.push({ name: p.name, id }));
  return list;
}

// ─── Market Engine ──────────────────────────────────────────────────────────
function tickPrices(room) {
  if (room.isMarketFrozen) return;

  if (room.mode === 'standard') {
    room.stocks.forEach(stock => {
      if (stock.newsDuration > 0) {
        const followThrough = (0.005 + Math.random() * 0.005) * stock.activeSentiment;
        stock.price = stock.price * (1 + followThrough);
        stock.newsDuration--;
      } else {
        const mag = 0.005 + Math.random() * 0.010;
        const noise = Math.random() < 0.5 ? mag : -mag;
        const reversion = (stock.basePrice - stock.price) * 0.03;
        stock.price = stock.price * (1 + noise) + reversion;
        
        const minPrice = stock.basePrice * 0.88;
        const maxPrice = stock.basePrice * 1.12;
        stock.price = Math.min(Math.max(stock.price, minPrice), maxPrice);
      }

      stock.price = Math.max(stock.price, 1);
      stock.changePercent = ((stock.price - stock.basePrice) / stock.basePrice) * 100;
    });
  }
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

// ─── Leaderboard & Portfolios ────────────────────────────────────────────────
function calculateNetWorth(player, stocks) {
  let stockValue = 0;
  let portfolioDetails = {};

  stocks.forEach(s => {
    const item = player.portfolio[s.ticker] || { qty: 0, avgPrice: 0 };
    const qty = item.qty || 0;
    const avgPrice = item.avgPrice || 0;
    
    // stockValue represents market value of long holdings (or liability of short)
    stockValue += qty * s.price;

    let pnl = 0;
    if (qty > 0) {
      pnl = (s.price - avgPrice) * qty;
    } else if (qty < 0) {
      pnl = (avgPrice - s.price) * Math.abs(qty);
    }

    portfolioDetails[s.ticker] = {
      qty,
      avgPrice: Math.round(avgPrice * 100) / 100,
      currentPrice: Math.round(s.price * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
    };
  });

  const netWorth = player.cash + stockValue;

  return {
    cash: Math.round(player.cash * 100) / 100,
    stockValue: Math.round(stockValue * 100) / 100,
    netWorth: Math.round(netWorth * 100) / 100,
    portfolioDetails,
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

  if (room.mode === 'standard') {
    io.to(roomCode).emit('leaderboard', entries);
  } else if (room.mode === 'match') {
    // Blind trading: only send full leaderboard to Master (host)
    io.to(room.hostId).emit('leaderboard', entries);
  }
}

function broadcastPortfolios(roomCode, room) {
  room.players.forEach((player, id) => {
    const { cash, stockValue, netWorth, portfolioDetails } = calculateNetWorth(player, room.stocks);
    io.to(id).emit('portfolioUpdate', {
      cash,
      stockValue,
      netWorth,
      portfolioDetails,
    });
  });
}

// ─── News Engine ────────────────────────────────────────────────────────────
function fireNewsEvent(roomCode, room) {
  if (room.isMarketFrozen) return;

  const event = NEWS_EVENTS[Math.floor(Math.random() * NEWS_EVENTS.length)];
  
  if (room.mode === 'standard') {
    io.to(roomCode).emit('newsFlash', {
      headline: event.headline,
      ticker: event.ticker,
      sentiment: event.sentiment,
      delaySeconds: 3,
    });

    setTimeout(() => {
      if (!rooms.has(roomCode)) return;
      const stock = room.stocks.find(s => s.ticker === event.ticker);
      if (stock && !room.isMarketFrozen) {
        stock.price = stock.price * (1 + event.multiplier);
        const minLimit = stock.basePrice * 0.88;
        const maxLimit = stock.basePrice * 1.12;
        stock.price = Math.min(Math.max(stock.price, minLimit), maxLimit);
        stock.changePercent = ((stock.price - stock.basePrice) / stock.basePrice) * 100;
        stock.activeSentiment = Math.sign(event.multiplier);
        stock.newsDuration = 3;
        broadcastPrices(roomCode, room);
      }
    }, 3000);
  } else if (room.mode === 'match') {
    // Match Mode: 5-second front-running window delay
    io.to(roomCode).emit('newsFlash', {
      headline: event.headline,
      ticker: event.ticker,
      sentiment: event.sentiment,
      delaySeconds: 5,
    });

    setTimeout(() => {
      if (!rooms.has(roomCode)) return;
      const stock = room.stocks.find(s => s.ticker === event.ticker);
      if (stock && !room.isMarketFrozen) {
        stock.price = stock.price * (1 + event.multiplier);
        stock.changePercent = ((stock.price - stock.basePrice) / stock.basePrice) * 100;
        broadcastPrices(roomCode, room);
        broadcastPortfolios(roomCode, room);
      }
    }, 5000);
  }
}

// ─── Game Loop & Phase Progression Engine ───────────────────────────────────
function startGame(roomCode, room) {
  room.gameStarted = true;

  if (room.mode === 'standard') {
    room.timer = room.durationSeconds || 600;
  } else if (room.mode === 'match') {
    room.phase = 'round1';
    room.phaseTimer = 600; // Round 1: 10 mins
    room.isMarketFrozen = false;
  }

  const stockData = room.stocks.map(s => ({
    ticker: s.ticker,
    name: s.name,
    price: Math.round(s.price * 100) / 100,
    changePercent: 0,
  }));

  io.to(roomCode).emit('gameStarted', {
    mode: room.mode,
    stocks: stockData,
    timer: room.mode === 'standard' ? room.timer : room.phaseTimer,
    phase: room.phase,
    isMarketFrozen: room.isMarketFrozen,
    isPaused: room.isPaused || false,
  });

  broadcastPortfolios(roomCode, room);
  broadcastLeaderboard(roomCode, room);

  // 1-second Tick Loop
  room.tickInterval = setInterval(() => {
    if (room.isPaused) {
      // Game paused by Master: broadcast static timer & pause state
      io.to(roomCode).emit('timerUpdate', {
        remaining: room.mode === 'standard' ? room.timer : room.phaseTimer,
        phase: room.phase,
        isMarketFrozen: true,
        isPaused: true,
      });
      return;
    }

    if (room.mode === 'standard') {
      room.timer--;
      tickPrices(room);
      broadcastPrices(roomCode, room);
      broadcastLeaderboard(roomCode, room);
      broadcastPortfolios(roomCode, room);
      io.to(roomCode).emit('timerUpdate', { remaining: room.timer, phase: 'standard', isMarketFrozen: false, isPaused: false });

      if (room.timer <= 0) {
        endGame(roomCode, room);
      }
    } else if (room.mode === 'match') {
      room.phaseTimer--;

      if (!room.isMarketFrozen) {
        broadcastPrices(roomCode, room);
      }
      broadcastLeaderboard(roomCode, room);
      broadcastPortfolios(roomCode, room);

      io.to(roomCode).emit('timerUpdate', {
        remaining: room.phaseTimer,
        phase: room.phase,
        isMarketFrozen: room.isMarketFrozen,
        isPaused: false,
      });

      // Match Phase Progression
      if (room.phaseTimer <= 0) {
        advanceMatchPhase(roomCode, room);
      }
    }
  }, 1000);

  // News Interval
  const newsDelay = room.mode === 'match' ? 10000 : 15000;
  room.newsInterval = setInterval(() => {
    if (room.isPaused) return;
    if (room.mode === 'standard' && room.timer > 5) {
      fireNewsEvent(roomCode, room);
    } else if (room.mode === 'match' && !room.isMarketFrozen && room.phaseTimer > 5) {
      fireNewsEvent(roomCode, room);
    }
  }, newsDelay);
}

function advanceMatchPhase(roomCode, room) {
  if (room.phase === 'round1') {
    room.phase = 'break1';
    room.phaseTimer = 300; // Break 1: 5 mins
    room.isMarketFrozen = true;
  } else if (room.phase === 'break1') {
    room.phase = 'round2';
    room.phaseTimer = 600; // Round 2: 10 mins
    room.isMarketFrozen = false;
  } else if (room.phase === 'round2') {
    room.phase = 'break2';
    room.phaseTimer = 300; // Break 2: 5 mins
    room.isMarketFrozen = true;
  } else if (room.phase === 'break2') {
    room.phase = 'round3';
    room.phaseTimer = 600; // Round 3: 10 mins
    room.isMarketFrozen = false;
  } else if (room.phase === 'round3') {
    room.phase = 'finished';
    endGame(roomCode, room);
    return;
  }

  io.to(roomCode).emit('phaseChanged', {
    phase: room.phase,
    phaseTimer: room.phaseTimer,
    isMarketFrozen: room.isMarketFrozen,
  });
  console.log(`⏱️ Match ${roomCode} phase changed to ${room.phase}`);
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

    socket.emit('roomCreated', {
      roomCode,
      mode: room.mode,
      isMaster: room.mode === 'match' && socket.id === room.hostId,
      durationMinutes: room.durationMinutes,
    });
    io.to(roomCode).emit('playerJoined', { players: getPlayerList(room) });
    console.log(`🏠 Room ${roomCode} created by ${playerName} (Mode: ${room.mode})`);
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

    addPlayer(room, socket.id, playerName);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit('roomJoined', {
      roomCode,
      mode: room.mode,
      isMaster: room.mode === 'match' && socket.id === room.hostId,
    });
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

    console.log(`🎮 Game started in ${roomCode} (Mode: ${room.mode})`);
    startGame(roomCode, room);
  });

  // Master Control Suite Handlers
  socket.on('master:togglePause', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameStarted) return;
    if (socket.id !== room.hostId) return socket.emit('error', { message: 'Only the host can pause/resume.' });

    room.isPaused = !room.isPaused;
    io.to(roomCode).emit('matchStateUpdated', {
      isPaused: room.isPaused,
      isMarketFrozen: room.isMarketFrozen || room.isPaused,
      phase: room.phase,
      message: room.isPaused ? 'Match PAUSED by Master.' : 'Match RESUMED by Master.',
    });
    console.log(`⏯️ Room ${roomCode} paused: ${room.isPaused}`);
  });

  socket.on('master:skipToBreak', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameStarted || room.mode !== 'match') return;
    if (socket.id !== room.hostId) return socket.emit('error', { message: 'Only the host can skip round.' });
    
    if (room.phase === 'round1') {
      room.phase = 'break1';
      room.phaseTimer = 300;
      room.isMarketFrozen = true;
    } else if (room.phase === 'round2') {
      room.phase = 'break2';
      room.phaseTimer = 300;
      room.isMarketFrozen = true;
    } else if (room.phase === 'round3') {
      room.phase = 'finished';
      endGame(roomCode, room);
      return;
    } else {
      return socket.emit('error', { message: 'Round is already in a break window.' });
    }

    io.to(roomCode).emit('phaseChanged', {
      phase: room.phase,
      phaseTimer: room.phaseTimer,
      isMarketFrozen: room.isMarketFrozen,
    });
    io.to(roomCode).emit('matchStateUpdated', {
      message: `Skipped to ${room.phase.toUpperCase()} by Master!`,
    });
    console.log(`⏩ Room ${roomCode} skipped to ${room.phase}`);
  });

  socket.on('master:endBreak', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameStarted || room.mode !== 'match') return;
    if (socket.id !== room.hostId) return socket.emit('error', { message: 'Only the host can end break.' });
    if (!room.phase.startsWith('break')) {
      return socket.emit('error', { message: 'Can only end break early during a break phase!' });
    }

    advanceMatchPhase(roomCode, room);
  });

  socket.on('master:extendBreak', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameStarted || room.mode !== 'match') return;
    if (socket.id !== room.hostId) return socket.emit('error', { message: 'Only the host can extend break.' });
    if (!room.phase.startsWith('break')) {
      return socket.emit('error', { message: 'Can only extend break during a break phase!' });
    }

    room.phaseTimer += 300; // Add +5 minutes
    io.to(roomCode).emit('timerUpdate', {
      remaining: room.phaseTimer,
      phase: room.phase,
      isMarketFrozen: room.isMarketFrozen,
      isPaused: room.isPaused,
    });
    io.to(roomCode).emit('matchStateUpdated', {
      message: 'Break extended by +5 minutes by Master!',
    });
    console.log(`⌛ Room ${roomCode} break extended +300s`);
  });

  socket.on('master:endRound', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameStarted) return;
    if (socket.id !== room.hostId) return socket.emit('error', { message: 'Only the host can end match.' });

    console.log(`🛑 Match ${roomCode} terminated early by Master.`);
    room.phase = 'finished';
    endGame(roomCode, room);
  });

  // Master Price Manipulation (During Breaks OR Paused in Match Mode)
  socket.on('masterUpdatePrice', ({ roomCode, ticker, newPrice }) => {
    const room = rooms.get(roomCode);
    if (!room || room.mode !== 'match') return;
    if (socket.id !== room.hostId) {
      socket.emit('error', { message: 'Only the Master can update stock prices.' });
      return;
    }
    if (!room.isMarketFrozen && !room.isPaused) {
      socket.emit('error', { message: 'Prices can only be edited during break phases or when paused!' });
      return;
    }

    const stock = room.stocks.find(s => s.ticker === ticker);
    const parsedPrice = parseFloat(newPrice);
    if (stock && !isNaN(parsedPrice) && parsedPrice > 0) {
      stock.price = Math.round(parsedPrice * 100) / 100;
      stock.changePercent = ((stock.price - stock.basePrice) / stock.basePrice) * 100;
      
      broadcastPrices(roomCode, room);
      broadcastPortfolios(roomCode, room);
      broadcastLeaderboard(roomCode, room);
      console.log(`🛠️ Master updated ${ticker} price to ₹${stock.price}`);
    }
  });

  // Trade Execution (BUY / SELL with Short Selling in Match Mode)
  socket.on('executeTrade', ({ roomCode, ticker, action, quantity }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameStarted) {
      socket.emit('tradeResult', { success: false, message: 'Game not active.' });
      return;
    }

    if (room.isPaused) {
      socket.emit('tradeResult', { success: false, message: 'Game is currently paused by the Master.' });
      return;
    }

    if (room.isMarketFrozen) {
      socket.emit('tradeResult', { success: false, message: 'Market is frozen during breaks!' });
      return;
    }

    const player = room.players.get(socket.id);
    if (!player) {
      socket.emit('tradeResult', { success: false, message: 'Master cannot execute trades.' });
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
    if (!player.portfolio[ticker]) {
      player.portfolio[ticker] = { qty: 0, avgPrice: 0 };
    }

    const currentItem = player.portfolio[ticker];
    const heldQty = currentItem.qty || 0;
    const heldAvg = currentItem.avgPrice || 0;

    if (action === 'BUY') {
      if (player.cash < totalCost) {
        socket.emit('tradeResult', {
          success: false,
          message: `Insufficient funds. Need ₹${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`,
        });
        return;
      }

      player.cash -= totalCost;

      if (heldQty >= 0) {
        const newQty = heldQty + qty;
        const newAvg = ((heldQty * heldAvg) + totalCost) / newQty;
        currentItem.qty = newQty;
        currentItem.avgPrice = newAvg;
      } else {
        // Covering a short position
        const absShort = Math.abs(heldQty);
        if (qty <= absShort) {
          currentItem.qty = heldQty + qty; // e.g. -100 + 40 = -60
          if (currentItem.qty === 0) currentItem.avgPrice = 0;
        } else {
          const longQty = qty - absShort;
          currentItem.qty = longQty;
          currentItem.avgPrice = stock.price;
        }
      }

      socket.emit('tradeResult', {
        success: true,
        message: `Bought ${qty} shares of ${ticker} at ₹${stock.price.toFixed(2)}`,
      });

    } else if (action === 'SELL') {
      if (room.mode === 'standard') {
        // Standard Mode: No short selling allowed
        if (heldQty < qty) {
          socket.emit('tradeResult', {
            success: false,
            message: `Insufficient shares. You hold ${heldQty} shares of ${ticker}.`,
          });
          return;
        }

        player.cash += totalCost;
        currentItem.qty = heldQty - qty;
        if (currentItem.qty === 0) currentItem.avgPrice = 0;

        socket.emit('tradeResult', {
          success: true,
          message: `Sold ${qty} shares of ${ticker} at ₹${stock.price.toFixed(2)}`,
        });

      } else if (room.mode === 'match') {
        // Match Mode: Short selling allowed!
        player.cash += totalCost;

        if (heldQty > 0) {
          if (qty <= heldQty) {
            currentItem.qty = heldQty - qty;
            if (currentItem.qty === 0) currentItem.avgPrice = 0;
          } else {
            const shortQty = qty - heldQty;
            currentItem.qty = -shortQty;
            currentItem.avgPrice = stock.price;
          }
        } else {
          // Adding to existing short position
          const newShortQty = heldQty - qty; // e.g. -50 - 50 = -100
          const newAvg = ((Math.abs(heldQty) * heldAvg) + totalCost) / Math.abs(newShortQty);
          currentItem.qty = newShortQty;
          currentItem.avgPrice = newAvg;
        }

        socket.emit('tradeResult', {
          success: true,
          message: `Sold/Short ${qty} shares of ${ticker} at ₹${stock.price.toFixed(2)}`,
        });
      }
    }

    broadcastPortfolios(roomCode, room);
    broadcastLeaderboard(roomCode, room);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.players.delete(socket.id);
    io.to(roomCode).emit('playerJoined', { players: getPlayerList(room) });

    if (room.players.size === 0 && socket.id === room.hostId) {
      clearInterval(room.tickInterval);
      clearInterval(room.newsInterval);
      rooms.delete(roomCode);
      console.log(`🗑️  Room ${roomCode} deleted (host left)`);
    }
  });
});

// ─── Start Server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🏦 MockEx Stock Exchange running on http://localhost:${PORT}\n`);
});

