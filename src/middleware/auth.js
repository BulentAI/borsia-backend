// ═══════════════════════════════════════════════
// BORSiA — Auth Middleware
// ═══════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * requireAuth — oturum kontrolü
 * Session cookie'den userId alır, DB'den kullanıcıyı çeker
 */
async function requireAuth(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Oturum gerekli. Lütfen giriş yapın.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        plan: true,
        createdAt: true
      }
    });

    if (!user) {
      req.session.destroy();
      return res.status(401).json({ error: 'Kullanıcı bulunamadı. Lütfen tekrar giriş yapın.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware hatası:', err.message);
    res.status(500).json({ error: 'Kimlik doğrulama hatası' });
  }
}

/**
 * requireAdmin — admin rolü kontrolü
 * requireAuth'tan SONRA kullanılmalı
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Bu işlem için admin yetkisi gerekli.' });
  }
  next();
}

/**
 * optionalAuth — opsiyonel auth
 * Giriş yapılmışsa req.user set eder, yapılmamışsa null
 */
async function optionalAuth(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, plan: true }
      });
      req.user = user || null;
    } else {
      req.user = null;
    }
    next();
  } catch {
    req.user = null;
    next();
  }
}

module.exports = { requireAuth, requireAdmin, optionalAuth };
