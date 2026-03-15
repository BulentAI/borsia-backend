// ═══════════════════════════════════════════════
// BORSiA Backend — Main Server
// ═══════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

// ─── CORS ───
const allowedOrigins = [
  'https://borsia.com.tr',
  'https://www.borsia.com.tr',
  'http://borsia.com.tr',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? function (origin, cb) {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true);
        else cb(null, true); // Geçici: tüm origin'leri kabul et (debug için)
      }
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── BODY PARSERS ───
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── SESSION ───
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 gün
  },
  name: 'borsia.sid'
}));

// ─── STATIC FILES (chart uploads) ───
app.use('/uploads', express.static('uploads'));

// ─── HEALTH CHECK ───
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'borsia-backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ─── ROUTES ───
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/analyses', require('./routes/analyses'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/market', require('./routes/market'));
app.use('/api/news', require('./routes/news'));
app.use('/api/economic-calendar', require('./routes/economicCalendar'));
app.use('/api/subscriptions', require('./routes/iyzico'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/admin', require('./routes/admin'));

// ─── PUBLIC SEO PAGES (Phase 5) ───
const publicRoutes = require('./routes/public');
app.use('/p', publicRoutes);
app.use('/', publicRoutes); // sitemap.xml, robots.txt

// ─── SHARE REDIRECT ───
app.get('/s/:id', (req, res) => {
  res.redirect(301, `/p/analysis/${req.params.id}`);
});

// ─── 404 ───
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint bulunamadı', path: req.originalUrl });
  }
  res.status(404).send('<html><head><meta charset="UTF-8"><title>Sayfa bulunamadı — BORSiA</title></head><body style="font-family:sans-serif;text-align:center;padding:80px 20px"><h1>404</h1><p>Aradığınız sayfa bulunamadı.</p><a href="/" style="color:#0077b6">Ana Sayfa</a></body></html>');
});

// ─── GLOBAL ERROR HANDLER ───
app.use((err, req, res, next) => {
  console.error('🔴 Server Error:', err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Sunucu hatası oluştu'
      : err.message
  });
});

// ─── START ───
const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await prisma.$connect();
    console.log('✅ Database bağlantısı başarılı');

    app.listen(PORT, () => {
      console.log(`\n🚀 BORSiA Backend çalışıyor → http://localhost:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Frontend origin: ${process.env.FRONTEND_URL || 'http://localhost:5500'}\n`);
    });
  } catch (err) {
    console.error('❌ Başlatma hatası:', err);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = { prisma };
