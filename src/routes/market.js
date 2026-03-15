// ═══════════════════════════════════════════════
// BORSiA — Market Routes (Finnhub Proxy)
// Frontend ticker + pulse formatına uyumlu
// ═══════════════════════════════════════════════

const express = require('express');
const fetch = require('node-fetch');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

const cache = {};
function getCached(key, ttlMs) {
  const item = cache[key];
  if (item && Date.now() - item.time < ttlMs) return item.data;
  return null;
}
function setCache(key, data) { cache[key] = { data, time: Date.now() }; }

async function finnhubFetch(endpoint, params) {
  if (!FINNHUB_KEY) throw new Error('Finnhub API key yok');
  var url = new URL(FINNHUB_BASE + endpoint);
  url.searchParams.set('token', FINNHUB_KEY);
  if (params) Object.entries(params).forEach(function(e) { url.searchParams.set(e[0], e[1]); });
  var response = await fetch(url.toString());
  if (!response.ok) throw new Error('Finnhub HTTP ' + response.status);
  return response.json();
}

// Frontend'in beklediği semboller
var SYMBOLS = [
  { symbol: 'BINANCE:BTCUSDT', label: 'BTC', type: 'crypto' },
  { symbol: 'BINANCE:ETHUSDT', label: 'ETH', type: 'crypto' },
  { symbol: 'AAPL', label: 'AAPL', type: 'stock' },
  { symbol: 'TSLA', label: 'TSLA', type: 'stock' },
  { symbol: 'NVDA', label: 'NVDA', type: 'stock' },
  { symbol: 'MSFT', label: 'MSFT', type: 'stock' },
  { symbol: 'OANDA:XAU_USD', label: 'XAUUSD', type: 'commodity' },
  { symbol: 'OANDA:EUR_USD', label: 'EURUSD', type: 'forex' }
];

function formatPrice(val, type) {
  if (!val) return '0';
  if (type === 'crypto') return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (type === 'forex') return val.toFixed(4);
  return val.toFixed(2);
}

function changeDir(pct) {
  if (pct > 0.3) return 'up';
  if (pct < -0.3) return 'down';
  return 'flat';
}

// ─── GET /api/market/snapshot ───
// Frontend beklediği format: { ticker: [...], pulse: [...], live, provider, updatedAt }
router.get('/snapshot', requireAuth, async function(req, res) {
  try {
    var cacheKey = 'market_snapshot_v2';
    var cached = getCached(cacheKey, 60000);
    if (cached) return res.json(cached);

    if (!FINNHUB_KEY) {
      return res.json({ ticker: [], pulse: [], live: false, provider: 'demo', message: 'Finnhub API key tanımlı değil' });
    }

    var results = await Promise.allSettled(
      SYMBOLS.map(function(s) {
        return finnhubFetch('/quote', { symbol: s.symbol }).then(function(q) {
          return {
            symbol: s.label,
            price: formatPrice(q.c, s.type),
            change: (q.dp >= 0 ? '+' : '') + (q.dp || 0).toFixed(2) + '%',
            dir: changeDir(q.dp || 0),
            raw: { c: q.c, d: q.d, dp: q.dp, h: q.h, l: q.l, o: q.o, pc: q.pc }
          };
        });
      })
    );

    var ticker = results.filter(function(r) { return r.status === 'fulfilled' && r.value.raw.c > 0; }).map(function(r) { return r.value; });

    // Pulse — genel piyasa sentiment
    var stockItems = ticker.filter(function(t) { return ['AAPL','TSLA','NVDA','MSFT'].indexOf(t.symbol) !== -1; });
    var cryptoItems = ticker.filter(function(t) { return ['BTC','ETH'].indexOf(t.symbol) !== -1; });
    var avgStockChange = stockItems.length ? stockItems.reduce(function(s,t) { return s + parseFloat(t.change); }, 0) / stockItems.length : 0;
    var avgCryptoChange = cryptoItems.length ? cryptoItems.reduce(function(s,t) { return s + parseFloat(t.change); }, 0) / cryptoItems.length : 0;
    var goldItem = ticker.find(function(t) { return t.symbol === 'XAUUSD'; });
    var eurItem = ticker.find(function(t) { return t.symbol === 'EURUSD'; });

    var pulse = [
      { label: 'ABD Hisseleri', sentiment: avgStockChange > 0.5 ? 'Bullish' : avgStockChange < -0.5 ? 'Bearish' : 'Nötr', meta: 'Ortalama değişim: ' + avgStockChange.toFixed(2) + '%' },
      { label: 'Kripto', sentiment: avgCryptoChange > 1 ? 'Momentum' : avgCryptoChange < -1 ? 'Zayıf' : 'Dengeli', meta: 'BTC ve ETH ortalaması: ' + avgCryptoChange.toFixed(2) + '%' },
      { label: 'Altın', sentiment: goldItem ? (parseFloat(goldItem.change) > 0 ? 'Güçlü' : 'Düşüşte') : 'Veri yok', meta: goldItem ? goldItem.price + ' USD' : '' },
      { label: 'Forex', sentiment: eurItem ? (parseFloat(eurItem.change) > 0 ? 'EUR Güçlü' : 'USD Güçlü') : 'Veri yok', meta: eurItem ? 'EUR/USD: ' + eurItem.price : '' }
    ];

    var payload = {
      ticker: ticker,
      pulse: pulse,
      live: ticker.length > 0,
      provider: 'finnhub',
      updatedAt: new Date().toISOString(),
      message: ticker.length + ' varlık canlı'
    };

    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Market snapshot hatası:', err.message);
    res.json({ ticker: [], pulse: [], live: false, provider: 'error', error: err.message });
  }
});

