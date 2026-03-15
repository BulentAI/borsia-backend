// ═══════════════════════════════════════════════
// BORSiA — Database Seed
// ═══════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 BORSiA veritabanı seed başlıyor...\n');

  // ─── USERS ───
  const adminHash = await bcrypt.hash('Admin123!', 12);
  const demoHash = await bcrypt.hash('demo123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@borsia.com' },
    update: {},
    create: {
      name: 'Admin Kullanıcı',
      email: 'admin@borsia.com',
      passwordHash: adminHash,
      role: 'admin',
      plan: 'premium'
    }
  });

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@borsia.com' },
    update: {},
    create: {
      name: 'Demo Kullanıcı',
      email: 'demo@borsia.com',
      passwordHash: demoHash,
      role: 'user',
      plan: 'free'
    }
  });

  console.log(`  ✅ Admin: ${admin.email} (plan: ${admin.plan})`);
  console.log(`  ✅ Demo:  ${demoUser.email} (plan: ${demoUser.plan})`);

  // ─── USER PREFERENCES ───
  await prisma.userPreference.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id }
  });
  await prisma.userPreference.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: { userId: demoUser.id }
  });

  // ─── DEMO ANALYSES ───
  const analyses = [
    {
      title: 'THYAO orta vadeli sıkışma görünümü',
      category: 'Hisse',
      symbol: 'THYAO',
      summary: 'Dar bant kırılımı öncesi hacim takibi kritik.',
      detail: 'THYAO tarafında 50 günlük ortalama üzerinde kalıcılık korunursa yukarı yönlü senaryo güçlenebilir. Hacim artışı teyit olarak izlenmeli. Kısa vadede 260-275 bandı destek, 295-310 bandı ilk direnç bölgesi olarak çalışıyor.',
      risk: 'Orta',
      plan: 'free',
      status: 'active',
      featured: true,
      subcategory: 'Günlük Analiz',
      tags: ['bist', 'teknik'],
      chartUrls: [],
      authorId: admin.id
    },
    {
      title: 'BTCUSD 4 saatlik momentum takibi',
      category: 'Kripto',
      symbol: 'BTCUSD',
      summary: 'Likidite süpürmesi sonrası yön tayini aranıyor.',
      detail: 'BTCUSD tarafında kısa vadeli likidite temizliği sonrası ana direnç üzerinde kapanış gelirse momentum devamı izlenebilir. Aksi halde geri çekilme riski korunur. Hacim profili destek bölgesi 62.000-63.500 aralığında yoğunlaşmış durumda.',
      risk: 'Yüksek',
      plan: 'pro',
      status: 'active',
      featured: true,
      subcategory: 'Momentum',
      tags: ['btc', 'kripto'],
      chartUrls: [],
      authorId: admin.id
    },
    {
      title: 'EURUSD veri haftası öncesi denge bölgesi',
      category: 'Forex',
      symbol: 'EURUSD',
      summary: 'Parite güçlü veri öncesi karar alanında.',
      detail: 'Makro veri akışına bağlı olarak EURUSD tarafında yönlü kırılım bekleniyor. Alt bant kırılırsa satış baskısı artabilir. ECB ve FED arasındaki faiz farkı hala belirleyici.',
      risk: 'Orta',
      plan: 'free',
      status: 'active',
      featured: false,
      subcategory: 'Makro Görünüm',
      tags: ['forex', 'majör'],
      chartUrls: [],
      authorId: admin.id
    },
    {
      title: 'Altın 2800 üzeri konsolidasyon analizi',
      category: 'Emtia',
      symbol: 'XAUUSD',
      summary: 'Merkez bankası alımları desteğinde yeni zirve potansiyeli.',
      detail: 'Altın fiyatları küresel belirsizlik ortamında güçlü kalmaya devam ediyor. Merkez bankası alımları ve reel faiz beklentileri temel sürücüler. 2800 üzerinde konsolidasyon devam ederse 2900-2950 bandı hedeflenebilir.',
      risk: 'Düşük',
      plan: 'premium',
      status: 'active',
      featured: true,
      subcategory: 'Temel Analiz',
      tags: ['altın', 'emtia', 'premium'],
      chartUrls: [],
      authorId: admin.id
    }
  ];

  for (const data of analyses) {
    const existing = await prisma.analysis.findFirst({ where: { title: data.title } });
    if (!existing) {
      await prisma.analysis.create({ data });
    }
  }
  console.log(`  ✅ ${analyses.length} demo analiz kontrol edildi\n`);

  console.log('🎉 Seed tamamlandı!\n');
  console.log('  Giriş bilgileri:');
  console.log('  Admin → admin@borsia.com / Admin123!');
  console.log('  Demo  → demo@borsia.com / demo123\n');
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Seed hatası:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
