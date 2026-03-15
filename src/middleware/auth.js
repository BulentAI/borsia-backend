// ═══════════════════════════════════════════════
// BORSiA — Auth Middleware (Token-based, cross-domain)
// ═══════════════════════════════════════════════

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SECRET = process.env.SESSION_SECRET || 'borsia-default-secret';

function generateToken(userId) {
  const sig = crypto.createHmac('sha256', SECRET).update(userId).digest('hex');
  return Buffer.from(userId + ':' + sig).toString('base64');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    const userId = parts[0];
    const sig = parts[1];
    if (!userId || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(userId).digest('hex');
    return sig === expected ? userId : null;
  } catch (e) { return null; }
}

function getUserIdFromRequest(req) {
  var authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    var userId = verifyToken(authHeader.slice(7));
    if (userId) return userId;
  }
  return (req.session && req.session.userId) || null;
}

async function requireAuth(req, res, next) {
  try {
    var userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Oturum gerekli. Lütfen giriş yapın.' });
    var user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, plan: true, createdAt: true }
    });
    if (!user) return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware hatası:', err.message);
    res.status(500).json({ error: 'Kimlik doğrulama hatası' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin yetkisi gerekli.' });
  next();
}

async function optionalAuth(req, res, next) {
  try {
    var userId = getUserIdFromRequest(req);
    if (userId) {
      var user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, plan: true } });
      req.user = user || null;
    } else { req.user = null; }
    next();
  } catch (e) { req.user = null; next(); }
}

module.exports = { requireAuth, requireAdmin, optionalAuth, generateToken, verifyToken };
