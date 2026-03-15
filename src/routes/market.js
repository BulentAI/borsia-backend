// ═══════════════════════════════════════════════
// BORSiA — Market Routes (Finnhub Proxy)
// ═══════════════════════════════════════════════

const express = require('express');
const fetch = require('node-fetch');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// ─── In-memory cache (basit TTL) ───
const cache = {};
function getCached(key, ttlMs) {
  const item = cache[key];
  if (item && Date.now() - item.time < ttlMs) return item.data;
  return null;
}
function setCache(key, data) {
  cache[key] = { data, time: Date.now() };
}

// ─── HELPER: Finnhub fetch ───
async function finnhubFetch(endpoint, params = {}) {
  const url = new URL(`${FINNHUB_BASE}${endpoint}`);
  url.searchParams.set('token', FINNHUB_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Finnhub HTTP ${response.status}`);
  return response.json();
}

// ─── DEFAULT SYMBOLS ───
const DEFAULT_SYMBOLS = [
  { symbol: 'AAPL', label: 'Apple', type: 'stock' },
  { symbol: 'MSFT', label: 'Microsoft', type: 'stock' },
  { symbol: 'GOOGL', label: 'Google', type: 'stock' },
  { symbol: 'AMZN', label: 'Amazon', type: 'stock' },
  { symbol: 'TSLA', label: 'Tesla', type: 'stock' },
  { symbol: 'BINANCE:BTCUSDT', label: 'BTC/USD', type: 'crypto' },
  { symbol: 'BINANCE:ETHUSDT', label: 'ETH/USD', type: 'crypto' },
  { symbol: 'OANDA:EUR_USD', label: 'EUR/USD', type: 'forex' },
  { symbol: 'OANDA:GBP_USD', label: 'GBP/USD', type: 'forex' },
  { symbol: 'OANDA:XAU_USD', label: 'Altın', type: 'commodity' }
];

// ─── GET /api/market/snapshot ───
router.get('/snapshot', requireAuth, async (req, res) => {
  try {
    const cacheKey = 'market_snapshot';
    const cached = getCached(cacheKey, 60000); // 1 dakika cache
    if (cached) return res.json(cached);

    if (!FINNHUB_KEY) {
      return res.json({ items: [], live: false, provider: 'fallback', error: 'Finnhub API key tanımlı değil' });
    }

    // Paralel quote fetch
    const results = await Promise.allSettled(
      DEFAULT_SYMBOLS.map(async (s) => {
        const quote = await finnhubFetch('/quote', { symbol: s.symbol });
        return {
          symbol: s.symbol,
          label: s.label,
          type: s.type,
          price: quote.c || 0,
          change: quote.d || 0,
          changePercent: quote.dp || 0,
          high: quote.h || 0,
          low: quote.l || 0,
          open: quote.o || 0,
          previousClose: quote.pc || 0,
          timestamp: quote.t ? new Date(quote.t * 1000).toISOString() : new Date().toISOString()
        };
      })
    );

    const items = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const payload = {
      items,
      live: items.length > 0,
      provider: 'finnhub',
      updatedAt: new Date().toISOString()
    };

    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Market snapshot hatası:', err.message);
    res.json({ items: [], live: false, provider: 'error', error: err.message });
  }
});

// ─── GET /api/market/pulse ───
router.get('/pulse', requireAuth, async (req, res) => {
  try {
    const cacheKey = 'market_pulse';
    const cached = getCached(cacheKey, 120000); // 2 dakika cache
    if (cached) return res.json(cached);

    if (!FINNHUB_KEY) {
      return res.json({ items: [], live: false, provider: 'fallback' });
    }

    // Piyasa genel durumu
    const [usMarket, forexRates] = await Promise.allSettled([
      finnhubFetch('/quote', { symbol: 'SPY' }),
      finnhubFetch('/forex/rates', { base: 'USD' })
    ]);

    const spy = usMarket.status === 'fulfilled' ? usMarket.value : {};

    const payload = {
      indices: {
        sp500: { price: spy.c || 0, change: spy.dp || 0 }
      },
      live: true,
      provider: 'finnhub',
      updatedAt: new Date().toISOString()
    };

    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Market pulse hatası:', err.message);
    res.json({ items: [], live: false, provider: 'error', error: err.message });
  }
});

// ─── GET /api/market/quote/:symbol ───
router.get('/quote/:symbol', requireAuth, async (req, res) => {
  try {
    const { symbol } = req.params;
    const cacheKey = `quote_${symbol}`;
    const cached = getCached(cacheKey, 30000); // 30 saniye cache
    if (cached) return res.json(cached);

    if (!FINNHUB_KEY) {
      return res.status(503).json({ error: 'Market servisi yapılandırılmamış.' });
    }

    const quote = await finnhubFetch('/quote', { symbol });
    const payload = {
      symbol,
      price: quote.c || 0,
      change: quote.d || 0,
      changePercent: quote.dp || 0,
      high: quote.h || 0,
      low: quote.l || 0,
      open: quote.o || 0,
      previousClose: quote.pc || 0,
      live: true,
      provider: 'finnhub'
    };

    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Quote hatası:', err.message);
    res.status(500).json({ error: 'Fiyat bilgisi alınamadı.' });
  }
});

module.exports = router;
