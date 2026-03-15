// ═══════════════════════════════════════════════
// BORSiA — AI Rate Limiter Middleware
// ═══════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const AI_DAILY_LIMITS = {
  free: 5,
  pro: 50,
  premium: Infinity
};

/**
 * aiLimiter — günlük AI kullanım limiti kontrolü
 * requireAuth'tan SONRA kullanılmalı (req.user gerekli)
 */
async function aiLimiter(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Oturum gerekli.' });
    }

    // Admin ve premium sınırsız
    if (user.role === 'admin' || user.plan === 'premium') {
      return next();
    }

    const limit = AI_DAILY_LIMITS[user.plan] || AI_DAILY_LIMITS.free;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Bugünkü kullanımı bul veya oluştur
    let usage = await prisma.aIUsage.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: today
        }
      }
    });

    if (!usage) {
      usage = await prisma.aIUsage.create({
        data: {
          userId: user.id,
          date: today,
          count: 0
        }
      });
    }

    if (usage.count >= limit) {
      return res.status(429).json({
        error: 'Günlük AI kullanım limitine ulaştın.',
        limit,
        used: usage.count,
        plan: user.plan,
        resetAt: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        upgrade: user.plan === 'free'
          ? 'Yatırımcı planına geçerek günlük 50 AI sorgusu kullanabilirsin.'
          : 'Profesyonel plana geçerek sınırsız AI kullanımı elde edebilirsin.'
      });
    }

    // Kullanımı artır
    await prisma.aIUsage.update({
      where: {
        userId_date: {
          userId: user.id,
          date: today
        }
      },
      data: { count: { increment: 1 } }
    });

    // Kalan bilgisini response header'a ekle
    res.set('X-AI-Limit', String(limit));
    res.set('X-AI-Used', String(usage.count + 1));
    res.set('X-AI-Remaining', String(Math.max(0, limit - usage.count - 1)));

    next();
  } catch (err) {
    console.error('AI limiter hatası:', err.message);
    // Limit kontrolü başarısız olursa geçişe izin ver (fail-open)
    next();
  }
}

/**
 * getAIUsageInfo — kullanıcının günlük AI kullanım durumu
 */
async function getAIUsageInfo(userId, plan) {
  const limit = AI_DAILY_LIMITS[plan] || AI_DAILY_LIMITS.free;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const usage = await prisma.aIUsage.findUnique({
    where: { userId_date: { userId, date: today } }
  });

  return {
    limit: limit === Infinity ? 'Sınırsız' : limit,
    used: usage?.count || 0,
    remaining: limit === Infinity ? 'Sınırsız' : Math.max(0, limit - (usage?.count || 0)),
    plan,
    resetAt: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
  };
}

module.exports = { aiLimiter, getAIUsageInfo, AI_DAILY_LIMITS };
