// ═══════════════════════════════════════════════
// BORSiA — Auth Routes
// ═══════════════════════════════════════════════

const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, generateToken } = require('../middleware/auth');
const { validate, registerSchema, loginSchema } = require('../utils/validators');

const router = express.Router();
const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

// ─── POST /api/auth/register ───
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { name, email, password } = req.validated;

    // Email kontrolü
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });
    }

    // Şifre hash'le
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Kullanıcı oluştur
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: 'user',
        plan: 'free'
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        plan: true,
        createdAt: true
      }
    });

    // Tercih kaydı oluştur
    await prisma.userPreference.create({
      data: { userId: user.id }
    });

    // Session + Token
    req.session.userId = user.id;
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'Kayıt başarılı. Hoş geldiniz!',
      user,
      token
    });
  } catch (err) {
    console.error('Register hatası:', err.message);
    res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu.' });
  }
});

// ─── POST /api/auth/login ───
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.validated;

    // Kullanıcı bul
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
    }

    // Şifre doğrula
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });
    }

    // Session + Token
    req.session.userId = user.id;
    const token = generateToken(user.id);

    res.json({
      message: 'Giriş başarılı.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('Login hatası:', err.message);
    res.status(500).json({ error: 'Giriş sırasında bir hata oluştu.' });
  }
});

// ─── POST /api/auth/logout ───
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Çıkış sırasında hata oluştu.' });
    }
    res.clearCookie('borsia.sid');
    res.json({ message: 'Çıkış yapıldı.' });
  });
});

// ─── GET /api/auth/me ───
router.get('/me', requireAuth, async (req, res) => {
  try {
    const prefs = await prisma.userPreference.findUnique({
      where: { userId: req.user.id }
    });

    res.json({
      user: req.user,
      preferences: prefs || { notifications: true, marketEmails: false, rememberTheme: true }
    });
  } catch (err) {
    console.error('Me hatası:', err.message);
    res.status(500).json({ error: 'Kullanıcı bilgisi alınamadı.' });
  }
});

// ─── PATCH /api/auth/preferences ───
router.patch('/preferences', requireAuth, async (req, res) => {
  try {
    const { notifications, marketEmails, rememberTheme } = req.body;
    const data = {};
    if (typeof notifications === 'boolean') data.notifications = notifications;
    if (typeof marketEmails === 'boolean') data.marketEmails = marketEmails;
    if (typeof rememberTheme === 'boolean') data.rememberTheme = rememberTheme;

    const prefs = await prisma.userPreference.upsert({
      where: { userId: req.user.id },
      update: data,
      create: { userId: req.user.id, ...data }
    });

    res.json({ message: 'Tercihler güncellendi.', preferences: prefs });
  } catch (err) {
    console.error('Preferences hatası:', err.message);
    res.status(500).json({ error: 'Tercihler güncellenemedi.' });
  }
});

module.exports = router;
