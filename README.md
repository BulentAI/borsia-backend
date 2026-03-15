# BORSiA Backend — Phase 4

AI-powered finance analysis & market data SaaS platform backend.

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Express.js
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Auth:** Session/Cookie (express-session + connect-pg-simple)
- **Payment:** Stripe
- **AI:** LM Studio (local proxy)
- **Market Data:** Finnhub API

---

## Kurulum

### 1. PostgreSQL Kurulumu

PostgreSQL yüklü ve çalışır durumda olmalı. Bir veritabanı oluştur:

```bash
createdb borsia
```

### 2. Proje Bağımlılıkları

```bash
cd borsia-backend
npm install
```

### 3. Environment Değişkenleri

`.env.example` dosyasını `.env` olarak kopyala ve düzenle:

```bash
cp .env.example .env
```

**Zorunlu değişkenler:**
- `DATABASE_URL` — PostgreSQL bağlantı string'i
- `SESSION_SECRET` — Güçlü rastgele string (en az 64 karakter)

**Opsiyonel (ama önerilen):**
- `FINNHUB_API_KEY` — Canlı piyasa verisi için
- `STRIPE_SECRET_KEY` — Ödeme sistemi için
- `LM_STUDIO_URL` — AI modül bağlantısı (varsayılan: http://127.0.0.1:1234)

### 4. Veritabanı Migration

```bash
npx prisma generate
npx prisma db push
```

### 5. Seed Verileri

```bash
node prisma/seed.js
```

Bu komut şu verileri oluşturur:
- **Admin:** admin@borsia.com / Admin123!
- **Demo:** demo@borsia.com / demo123
- 4 demo analiz

### 6. Sunucuyu Başlat

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Sunucu varsayılan olarak `http://localhost:3001` adresinde çalışır.

---

## API Endpoints

### Auth
| Method | Endpoint | Yetki | Açıklama |
|--------|----------|-------|----------|
| POST | /api/auth/register | Public | Yeni kullanıcı kaydı |
| POST | /api/auth/login | Public | Giriş |
| POST | /api/auth/logout | Auth | Çıkış |
| GET | /api/auth/me | Auth | Aktif kullanıcı bilgisi |
| PATCH | /api/auth/preferences | Auth | Tercih güncelleme |

### Analyses
| Method | Endpoint | Yetki | Açıklama |
|--------|----------|-------|----------|
| GET | /api/analyses | Auth | Liste (plan filtreli) |
| GET | /api/analyses/:id | Auth | Detay |
| POST | /api/analyses | Admin | Oluştur |
| PATCH | /api/analyses/:id | Admin | Güncelle |
| DELETE | /api/analyses/:id | Admin | Sil |
| POST | /api/analyses/:id/charts | Admin | Chart yükle |

### Favorites
| Method | Endpoint | Yetki |
|--------|----------|-------|
| GET | /api/favorites | Auth |
| POST | /api/favorites/:analysisId | Auth |
| DELETE | /api/favorites/:analysisId | Auth |

### AI
| Method | Endpoint | Yetki |
|--------|----------|-------|
| POST | /api/ai/chat | Auth + Limit |
| POST | /api/ai/generate-analysis | Auth + Limit |
| POST | /api/ai/expand-analysis | Auth + Limit |
| GET | /api/ai/usage | Auth |
| GET | /api/ai/recent-prompts | Auth |

### Market & News
| Method | Endpoint | Yetki |
|--------|----------|-------|
| GET | /api/market/snapshot | Auth |
| GET | /api/market/pulse | Auth |
| GET | /api/market/quote/:symbol | Auth |
| GET | /api/news | Auth |
| GET | /api/economic-calendar | Auth |

### Subscriptions (Stripe)
| Method | Endpoint | Yetki |
|--------|----------|-------|
| POST | /api/subscriptions/checkout | Auth |
| GET | /api/subscriptions/status | Auth |
| POST | /api/subscriptions/cancel | Auth |
| POST | /api/subscriptions/webhook | Stripe |

### Admin
| Method | Endpoint | Yetki |
|--------|----------|-------|
| GET | /api/admin/stats | Admin |
| GET | /api/admin/contacts | Admin |
| GET | /api/admin/ai-usage | Admin |
| GET | /api/users | Admin |
| PATCH | /api/users/:id | Admin |

### Other
| Method | Endpoint | Yetki |
|--------|----------|-------|
| POST | /api/contact | Public |
| GET | /api/health | Public |

---

## Plan Sistemi

| | Free | Pro (Yatırımcı) | Premium (Profesyonel) |
|---|---|---|---|
| AI Günlük Limit | 5 | 50 | Sınırsız |
| Pro Analizler | ✗ | ✓ | ✓ |
| Premium Analizler | ✗ | ✗ | ✓ |
| AI Lab | ✗ | ✓ | ✓ |
| AI Enhancer | ✗ | ✗ | ✓ |
| Fiyat (Aylık) | ₺0 | ₺599 | ₺899 |

---

## Proje Yapısı

```
borsia-backend/
├── prisma/
│   ├── schema.prisma    # Veritabanı şeması
│   └── seed.js          # Demo verileri
├── src/
│   ├── middleware/
│   │   ├── auth.js      # Session auth middleware
│   │   └── aiLimiter.js # AI rate limiting
│   ├── routes/
│   │   ├── auth.js      # Register, login, logout, me
│   │   ├── users.js     # Admin user management
│   │   ├── analyses.js  # CRUD + chart upload
│   │   ├── favorites.js # Add/remove favorites
│   │   ├── ai.js        # LM Studio proxy
│   │   ├── market.js    # Finnhub market proxy
│   │   ├── news.js      # Finnhub news proxy
│   │   ├── economicCalendar.js # Fallback demo
│   │   ├── subscriptions.js    # Stripe integration
│   │   ├── contact.js   # Contact form
│   │   └── admin.js     # Admin dashboard stats
│   ├── utils/
│   │   └── validators.js # Zod schemas
│   └── server.js        # Express app entry
├── uploads/
│   └── charts/          # Chart image uploads
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Frontend Entegrasyonu

Frontend HTML dosyasında mevcut `getData()` / `setData()` / `localStorage` çağrıları aşamalı olarak `fetch('/api/...')` çağrılarına dönüştürülecek.

**Temel kural:** Frontend render katmanı yeniden yazılmaz. Sadece veri kaynağı değişir.
