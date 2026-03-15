// ═══════════════════════════════════════════════
// BORSiA — News Routes (Finnhub Proxy)
// ═══════════════════════════════════════════════

const express = require('express');
const fetch = require('node-fetch');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// ─── Cache ───
let newsCache = { data: null, time: 0 };
const NEWS_CACHE_TTL = 5 * 60 * 1000; // 5 dakika

// ─── GET /api/news ───
router.get('/', requireAuth, async (req, res) => {
  try {
    // Cache kontrol
    if (newsCache.data && Date.now() - newsCache.time < NEWS_CACHE_TTL) {
      return res.json(newsCache.data);
    }

    if (!FINNHUB_KEY) {
      return res.json(buildFallbackNews());
    }

    const { category = 'general' } = req.query;
    const url = `${FINNHUB_BASE}/news?category=${category}&token=${FINNHUB_KEY}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`Finnhub News HTTP ${response.status}`);

    const rawItems = await response.json();
    const items = (Array.isArray(rawItems) ? rawItems : []).slice(0, 30).map(item => ({
      id: String(item.id || item.datetime || Math.random()),
      title: item.headline || item.title || 'Başlık yok',
      summary: item.summary || '',
      source: item.source || 'Bilinmiyor',
      url: item.url || '#',
      image: item.image || '',
      category: item.category || category,
      datetime: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
      related: item.related || ''
    }));

    // Digest oluştur
    const sources = {};
    items.forEach(item => {
      sources[item.source] = (sources[item.source] || 0) + 1;
    });

    const payload = {
      items,
      digest: items.length > 0
        ? `${items.length} haber ${Object.keys(sources).length} kaynaktan alındı. Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')}`
        : 'Şu an haber akışı boş.',
      meta: {
        total: items.length,
        sources: Object.keys(sources).length,
        updatedAt: new Date().toISOString()
      },
      sourceBreakdown: sources,
      live: true,
      provider: 'finnhub'
    };

    newsCache = { data: payload, time: Date.now() };
    res.json(payload);
  } catch (err) {
    console.error('News hatası:', err.message);
    res.json(buildFallbackNews());
  }
});

function buildFallbackNews() {
  return {
    items: [],
    digest: 'Haber servisi şu anda kullanılamıyor.',
    meta: { total: 0, sources: 0, updatedAt: new Date().toISOString() },
    sourceBreakdown: {},
    live: false,
    provider: 'fallback'
  };
}

module.exports = router;
