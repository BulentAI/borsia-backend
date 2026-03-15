// ═══════════════════════════════════════════════
// BORSiA — Admin Routes
// ═══════════════════════════════════════════════

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── GET /api/admin/stats ───
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalAnalyses,
      totalFavorites,
      totalContacts,
      newUsersToday,
      newUsersMonth,
      planBreakdown,
      activeAnalyses,
      featuredAnalyses,
      todayAIUsage,
      recentContacts
    ] = await Promise.all([
      prisma.user.count(),
      prisma.analysis.count(),
      prisma.favorite.count(),
      prisma.contactMessage.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.user.groupBy({ by: ['plan'], _count: { plan: true } }),
      prisma.analysis.count({ where: { status: 'active' } }),
      prisma.analysis.count({ where: { featured: true } }),
      prisma.aIUsage.aggregate({ where: { date: today }, _sum: { count: true } }),
      prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
    ]);

    // Plan breakdown'u objeye çevir
    const plans = {};
    planBreakdown.forEach(p => { plans[p.plan] = p._count.plan; });

    res.json({
      overview: {
        totalUsers,
        totalAnalyses,
        activeAnalyses,
        featuredAnalyses,
        totalFavorites,
        totalContacts
      },
      growth: {
        newUsersToday,
        newUsersMonth
      },
      plans: {
        free: plans.free || 0,
        pro: plans.pro || 0,
        premium: plans.premium || 0
      },
      ai: {
        todayTotalQueries: todayAIUsage._sum.count || 0
      },
      recentContacts,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Admin stats hatası:', err.message);
    res.status(500).json({ error: 'İstatistikler yüklenemedi.' });
  }
});

// ─── GET /api/admin/contacts ───
router.get('/contacts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

    const [contacts, total] = await Promise.all([
      prisma.contactMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.contactMessage.count()
    ]);

    res.json({
      contacts,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    });
  } catch (err) {
    console.error('Admin contacts hatası:', err.message);
    res.status(500).json({ error: 'İletişim mesajları yüklenemedi.' });
  }
});

// ─── GET /api/admin/ai-usage ───
router.get('/ai-usage', requireAuth, requireAdmin, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const usage = await prisma.aIUsage.findMany({
      where: { date: { gte: sevenDaysAgo } },
      include: { user: { select: { name: true, email: true, plan: true } } },
      orderBy: [{ date: 'desc' }, { count: 'desc' }]
    });

    // Günlük toplam
    const dailyTotals = {};
    usage.forEach(u => {
      const day = u.date.toISOString().slice(0, 10);
      dailyTotals[day] = (dailyTotals[day] || 0) + u.count;
    });

    res.json({ usage, dailyTotals });
  } catch (err) {
    console.error('Admin AI usage hatası:', err.message);
    res.status(500).json({ error: 'AI kullanım verileri yüklenemedi.' });
  }
});

// ─── DELETE /api/admin/cleanup-users — Test kullanıcılarını sil ───
router.delete('/cleanup-users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const keepEmails = ['admin@borsia.com', 'demo@borsia.com'];
    
    const toDelete = await prisma.user.findMany({
      where: { email: { notIn: keepEmails } },
      select: { id: true, email: true }
    });

    if (!toDelete.length) {
      return res.json({ message: 'Silinecek kullanıcı yok.', kept: keepEmails, deleted: [] });
    }

    const userIds = toDelete.map(u => u.id);

    // Cascade olmayan ilişkileri elle sil
    await prisma.aIRecentPrompt.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.aIUsage.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.favorite.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userPreference.deleteMany({ where: { userId: { in: userIds } } });
    // Analysis authorId SetNull olduğu için null yap
    await prisma.analysis.updateMany({ where: { authorId: { in: userIds } }, data: { authorId: null } });
    // Kullanıcıları sil
    const result = await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    console.log('Silindi: ' + result.count + ' kullanici');
    res.json({ 
      message: result.count + ' test kullanici silindi.',
      kept: keepEmails,
      deleted: toDelete.map(u => u.email)
    });
  } catch (err) {
    console.error('Cleanup hatasi:', err.message);
    res.status(500).json({ error: 'Temizlik hatasi: ' + err.message });
  }
});

module.exports = router;
