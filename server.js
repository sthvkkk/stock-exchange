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

// Exact 20 Headlines & Impacts for Match Round 2
const ROUND2_NEWS_ITEMS = [
  { headline: "TCS wins mega $2.5B contract", impacts: [{ ticker: "TCS", change: 7 }] },
  { headline: "Govt slaps import duty hike on EV components", impacts: [{ ticker: "TATAMOTORS", change: -5 }] },
  { headline: "Crude oil crashes 12%", impacts: [{ ticker: "RELIANCE", change: -6 }, { ticker: "TATAMOTORS", change: 5 }] },
  { headline: "US Fed signals rate cuts", impacts: [{ ticker: "HDFCBANK", change: 6 }, { ticker: "TCS", change: -5 }] },
  { headline: "Nationwide truckers strike", impacts: [{ ticker: "ZOMATO", change: 4 }, { ticker: "TATAMOTORS", change: -4 }] },
  { headline: "Record heatwave grips India", impacts: [{ ticker: "SUZLON", change: -5 }, { ticker: "ZOMATO", change: 6 }] },
  { headline: "IT hiring freeze deepens", impacts: [{ ticker: "TCS", change: -6 }, { ticker: "HDFCBANK", change: 3 }] },
  { headline: "Global auto giants announce steep price cuts", impacts: [{ ticker: "TATAMOTORS", change: -7 }] },
  { headline: "RBI tightens unsecured lending norms", impacts: [{ ticker: "HDFCBANK", change: -6 }, { ticker: "ZOMATO", change: 3 }] },
  { headline: "Renewable energy export incentive package", impacts: [{ ticker: "SUZLON", change: 9 }, { ticker: "RELIANCE", change: -4 }] },
  { headline: "HDFC Bank reports high deposit growth", impacts: [{ ticker: "HDFCBANK", change: 6 }] },
  { headline: "JLR announces major vehicle recall", impacts: [{ ticker: "TATAMOTORS", change: -7 }] },
  { headline: "Zomato increases platform fee", impacts: [{ ticker: "ZOMATO", change: 5 }] },
  { headline: "Suzlon secures largest wind turbine order", impacts: [{ ticker: "SUZLON", change: 9 }] },
  { headline: "Reliance board approves separate listing", impacts: [{ ticker: "RELIANCE", change: 7 }] },
  { headline: "Cyberattack disrupts TCS services", impacts: [{ ticker: "TCS", change: -6 }] },
  { headline: "Govt proposes social-security for gig workers", impacts: [{ ticker: "ZOMATO", change: -7 }] },
  { headline: "Fire at Reliance Jamnagar complex", impacts: [{ ticker: "RELIANCE", change: -6 }] },
  { headline: "JLR reports record orders", impacts: [{ ticker: "TATAMOTORS", change: 6 }] },
  { headline: "Govt introduces mandatory cybersecurity upgrades", impacts: [{ ticker: "TCS", change: 5 }, { ticker: "HDFCBANK", change: -2 }, { ticker: "RELIANCE", change: 3 }] }
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
    isPaused: false,
    round1Jump5Done: false,
    round1Jump10Done: false,
    round2NewsIndex: 0,
    round2NewsTimer: 0,
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
    portfolio[s.ticker] = {
      longQty: 0,
      longAvgPrice: 0,
      shortQty: 0,
      shortAvgPrice: 0,
      shortMargin: 0,
    };
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
  let longStockValue = 0;
  let shortCollateral = 0;
  let totalShortPnL = 0;
  let portfolioDetails = {};

  stocks.forEach(s => {
    const item = player.portfolio[s.ticker] || { longQty: 0, longAvgPrice: 0, shortQty: 0, shortAvgPrice: 0, shortMargin: 0 };
    const longQty = item.longQty || 0;
    const longAvgPrice = item.longAvgPrice || 0;
    const shortQty = item.shortQty || 0;
    const shortAvgPrice = item.shortAvgPrice || 0;
    const shortMargin = typeof item.shortMargin === 'number' && item.shortMargin > 0
      ? item.shortMargin
      : (shortQty * shortAvgPrice * 0.20);

    const longValue = longQty * s.price;

    const longPnL = longQty > 0 ? (s.price - longAvgPrice) * longQty : 0;
    const shortPnL = shortQty > 0 ? (shortAvgPrice - s.price) * shortQty : 0;

    longStockValue += longValue;
    shortCollateral += shortMargin;
    totalShortPnL += shortPnL;

    portfolioDetails[s.ticker] = {
      longQty,
      longAvgPrice: Math.round(longAvgPrice * 100) / 100,
      shortQty,
      shortAvgPrice: Math.round(shortAvgPrice * 100) / 100,
      currentPrice: Math.round(s.price * 100) / 100,
      longPnL: Math.round(longPnL * 100) / 100,
      shortPnL: Math.round(shortPnL * 100) / 100,
      qty: longQty - shortQty,
      avgPrice: longQty > 0 ? Math.round(longAvgPrice * 100) / 100 : Math.round(shortAvgPrice * 100) / 100,
      pnl: Math.round((longPnL + shortPnL) * 100) / 100,
    };
  });

  const stockValue = longStockValue + shortCollateral + totalShortPnL;
  const netWorth = player.cash + stockValue;

  return {
    cash: Math.round(player.cash * 100) / 100,
    blockedMargin: Math.round(shortCollateral * 100) / 100,
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

      if (room.phase === 'round1' && !room.isMarketFrozen) {
        // Round 1 discrete scheduled jumps:
        // At Minute 5:00 (phaseTimer <= 300)
        if (room.phaseTimer <= 300 && !room.round1Jump5Done) {
          room.round1Jump5Done = true;
          const jumps = { RELIANCE: 0.05, TCS: 0.06, TATAMOTORS: 0.08, SUZLON: 0.10 };
          room.stocks.forEach(s => {
            if (jumps[s.ticker]) {
              s.price = Math.round(s.price * (1 + jumps[s.ticker]) * 100) / 100;
              s.changePercent = ((s.price - s.basePrice) / s.basePrice) * 100;
            }
          });
          broadcastPrices(roomCode, room);
          broadcastPortfolios(roomCode, room);
          console.log(`📈 Round 1 Jump at 5m executed for room ${roomCode}`);
        }

        // At Minute 10:00 (phaseTimer <= 0)
        if (room.phaseTimer <= 0 && !room.round1Jump10Done) {
          room.round1Jump10Done = true;
          const jumps = { RELIANCE: 0.06, HDFCBANK: -0.02, ZOMATO: -0.07, TATAMOTORS: -0.06 };
          room.stocks.forEach(s => {
            if (jumps[s.ticker]) {
              s.price = Math.round(s.price * (1 + jumps[s.ticker]) * 100) / 100;
              s.changePercent = ((s.price - s.basePrice) / s.basePrice) * 100;
            }
          });
          broadcastPrices(roomCode, room);
          broadcastPortfolios(roomCode, room);
          console.log(`📉 Round 1 Jump at 10m executed for room ${roomCode}`);
        }
      } else if (room.phase === 'round2' && !room.isMarketFrozen) {
        // Round 2: News driven every 30s
        room.round2NewsTimer++;
        if (room.round2NewsTimer >= 30 && room.round2NewsIndex < ROUND2_NEWS_ITEMS.length) {
          room.round2NewsTimer = 0;
          const newsItem = ROUND2_NEWS_ITEMS[room.round2NewsIndex];
          room.round2NewsIndex++;

          // Broadcast headline immediately
          io.to(roomCode).emit('newsFlash', { headline: newsItem.headline });

          // Hidden 10-second delay: Apply exact price impact 10 seconds later
          setTimeout(() => {
            if (!rooms.has(roomCode)) return;
            newsItem.impacts.forEach(imp => {
              const stock = room.stocks.find(s => s.ticker === imp.ticker);
              if (stock && !room.isMarketFrozen) {
                stock.price = Math.round(stock.price * (1 + imp.change / 100) * 100) / 100;
                stock.changePercent = ((stock.price - stock.basePrice) / stock.basePrice) * 100;
              }
            });
            broadcastPrices(roomCode, room);
            broadcastPortfolios(roomCode, room);
          }, 10000);
        }
      } else if (room.phase === 'round3' && !room.isMarketFrozen) {
        // Round 3: 1-second continuous tick organic noise (-1.5% to +1.5%) combined with NI demand engine
        recalculateRound3Prices(roomCode, room, true);
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

  // News Interval (Only for Standard mode)
  if (room.mode === 'standard') {
    room.newsInterval = setInterval(() => {
      if (room.isPaused) return;
      if (room.timer > 5) {
        fireNewsEvent(roomCode, room);
      }
    }, 15000);
  }
}

// ─── Round 3 Algorithmic Demand Price Engine & Correction Thresholds ──────────
function recalculateRound3Prices(roomCode, room, updateTickNoise = false) {
  if (room.mode !== 'match' || room.phase !== 'round3' || room.isMarketFrozen) return;

  room.stocks.forEach(stock => {
    let baseR2Price = stock.round2ClosePrice || stock.round2ClosingPrice || stock.basePrice;
    if (!baseR2Price || baseR2Price <= 0) return;

    if (typeof stock.r3BaselineNI !== 'number') {
      stock.r3BaselineNI = 0;
    }

    if (updateTickNoise || typeof stock.r3TickNoisePct !== 'number') {
      // Small random organic tick fluctuation between -1.5% and +1.5% per 1-second tick
      stock.r3TickNoisePct = Math.round((Math.random() * 3.0 - 1.5) * 100) / 100;
    }

    // Calculate total Net Investment (NI) across all active player orders in Round 3
    let totalLongQty = 0;
    let totalShortQty = 0;

    room.players.forEach(player => {
      const item = player.portfolio[stock.ticker];
      if (item) {
        totalLongQty += (item.longQty || 0);
        totalShortQty += (item.shortQty || 0);
      }
    });

    const currentNI = (totalLongQty - totalShortQty) * baseR2Price;
    const deltaNI = currentNI - stock.r3BaselineNI;

    // NI Demand % Change = (deltaNI / 1,000,000) * 2%  (1% shift per ₹5,00,000 NI delta)
    const uncappedDemandPercent = (deltaNI / 1000000) * 2;
    const noisePercent = stock.r3TickNoisePct || 0;

    // Total Uncapped % Change = NI Demand % Change + 1s Organic Tick Noise %
    const rawTotalPercentChange = uncappedDemandPercent + noisePercent;

    // Enforce Strict 2-Decimal Precision Check
    const totalPercentChange = Math.round(rawTotalPercentChange * 100) / 100;

    let finalChangePct = totalPercentChange;

    if (totalPercentChange >= 10.0) {
      // Over-Surge Circuit Breaker Threshold (>= +10.0%): Permanently crash base reference by -30% (Stealth Execution)
      stock.round2ClosePrice = Math.round((baseR2Price * 0.70) * 100) / 100;
      stock.round2ClosingPrice = stock.round2ClosePrice;
      stock.r3BaselineNI = currentNI; // Lock baseline NI to crash moment
      baseR2Price = stock.round2ClosePrice;
      finalChangePct = noisePercent; // Price starts at new crashed base + tick noise

      console.log(`⚡ CIRCUIT BREAKER: ${stock.ticker} total surge = ${totalPercentChange.toFixed(2)}% (>= +10.0%) -> Permanently crashed base to ₹${baseR2Price}! (Silent)`);

    } else if (totalPercentChange <= -10.0) {
      // Short Squeeze Threshold (<= -10.0%): Permanently jump base reference by +30% (Stealth Execution)
      stock.round2ClosePrice = Math.round((baseR2Price * 1.30) * 100) / 100;
      stock.round2ClosingPrice = stock.round2ClosePrice;
      stock.r3BaselineNI = currentNI; // Lock baseline NI to squeeze moment
      baseR2Price = stock.round2ClosePrice;
      finalChangePct = noisePercent; // Price starts at new squeezed base + tick noise

      console.log(`🚀 SHORT SQUEEZE: ${stock.ticker} total drop = ${totalPercentChange.toFixed(2)}% (<= -10.0%) -> Permanently squeezed base to ₹${baseR2Price}! (Silent)`);
    }

    const calculatedPrice = Math.round((baseR2Price * (1 + (finalChangePct / 100))) * 100) / 100;
    stock.price = Math.max(calculatedPrice, 1);
    stock.changePercent = ((stock.price - stock.basePrice) / stock.basePrice) * 100;
  });

  broadcastPrices(roomCode, room);
  broadcastPortfolios(roomCode, room);
  broadcastLeaderboard(roomCode, room);
}

function advanceMatchPhase(roomCode, room) {
  if (room.phase === 'round1') {
    room.phase = 'break1';
    room.phaseTimer = 300; // Break 1: 5 mins
    room.isMarketFrozen = true;
  } else if (room.phase === 'break1') {
    room.phase = 'round2';
    room.phaseTimer = 600; // Round 2: 10 mins
    room.round2NewsIndex = 0;
    room.round2NewsTimer = 0;
    room.isMarketFrozen = false;
  } else if (room.phase === 'round2') {
    room.phase = 'break2';
    room.phaseTimer = 300; // Break 2: 5 mins
    room.isMarketFrozen = true;

    // Capture and store each stock's final Round 2 closing price as round2ClosePrice
    room.stocks.forEach(s => {
      s.round2ClosePrice = s.price;
      s.round2ClosingPrice = s.price;
      s.r3BaselineNI = 0;
    });
  } else if (room.phase === 'break2') {
    room.phase = 'round3';
    room.phaseTimer = 600; // Round 3: 10 mins
    room.isMarketFrozen = false;

    // Ensure round2ClosePrice is stored for all stocks
    room.stocks.forEach(s => {
      if (!s.round2ClosePrice) s.round2ClosePrice = s.price;
      if (!s.round2ClosingPrice) s.round2ClosingPrice = s.price;
      if (typeof s.r3BaselineNI !== 'number') s.r3BaselineNI = 0;
    });

    // Initial recalculation for Round 3 start
    recalculateRound3Prices(roomCode, room);

    // Clear and hide news banner for Round 3 start
    io.to(roomCode).emit('clearNewsBanner');
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

// ─── Host Verification Helper ────────────────────────────────────────────────
function verifyHost(socket, room, hostToken) {
  if (!room) return false;
  const token = hostToken || socket.hostToken;
  if (socket.id === room.hostId) return true;
  if (token && room.hostToken && token === room.hostToken) {
    room.hostId = socket.id; // Re-bind hostId to current socket
    socket.hostToken = token;
    return true;
  }
  return false;
}

// ─── Socket Handlers ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  socket.on('createRoom', ({ playerName, durationMinutes }) => {
    let roomCode;
    do { roomCode = generateRoomCode(); } while (rooms.has(roomCode));

    const hostToken = 'host_' + Math.random().toString(36).substring(2) + '_' + Date.now();
    const room = createRoomState(socket.id, playerName, durationMinutes);
    room.hostToken = hostToken;
    socket.hostToken = hostToken;

    addPlayer(room, socket.id, playerName);
    rooms.set(roomCode, room);

    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit('roomCreated', {
      roomCode,
      mode: room.mode,
      isMaster: room.mode === 'match' && socket.id === room.hostId,
      hostToken,
      durationMinutes: room.durationMinutes,
    });
    io.to(roomCode).emit('playerJoined', { players: getPlayerList(room) });
    console.log(`🏠 Room ${roomCode} created by ${playerName} (Mode: ${room.mode}, Token: ${hostToken})`);
  });

  socket.on('master:reconnect', ({ roomCode, hostToken }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      return socket.emit('error', { message: 'Room not found.' });
    }

    if (verifyHost(socket, room, hostToken)) {
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.hostToken = hostToken;

      const isMaster = room.mode === 'match';
      socket.emit('masterRestored', {
        roomCode,
        mode: room.mode,
        isMaster,
        hostToken,
        gameStarted: room.gameStarted,
        phase: room.phase,
        isPaused: room.isPaused,
        isMarketFrozen: room.isMarketFrozen,
        remaining: room.phaseTimer,
      });

      if (room.gameStarted) {
        broadcastPrices(roomCode, room);
        broadcastLeaderboard(roomCode, room);
      }

      console.log(`👑 Master host session restored for room ${roomCode} (socket: ${socket.id})`);
    } else {
      socket.emit('error', { message: 'Master re-authentication failed.' });
    }
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
      isMaster: room.mode === 'match' && verifyHost(socket, room),
    });
    io.to(roomCode).emit('playerJoined', { players: getPlayerList(room) });
    console.log(`👤 ${playerName} joined ${roomCode}`);
  });

  socket.on('startGame', ({ roomCode, hostToken }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (!verifyHost(socket, room, hostToken)) {
      socket.emit('error', { message: 'Only the host can start the game.' });
      return;
    }
    if (room.gameStarted) return;

    console.log(`🎮 Game started in ${roomCode} (Mode: ${room.mode})`);
    startGame(roomCode, room);
  });

  // Master Control Suite Handlers
  const handleTogglePause = ({ roomCode, hostToken }) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room || !room.gameStarted) return socket.emit('error', { message: 'Room or game not active.' });
    if (!verifyHost(socket, room, hostToken)) return socket.emit('error', { message: 'Only the host can pause/resume.' });

    room.isPaused = !room.isPaused;
    io.to(targetRoomCode).emit('matchStateUpdated', {
      isPaused: room.isPaused,
      isMarketFrozen: room.isMarketFrozen || room.isPaused,
      phase: room.phase,
      message: room.isPaused ? 'Match PAUSED by Master.' : 'Match RESUMED by Master.',
    });
    console.log(`⏯️ Room ${targetRoomCode} paused: ${room.isPaused}`);
  };

  socket.on('master:togglePause', handleTogglePause);
  socket.on('master:resumeRound', handleTogglePause);
  socket.on('master:pauseRound', handleTogglePause);

  socket.on('master:skipToBreak', ({ roomCode, hostToken }) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room || !room.gameStarted || room.mode !== 'match') return;
    if (!verifyHost(socket, room, hostToken)) return socket.emit('error', { message: 'Only the host can skip round.' });
    
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
      endGame(targetRoomCode, room);
      return;
    } else {
      return socket.emit('error', { message: 'Round is already in a break window.' });
    }

    io.to(targetRoomCode).emit('phaseChanged', {
      phase: room.phase,
      phaseTimer: room.phaseTimer,
      isMarketFrozen: room.isMarketFrozen,
    });
    io.to(targetRoomCode).emit('matchStateUpdated', {
      message: `Skipped to ${room.phase.toUpperCase()} by Master!`,
    });
    console.log(`⏩ Room ${targetRoomCode} skipped to ${room.phase}`);
  });

  socket.on('master:endBreak', ({ roomCode, hostToken }) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room || !room.gameStarted || room.mode !== 'match') return;
    if (!verifyHost(socket, room, hostToken)) return socket.emit('error', { message: 'Only the host can end break.' });
    if (!room.phase.startsWith('break')) {
      return socket.emit('error', { message: 'Can only end break early during a break phase!' });
    }

    advanceMatchPhase(targetRoomCode, room);
  });

  socket.on('master:extendBreak', ({ roomCode, hostToken }) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room || !room.gameStarted || room.mode !== 'match') return;
    if (!verifyHost(socket, room, hostToken)) return socket.emit('error', { message: 'Only the host can extend break.' });
    if (!room.phase.startsWith('break')) {
      return socket.emit('error', { message: 'Can only extend break during a break phase!' });
    }

    room.phaseTimer += 300; // Add +5 minutes
    io.to(targetRoomCode).emit('timerUpdate', {
      remaining: room.phaseTimer,
      phase: room.phase,
      isMarketFrozen: room.isMarketFrozen,
      isPaused: room.isPaused,
    });
    io.to(targetRoomCode).emit('matchStateUpdated', {
      message: 'Break extended by +5 minutes by Master!',
    });
    console.log(`⌛ Room ${targetRoomCode} break extended +300s`);
  });

  socket.on('master:extendRound', ({ roomCode, hostToken }) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room || !room.gameStarted) return;
    if (!verifyHost(socket, room, hostToken)) return socket.emit('error', { message: 'Only the host can extend the round.' });

    const isRoundActive = (room.mode === 'match' && room.phase.startsWith('round') && !room.isMarketFrozen) || (room.mode === 'standard' && room.timer > 0);
    if (!isRoundActive) {
      return socket.emit('masterActionResult', { success: false, message: 'No active round to extend.' });
    }

    if (room.mode === 'match') {
      room.phaseTimer += 300;
    } else {
      room.timer += 300;
    }

    const remaining = room.mode === 'match' ? room.phaseTimer : room.timer;
    io.to(targetRoomCode).emit('timerUpdate', {
      remaining,
      phase: room.phase,
      isMarketFrozen: room.isMarketFrozen,
      isPaused: room.isPaused,
    });

    socket.emit('masterActionResult', { success: true, message: 'Round extended by 5 minutes' });
    io.to(targetRoomCode).emit('matchStateUpdated', { message: 'Round extended by +5 minutes by Master!' });
    console.log(`⌛ Room ${targetRoomCode} round extended +300s by Master`);
  });

  socket.on('master:decreaseRound', ({ roomCode, hostToken }) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room || !room.gameStarted) return;
    if (!verifyHost(socket, room, hostToken)) return socket.emit('error', { message: 'Only the host can decrease round time.' });

    const isRoundActive = (room.mode === 'match' && room.phase.startsWith('round') && !room.isMarketFrozen) || (room.mode === 'standard' && room.timer > 0);
    if (!isRoundActive) {
      return socket.emit('masterActionResult', { success: false, message: 'No active round to decrease.' });
    }

    if (room.mode === 'match') {
      room.phaseTimer -= 60; // Subtract 60 seconds
      if (room.phaseTimer <= 0) {
        room.phaseTimer = 0;
        advanceMatchPhase(targetRoomCode, room);
        socket.emit('masterActionResult', { success: true, message: 'Round successfully ended' });
        broadcastPrices(targetRoomCode, room);
        broadcastPortfolios(targetRoomCode, room);
        broadcastLeaderboard(targetRoomCode, room);
        return;
      }
    } else {
      room.timer -= 60;
      if (room.timer <= 0) {
        room.timer = 0;
        endGame(targetRoomCode, room);
        socket.emit('masterActionResult', { success: true, message: 'Round successfully ended' });
        broadcastPrices(targetRoomCode, room);
        broadcastPortfolios(targetRoomCode, room);
        broadcastLeaderboard(targetRoomCode, room);
        return;
      }
    }

    const remaining = room.mode === 'match' ? room.phaseTimer : room.timer;
    io.to(targetRoomCode).emit('timerUpdate', {
      remaining,
      phase: room.phase,
      isMarketFrozen: room.isMarketFrozen,
      isPaused: room.isPaused,
    });

    socket.emit('masterActionResult', { success: true, message: 'Round reduced by 1 minute' });
    io.to(targetRoomCode).emit('matchStateUpdated', { message: 'Round reduced by -1 minute by Master!' });
    console.log(`⌛ Room ${targetRoomCode} round decreased -60s by Master`);
  });

  socket.on('master:skipRound', ({ roomCode, hostToken }) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room || !room.gameStarted) return;
    if (!verifyHost(socket, room, hostToken)) return socket.emit('error', { message: 'Only the host can skip/end the round.' });

    const isRoundActive = (room.mode === 'match' && room.phase.startsWith('round') && !room.isMarketFrozen) || (room.mode === 'standard' && room.timer > 0);
    if (!isRoundActive) {
      return socket.emit('masterActionResult', { success: false, message: 'No active round to skip/end.' });
    }

    if (room.mode === 'match') {
      room.phaseTimer = 0;
      advanceMatchPhase(targetRoomCode, room);
    } else {
      room.timer = 0;
      endGame(targetRoomCode, room);
    }

    broadcastPrices(targetRoomCode, room);
    broadcastPortfolios(targetRoomCode, room);
    broadcastLeaderboard(targetRoomCode, room);

    socket.emit('masterActionResult', { success: true, message: 'Round successfully ended' });
    console.log(`⏩ Room ${targetRoomCode} round skipped/ended by Master`);
  });

  socket.on('master:endRound', ({ roomCode, hostToken }) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room || !room.gameStarted) return;
    if (!verifyHost(socket, room, hostToken)) return socket.emit('error', { message: 'Only the host can end match.' });

    console.log(`🛑 Match ${targetRoomCode} terminated early by Master.`);
    room.phase = 'finished';
    endGame(targetRoomCode, room);
  });

  // Master Price Manipulation (During Breaks OR Paused in Match Mode)
  const handleMasterPriceUpdate = ({ roomCode, ticker, newPrice, hostToken }) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room) {
      return socket.emit('error', { message: 'Room not found.' });
    }
    if (room.mode !== 'match') {
      return socket.emit('error', { message: 'Master control is only available in Match mode.' });
    }
    if (!verifyHost(socket, room, hostToken)) {
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

      if (room.phase === 'round3' || room.phase === 'break2') {
        stock.round2ClosePrice = stock.price;
        stock.round2ClosingPrice = stock.price;
        stock.r3BaselineNI = 0;
      }
      
      broadcastPrices(targetRoomCode, room);
      broadcastPortfolios(targetRoomCode, room);
      broadcastLeaderboard(targetRoomCode, room);
      console.log(`🛠️ Master updated ${ticker} price to ₹${stock.price} in room ${targetRoomCode}`);
      socket.emit('masterActionResult', { success: true, message: `Updated ${ticker} price to ₹${stock.price}` });
    }
  };

  socket.on('masterUpdatePrice', handleMasterPriceUpdate);
  socket.on('master:updatePrice', handleMasterPriceUpdate);
  socket.on('master:setPrice', handleMasterPriceUpdate);

  // Master Fund Injection Handler
  socket.on('master:addFunds', ({ roomCode, targetSocketId, amount, hostToken }) => {
    const targetRoomCode = roomCode || socket.roomCode;
    const room = rooms.get(targetRoomCode);
    if (!room) return socket.emit('error', { message: 'Room not found.' });

    if (!verifyHost(socket, room, hostToken)) {
      return socket.emit('error', { message: 'Only the Master can inject funds.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return socket.emit('masterActionResult', { success: false, message: 'Invalid injection amount.' });
    }

    const targetPlayer = room.players.get(targetSocketId);
    if (!targetPlayer) {
      return socket.emit('masterActionResult', { success: false, message: 'Player not found in room.' });
    }

    targetPlayer.cash = Math.round((targetPlayer.cash + parsedAmount) * 100) / 100;
    
    broadcastPortfolios(targetRoomCode, room);
    broadcastLeaderboard(targetRoomCode, room);

    socket.emit('masterActionResult', {
      success: true,
      message: `Injected ₹${parsedAmount.toLocaleString('en-IN')} cash to ${targetPlayer.name}`
    });

    console.log(`💰 Master injected ₹${parsedAmount} to ${targetPlayer.name} in room ${targetRoomCode}`);
  });

  // Trade Execution (Separate LONG and SHORT tracking per ticker)
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

    if (!player.portfolio[ticker]) {
      player.portfolio[ticker] = { longQty: 0, longAvgPrice: 0, shortQty: 0, shortAvgPrice: 0 };
    }

    const item = player.portfolio[ticker];
    const totalCost = stock.price * qty;

    if (action === 'BUY') {
      if (player.cash < totalCost) {
        socket.emit('tradeResult', {
          success: false,
          message: `Insufficient funds. Need ₹${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`,
        });
        return;
      }

      player.cash -= totalCost;
      const newLongQty = (item.longQty || 0) + qty;
      const oldLongVal = (item.longQty || 0) * (item.longAvgPrice || 0);
      item.longAvgPrice = (oldLongVal + totalCost) / newLongQty;
      item.longQty = newLongQty;

      socket.emit('tradeResult', {
        success: true,
        message: `Bought ${qty} LONG shares of ${ticker} at ₹${stock.price.toFixed(2)}`,
      });

    } else if (action === 'SELL' || action === 'SHORT') {
      if (room.mode === 'standard') {
        if ((item.longQty || 0) < qty) {
          socket.emit('tradeResult', {
            success: false,
            message: `Insufficient shares. You hold ${item.longQty || 0} LONG shares of ${ticker}.`,
          });
          return;
        }

        player.cash += totalCost;
        item.longQty -= qty;
        if (item.longQty === 0) item.longAvgPrice = 0;

        socket.emit('tradeResult', {
          success: true,
          message: `Sold ${qty} LONG shares of ${ticker} at ₹${stock.price.toFixed(2)}`,
        });

      } else if (room.mode === 'match') {
        // In Match mode: SELL requires 20% margin collateral deduction from available cash
        const requiredMargin = totalCost * 0.20;
        if (player.cash < requiredMargin) {
          socket.emit('tradeResult', {
            success: false,
            message: `Insufficient available cash for 20% margin collateral. Need ₹${requiredMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`,
          });
          return;
        }

        player.cash -= requiredMargin; // Reserve 20% margin collateral from available cash
        const newShortQty = (item.shortQty || 0) + qty;
        const oldShortVal = (item.shortQty || 0) * (item.shortAvgPrice || 0);
        item.shortAvgPrice = (oldShortVal + totalCost) / newShortQty;
        item.shortQty = newShortQty;
        item.shortMargin = (item.shortMargin || 0) + requiredMargin;

        socket.emit('tradeResult', {
          success: true,
          message: `Shorted ${qty} shares of ${ticker} at ₹${stock.price.toFixed(2)} (SHORT)`,
        });
      }
    }

    recalculateRound3Prices(roomCode, room);
    broadcastPortfolios(roomCode, room);
    broadcastLeaderboard(roomCode, room);
  });

  // Dedicated One-Click Close Position Socket Handler
  socket.on('closePosition', ({ roomCode, ticker, type }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameStarted) return;
    if (room.isPaused || room.isMarketFrozen) {
      socket.emit('tradeResult', { success: false, message: 'Market is frozen or paused.' });
      return;
    }
    const player = room.players.get(socket.id);
    if (!player) return;

    const stock = room.stocks.find(s => s.ticker === ticker);
    if (!stock) return;

    const item = player.portfolio[ticker];
    if (!item) return;

    if (type === 'LONG') {
      if ((item.longQty || 0) <= 0) {
        socket.emit('tradeResult', { success: false, message: 'No active LONG position.' });
        return;
      }
      const qtyToClose = item.longQty;
      const revenue = stock.price * qtyToClose;
      player.cash += revenue;
      item.longQty = 0;
      item.longAvgPrice = 0;
      socket.emit('tradeResult', { success: true, message: `Closed LONG position in ${ticker} (${qtyToClose} shares)` });

    } else if (type === 'SHORT') {
      if ((item.shortQty || 0) <= 0) {
        socket.emit('tradeResult', { success: false, message: 'No active SHORT position.' });
        return;
      }
      const qtyToClose = item.shortQty;
      const marginRefund = typeof item.shortMargin === 'number' && item.shortMargin > 0
        ? item.shortMargin
        : (qtyToClose * item.shortAvgPrice * 0.20);
      const realizedPnL = (item.shortAvgPrice - stock.price) * qtyToClose;
      const cashReturned = marginRefund + realizedPnL;

      player.cash = Math.max(0, player.cash + cashReturned);
      item.shortQty = 0;
      item.shortAvgPrice = 0;
      item.shortMargin = 0;

      const pnlStr = realizedPnL >= 0 ? `+₹${realizedPnL.toFixed(2)}` : `-₹${Math.abs(realizedPnL).toFixed(2)}`;
      socket.emit('tradeResult', {
        success: true,
        message: `Closed SHORT position in ${ticker} (${qtyToClose} shares, Realized P&L: ${pnlStr})`
      });
    }

    recalculateRound3Prices(roomCode, room);
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

