// ═══════════════════════════════════════════════
// BORSiA — Users Routes (Admin)
// ═══════════════════════════════════════════════

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validate, updateUserSchema } = require('../utils/validators');

const router = express.Router();
const prisma = new PrismaClient();

// ─── GET /api/users ───
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { search, plan, role, page = 1, limit = 50 } = req.query;
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

    const where = {};
    if (plan) where.plan = plan;
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, role: true, plan: true,
          createdAt: true, updatedAt: true,
          _count: { select: { favorites: true, analyses: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    });
  } catch (err) {
    console.error('Users list hatası:', err.message);
    res.status(500).json({ error: 'Kullanıcılar yüklenemedi.' });
  }
});

// ─── PATCH /api/users/:id ───
router.patch('/:id', requireAuth, requireAdmin, validate(updateUserSchema), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: req.validated,
      select: { id: true, name: true, email: true, role: true, plan: true, updatedAt: true }
    });

    res.json({ message: 'Kullanıcı güncellendi.', user: updated });
  } catch (err) {
    console.error('User update hatası:', err.message);
    res.status(500).json({ error: 'Kullanıcı güncellenemedi.' });
  }
});

module.exports = router;
