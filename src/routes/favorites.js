// ═══════════════════════════════════════════════
// BORSiA — Favorites Routes
// ═══════════════════════════════════════════════

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── GET /api/favorites ───
router.get('/', requireAuth, async (req, res) => {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user.id },
      include: {
        analysis: {
          select: {
            id: true, title: true, category: true, symbol: true,
            summary: true, risk: true, plan: true, status: true,
            featured: true, chartUrls: true, createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      favorites: favorites.map(f => f.analysis),
      count: favorites.length
    });
  } catch (err) {
    console.error('Favorites list hatası:', err.message);
    res.status(500).json({ error: 'Favoriler yüklenemedi.' });
  }
});

// ─── POST /api/favorites/:analysisId ───
router.post('/:analysisId', requireAuth, async (req, res) => {
  try {
    const { analysisId } = req.params;

    // Analiz var mı?
    const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return res.status(404).json({ error: 'Analiz bulunamadı.' });
    }

    // Zaten favori mi?
    const existing = await prisma.favorite.findUnique({
      where: { userId_analysisId: { userId: req.user.id, analysisId } }
    });
    if (existing) {
      return res.status(409).json({ error: 'Bu analiz zaten favorilerde.' });
    }

    await prisma.favorite.create({
      data: { userId: req.user.id, analysisId }
    });

    res.status(201).json({ message: 'Favorilere eklendi.', analysisId });
  } catch (err) {
    console.error('Favorite add hatası:', err.message);
    res.status(500).json({ error: 'Favoriye eklenemedi.' });
  }
});

// ─── DELETE /api/favorites/:analysisId ───
router.delete('/:analysisId', requireAuth, async (req, res) => {
  try {
    const { analysisId } = req.params;

    const existing = await prisma.favorite.findUnique({
      where: { userId_analysisId: { userId: req.user.id, analysisId } }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Favori bulunamadı.' });
    }

    await prisma.favorite.delete({
      where: { userId_analysisId: { userId: req.user.id, analysisId } }
    });

    res.json({ message: 'Favorilerden çıkarıldı.', analysisId });
  } catch (err) {
    console.error('Favorite remove hatası:', err.message);
    res.status(500).json({ error: 'Favoriden çıkarılamadı.' });
  }
});

module.exports = router;
