// ═══════════════════════════════════════════════
// BORSiA — Economic Calendar Route (Fallback)
// ═══════════════════════════════════════════════

const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/economic-calendar ───
// Şu an fallback/demo — gerçek provider entegrasyonu Phase 4+ 'ta
router.get('/', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const startOfHour = new Date(now);
    startOfHour.setMinutes(0, 0, 0);

    const items = [
      { id: 'eco-1', title: 'ABD TÜFE (Aylık)', country: 'ABD', currency: 'USD', impact: 'high', datetime: new Date(startOfHour.getTime() + 2 * 3600000).toISOString(), actual: '—', forecast: '0.3%', previous: '0.2%', category: 'Enflasyon', source: 'Demo Takvim' },
      { id: 'eco-2', title: 'ECB Faiz Kararı', country: 'Euro Bölgesi', currency: 'EUR', impact: 'high', datetime: new Date(startOfHour.getTime() + 5 * 3600000).toISOString(), actual: '—', forecast: '4.50%', previous: '4.50%', category: 'Faiz', source: 'Demo Takvim' },
      { id: 'eco-3', title: 'İngiltere PMI İmalat', country: 'Birleşik Krallık', currency: 'GBP', impact: 'medium', datetime: new Date(startOfHour.getTime() + 26 * 3600000).toISOString(), actual: '—', forecast: '51.2', previous: '50.8', category: 'PMI', source: 'Demo Takvim' },
      { id: 'eco-4', title: 'Japonya Sanayi Üretimi', country: 'Japonya', currency: 'JPY', impact: 'low', datetime: new Date(startOfHour.getTime() + 52 * 3600000).toISOString(), actual: '—', forecast: '0.4%', previous: '-0.1%', category: 'Makro Veri', source: 'Demo Takvim' },
      { id: 'eco-5', title: 'Almanya Resmi Tatil', country: 'Almanya', currency: 'EUR', impact: 'holiday', datetime: new Date(startOfHour.getTime() + 76 * 3600000).toISOString(), actual: 'Tatil', forecast: '—', previous: '—', category: 'Holiday', source: 'Demo Takvim' },
      { id: 'eco-6', title: 'ABD İşsizlik Başvuruları', country: 'ABD', currency: 'USD', impact: 'medium', datetime: new Date(startOfHour.getTime() + 3 * 3600000).toISOString(), actual: '—', forecast: '220K', previous: '215K', category: 'İstihdam', source: 'Demo Takvim' },
      { id: 'eco-7', title: 'Çin PMI Hizmet', country: 'Çin', currency: 'CNY', impact: 'medium', datetime: new Date(startOfHour.getTime() + 48 * 3600000).toISOString(), actual: '—', forecast: '52.0', previous: '51.5', category: 'PMI', source: 'Demo Takvim' },
      { id: 'eco-8', title: 'FED Başkanı Konuşması', country: 'ABD', currency: 'USD', impact: 'high', datetime: new Date(startOfHour.getTime() + 30 * 3600000).toISOString(), actual: '—', forecast: '—', previous: '—', category: 'Konuşma', source: 'Demo Takvim' }
    ];

    res.json({
      items,
      meta: {
        total: items.length,
        updatedAt: new Date().toISOString()
      },
      live: false,
      provider: 'fallback',
      note: 'Ekonomik takvim şu an demo modunda. Gerçek veri entegrasyonu ilerleyen sürümlerde eklenecek.'
    });
  } catch (err) {
    console.error('Economic calendar hatası:', err.message);
    res.json({ items: [], live: false, provider: 'error', error: err.message });
  }
});

module.exports = router;