// ─── GET /api/market/pulse ───
router.get('/pulse', requireAuth, async function(req, res) {
  try {
    var cacheKey = 'market_pulse_v2';
    var cached = getCached(cacheKey, 120000);
    if (cached) return res.json(cached);

    if (!FINNHUB_KEY) {
      return res.json({
        regime: 'Demo',
        narrative: 'Piyasa verisi demo modunda. Finnhub API key eklenince canlı veri akacak.',
        bullets: ['Demo mod aktif', 'Canlı veri için Finnhub API key gerekli'],
        focus: 'Genel',
        focusNote: '',
        live: false,
        provider: 'demo'
      });
    }

    var btcQuote = await finnhubFetch('/quote', { symbol: 'BINANCE:BTCUSDT' }).catch(function() { return {}; });
    var spyQuote = await finnhubFetch('/quote', { symbol: 'SPY' }).catch(function() { return {}; });

    var btcChange = btcQuote.dp || 0;
    var spyChange = spyQuote.dp || 0;
    var regime = 'Nötr';
    if (btcChange > 2 && spyChange > 0.5) regime = 'Risk-On Ralli';
    else if (btcChange > 1 || spyChange > 0.3) regime = 'Pozitif Momentum';
    else if (btcChange < -2 || spyChange < -1) regime = 'Risk-Off Satış';
    else if (btcChange < -1) regime = 'Hafif Negatif';

    var payload = {
      regime: regime,
      narrative: 'BTC ' + (btcChange >= 0 ? '+' : '') + btcChange.toFixed(2) + '%, S&P 500 ' + (spyChange >= 0 ? '+' : '') + spyChange.toFixed(2) + '%. ' + regime + ' rejimi aktif.',
      bullets: [
        'BTC: $' + (btcQuote.c || 0).toLocaleString() + ' (' + (btcChange >= 0 ? '+' : '') + btcChange.toFixed(2) + '%)',
        'S&P 500: $' + (spyQuote.c || 0).toFixed(2) + ' (' + (spyChange >= 0 ? '+' : '') + spyChange.toFixed(2) + '%)'
      ],
      focus: btcChange > spyChange ? 'Kripto' : 'Hisse',
      focusNote: 'En güçlü hareket ' + (btcChange > spyChange ? 'kripto' : 'hisse') + ' tarafında',
      live: true,
      provider: 'finnhub',
      updatedAt: new Date().toISOString()
    };

    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Market pulse hatası:', err.message);
    res.json({ regime: 'Hata', narrative: 'Piyasa verisi alınamadı.', bullets: [], focus: '', focusNote: '', live: false, provider: 'error' });
  }
});

// ─── GET /api/market/quote/:symbol ───
router.get('/quote/:symbol', requireAuth, async function(req, res) {
  try {
    var symbol = req.params.symbol;
    var cacheKey = 'quote_' + symbol;
    var cached = getCached(cacheKey, 30000);
    if (cached) return res.json(cached);

    if (!FINNHUB_KEY) return res.status(503).json({ error: 'Market servisi yapılandırılmamış.' });

    var quote = await finnhubFetch('/quote', { symbol: symbol });
    var payload = {
      symbol: symbol,
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
