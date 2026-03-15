// ═══════════════════════════════════════════════
// BORSiA — Analyses Routes
// ═══════════════════════════════════════════════

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validate, createAnalysisSchema, updateAnalysisSchema } = require('../utils/validators');

const router = express.Router();
const prisma = new PrismaClient();

// ─── CHART UPLOAD CONFIG ───
const uploadDir = path.join(process.cwd(), 'uploads', 'charts');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(ext && mime ? null : new Error('Sadece resim dosyaları kabul edilir'), ext && mime);
  }
});

// ─── PLAN RANK HELPER ───
const PLAN_RANK = { free: 0, pro: 1, premium: 2 };
function canAccess(userPlan, neededPlan) {
  return (PLAN_RANK[userPlan] ?? 0) >= (PLAN_RANK[neededPlan] ?? 0);
}

// ─── GET /api/analyses ───
router.get('/', requireAuth, async (req, res) => {
  try {
    const { category, symbol, status, featured, search, page = 1, limit = 50 } = req.query;
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

    const where = {};
    if (category) where.category = category;
    if (symbol) where.symbol = { contains: symbol, mode: 'insensitive' };
    if (status) where.status = status;
    if (featured === 'true') where.featured = true;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        { symbol: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Plan filtresi: kullanıcı kendi planı ve altını görebilir
    if (req.user.role !== 'admin') {
      const rank = PLAN_RANK[req.user.plan] ?? 0;
      const accessiblePlans = Object.entries(PLAN_RANK)
        .filter(([, r]) => r <= rank)
        .map(([p]) => p);
      where.plan = { in: accessiblePlans };
    }

    const [analyses, total] = await Promise.all([
      prisma.analysis.findMany({
        where,
        orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: Number(limit),
        include: {
          author: { select: { id: true, name: true } },
          _count: { select: { favorites: true } }
        }
      }),
      prisma.analysis.count({ where })
    ]);

    res.json({
      analyses,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (err) {
    console.error('Analyses list hatası:', err.message);
    res.status(500).json({ error: 'Analizler yüklenemedi.' });
  }
});

// ─── GET /api/analyses/:id ───
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const analysis = await prisma.analysis.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: { id: true, name: true } },
        _count: { select: { favorites: true } }
      }
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analiz bulunamadı.' });
    }

    // Plan erişim kontrolü
    if (req.user.role !== 'admin' && !canAccess(req.user.plan, analysis.plan)) {
      return res.status(403).json({
        error: 'Bu analiz mevcut planınızla erişilebilir değil.',
        requiredPlan: analysis.plan,
        currentPlan: req.user.plan
      });
    }

    res.json({ analysis });
  } catch (err) {
    console.error('Analysis detail hatası:', err.message);
    res.status(500).json({ error: 'Analiz detayı yüklenemedi.' });
  }
});

// ─── POST /api/analyses ───
router.post('/', requireAuth, requireAdmin, validate(createAnalysisSchema), async (req, res) => {
  try {
    const data = req.validated;

    const analysis = await prisma.analysis.create({
      data: {
        ...data,
        authorId: req.user.id
      }
    });

    res.status(201).json({ message: 'Analiz oluşturuldu.', analysis });
  } catch (err) {
    console.error('Analysis create hatası:', err.message);
    res.status(500).json({ error: 'Analiz oluşturulamadı.' });
  }
});

// ─── PATCH /api/analyses/:id ───
router.patch('/:id', requireAuth, requireAdmin, validate(updateAnalysisSchema), async (req, res) => {
  try {
    const existing = await prisma.analysis.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Analiz bulunamadı.' });
    }

    const analysis = await prisma.analysis.update({
      where: { id: req.params.id },
      data: req.validated
    });

    res.json({ message: 'Analiz güncellendi.', analysis });
  } catch (err) {
    console.error('Analysis update hatası:', err.message);
    res.status(500).json({ error: 'Analiz güncellenemedi.' });
  }
});

// ─── DELETE /api/analyses/:id ───
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const existing = await prisma.analysis.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Analiz bulunamadı.' });
    }

    await prisma.analysis.delete({ where: { id: req.params.id } });
    res.json({ message: 'Analiz silindi.' });
  } catch (err) {
    console.error('Analysis delete hatası:', err.message);
    res.status(500).json({ error: 'Analiz silinemedi.' });
  }
});

// ─── POST /api/analyses/:id/charts ───
router.post('/:id/charts', requireAuth, requireAdmin, upload.array('charts', 10), async (req, res) => {
  try {
    const analysis = await prisma.analysis.findUnique({ where: { id: req.params.id } });
    if (!analysis) {
      return res.status(404).json({ error: 'Analiz bulunamadı.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'En az bir dosya yükleyin.' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const newUrls = req.files.map(f => `${baseUrl}/uploads/charts/${f.filename}`);
    const chartUrls = [...analysis.chartUrls, ...newUrls];

    const updated = await prisma.analysis.update({
      where: { id: req.params.id },
      data: { chartUrls }
    });

    res.json({ message: `${req.files.length} grafik yüklendi.`, chartUrls: updated.chartUrls });
  } catch (err) {
    console.error('Chart upload hatası:', err.message);
    res.status(500).json({ error: 'Grafik yüklenemedi.' });
  }
});

module.exports = router;
