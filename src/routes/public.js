// ═══════════════════════════════════════════════
// BORSiA — Public SEO Pages (Phase 5)
// Shareable analysis pages + blog + sitemap
// ═══════════════════════════════════════════════

const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const SITE_URL = process.env.SITE_URL || process.env.FRONTEND_URL || 'http://localhost:5500';
const SITE_NAME = 'BORSiA';
const SITE_DESC = 'AI destekli finans analiz ve piyasa verisi platformu';

// ─── HELPER: HTML escape ───
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── HELPER: Truncate text ───
function truncate(text, len) {
  const s = String(text || '').trim();
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}

// ─── HELPER: Risk badge color ───
function riskColor(risk) {
  const r = String(risk || '').toLowerCase();
  if (r.indexOf('yüksek') !== -1 || r.indexOf('high') !== -1) return '#dc2626';
  if (r.indexOf('düşük') !== -1 || r.indexOf('low') !== -1) return '#0f9d7a';
  return '#cc8a00';
}

// ─── HELPER: Category icon ───
function catIcon(cat) {
  const c = String(cat || '').toLowerCase();
  if (c.indexOf('hisse') !== -1) return '📈';
  if (c.indexOf('kripto') !== -1) return '₿';
  if (c.indexOf('forex') !== -1) return '💱';
  if (c.indexOf('emtia') !== -1) return '🥇';
  return '📊';
}

// ─── SHARED PAGE SHELL ───
function pageShell(opts) {
  const { title, description, ogImage, ogUrl, canonical, body, jsonLd } = opts;
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(title)} — ${SITE_NAME}</title>
<meta name="description" content="${esc(truncate(description, 160))}"/>
<link rel="canonical" href="${esc(canonical || ogUrl || SITE_URL)}"/>

<!-- Open Graph -->
<meta property="og:type" content="article"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(truncate(description, 200))}"/>
<meta property="og:url" content="${esc(ogUrl || SITE_URL)}"/>
<meta property="og:site_name" content="${SITE_NAME}"/>
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}"/>` : ''}

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(truncate(description, 200))}"/>
${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}"/>` : ''}

<meta name="theme-color" content="#0077B6"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet"/>

${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}

<style>
:root{--primary:#0077b6;--dark:#023e8a;--bg:#f6fbff;--panel:#ffffff;--text:#10233d;--muted:#5f728c;--border:#d9e7f4;--success:#0f9d7a;--warn:#cc8a00;--radius:22px}
*{box-sizing:border-box;margin:0}
body{font-family:Inter,system-ui,sans-serif;color:var(--text);background:var(--bg);line-height:1.7}
a{color:var(--primary);text-decoration:none}
.container{width:min(780px,calc(100% - 40px));margin:0 auto}
.topbar{background:var(--dark);padding:14px 0;text-align:center}
.topbar a{color:#fff;font-weight:800;font-family:Manrope,sans-serif;font-size:1.1rem;letter-spacing:-.03em}
.hero{padding:48px 0 32px;border-bottom:1px solid var(--border)}
.badge{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:.82rem;font-weight:700;border:1px solid var(--border);background:var(--panel)}
.risk{color:${riskColor('')}}
h1{font:800 clamp(24px,4vw,36px)/1.15 Manrope,sans-serif;letter-spacing:-.04em;margin:16px 0 12px}
.meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:.9rem;margin:0 0 18px}
.summary{font-size:1.05rem;color:var(--text);line-height:1.8;margin:0 0 24px}
.chart-img{width:100%;border-radius:16px;border:1px solid var(--border);margin:18px 0}
.content{padding:32px 0 48px}
.detail{font-size:1rem;line-height:1.9;color:var(--text);white-space:pre-line}
.cta-box{margin:32px 0;padding:28px;border-radius:var(--radius);border:2px solid var(--primary);background:linear-gradient(180deg,#eef7ff,#f6fbff);text-align:center}
.cta-box h3{font:800 1.3rem/1.2 Manrope,sans-serif;margin:0 0 8px}
.cta-box p{color:var(--muted);margin:0 0 16px;font-size:.95rem}
.cta-btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:14px;background:var(--primary);color:#fff;font-weight:700;font-size:1rem;border:none;cursor:pointer;transition:.2s}
.cta-btn:hover{background:var(--dark);transform:translateY(-1px)}
.paywall{position:relative;max-height:180px;overflow:hidden}
.paywall::after{content:'';position:absolute;bottom:0;left:0;right:0;height:120px;background:linear-gradient(transparent,var(--bg))}
.tags{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
.tag{padding:5px 10px;border-radius:999px;background:#eef7ff;color:var(--dark);font-size:.8rem;font-weight:700;border:1px solid var(--border)}
.related{padding:32px 0;border-top:1px solid var(--border)}
.related h3{font:700 1.1rem/1.2 Manrope,sans-serif;margin:0 0 16px}
.related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.related-card{padding:16px;border:1px solid var(--border);border-radius:16px;background:var(--panel)}
.related-card h4{margin:0 0 6px;font-size:.95rem}
.related-card p{margin:0;font-size:.82rem;color:var(--muted);line-height:1.5}
.footer{padding:24px 0;border-top:1px solid var(--border);text-align:center;color:var(--muted);font-size:.82rem}
.scenario{margin:18px 0;padding:18px;border-radius:16px;border:1px solid var(--border);background:var(--panel)}
.scenario strong{display:block;margin-bottom:6px}
@media(max-width:600px){h1{font-size:1.4rem}.meta{font-size:.82rem}}
</style>
</head>
<body>
<div class="topbar"><a href="${SITE_URL}">${SITE_NAME}</a></div>
${body}
<div class="footer"><div class="container">&copy; ${new Date().getFullYear()} ${SITE_NAME} — AI destekli finans analiz platformu &middot; <a href="${SITE_URL}">Ana Sayfa</a> &middot; <a href="${SITE_URL}/blog">Blog</a></div></div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════
// GET /p/analysis/:id — Public analysis SEO page
// ═══════════════════════════════════════════════
router.get('/analysis/:id', async (req, res) => {
  try {
    const analysis = await prisma.analysis.findUnique({
      where: { id: req.params.id },
      include: { author: { select: { name: true } } }
    });

    if (!analysis) {
      return res.status(404).send(pageShell({
        title: 'Analiz bulunamadı',
        description: 'Bu analiz mevcut değil veya kaldırılmış olabilir.',
        ogUrl: `${SITE_URL}/p/analysis/${req.params.id}`,
        body: '<div class="container" style="padding:80px 0;text-align:center"><h1>Analiz bulunamadı</h1><p style="color:var(--muted);margin:16px 0">Bu analiz mevcut değil veya kaldırılmış.</p><a href="' + SITE_URL + '" class="cta-btn">Ana Sayfaya Dön</a></div>'
      }));
    }

    const isFree = analysis.plan === 'free';
    const ogImage = analysis.chartUrls && analysis.chartUrls.length > 0 ? analysis.chartUrls[0] : '';
    const pageUrl = `${SITE_URL}/p/analysis/${analysis.id}`;
    const createdDate = analysis.createdAt ? new Date(analysis.createdAt).toISOString() : new Date().toISOString();

    // Related analyses (same category or symbol)
    const related = await prisma.analysis.findMany({
      where: {
        id: { not: analysis.id },
        status: 'active',
        OR: [{ category: analysis.category }, { symbol: analysis.symbol }]
      },
      take: 4,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, symbol: true, category: true, summary: true, plan: true }
    });

    // JSON-LD structured data
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: analysis.title,
      description: truncate(analysis.summary, 200),
      datePublished: createdDate,
      author: { '@type': 'Organization', name: SITE_NAME },
      publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
      mainEntityOfPage: pageUrl,
      ...(ogImage ? { image: ogImage } : {})
    };

    const chartHtml = (analysis.chartUrls || []).slice(0, 2).map(url =>
      `<img class="chart-img" src="${esc(url)}" alt="${esc(analysis.title)} grafik" loading="lazy"/>`
    ).join('');

    const tagsHtml = (analysis.tags || []).length > 0
      ? `<div class="tags">${analysis.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
      : '';

    const relatedHtml = related.length > 0
      ? `<div class="related"><div class="container"><h3>İlgili analizler</h3><div class="related-grid">${related.map(r =>
          `<a href="/p/analysis/${r.id}" class="related-card"><h4>${catIcon(r.category)} ${esc(r.title)}</h4><p>${esc(truncate(r.summary, 80))}</p><span class="badge" style="margin-top:8px">${esc(r.symbol)}</span></a>`
        ).join('')}</div></div></div>`
      : '';

    const detailContent = isFree
      ? `<div class="detail">${esc(analysis.detail)}</div>`
      : `<div class="paywall"><div class="detail">${esc(truncate(analysis.detail, 300))}</div></div>
         <div class="cta-box">
           <h3>Analizin tamamını görmek için üye ol</h3>
           <p>Bu analiz <strong>${analysis.plan === 'pro' ? 'Yatırımcı' : 'Profesyonel'}</strong> plan üyelerine açıktır. Risk seviyeleri, hedef fiyatlar ve strateji detaylarını görüntüle.</p>
           <a href="${SITE_URL}#pricing" class="cta-btn">Planları İncele →</a>
         </div>`;

    const body = `
<div class="hero"><div class="container">
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    <span class="badge">${catIcon(analysis.category)} ${esc(analysis.category)}</span>
    <span class="badge">${esc(analysis.symbol)}</span>
    <span class="badge risk" style="color:${riskColor(analysis.risk)}">Risk: ${esc(analysis.risk)}</span>
    ${!isFree ? `<span class="badge" style="background:linear-gradient(135deg,#023e8a,#0077b6);color:#fff;border:none">${analysis.plan === 'pro' ? '🔒 Yatırımcı' : '🔒 Profesyonel'}</span>` : ''}
  </div>
  <h1>${esc(analysis.title)}</h1>
  <div class="meta">
    <span>📅 ${analysis.createdAt ? new Date(analysis.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span>
    ${analysis.author ? `<span>✍️ ${esc(analysis.author.name)}</span>` : ''}
    <span>${analysis.featured ? '⭐ Öne Çıkan' : ''}</span>
  </div>
  <div class="summary">${esc(analysis.summary)}</div>
  ${chartHtml}
  ${tagsHtml}
</div></div>
<div class="content"><div class="container">
  ${detailContent}
</div></div>
${relatedHtml}`;

    res.send(pageShell({
      title: analysis.title,
      description: analysis.summary,
      ogImage,
      ogUrl: pageUrl,
      canonical: pageUrl,
      body,
      jsonLd
    }));
  } catch (err) {
    console.error('SEO page error:', err.message);
    res.status(500).send(pageShell({
      title: 'Hata',
      description: 'Sayfa yüklenirken bir hata oluştu.',
      body: '<div class="container" style="padding:80px 0;text-align:center"><h1>Bir hata oluştu</h1><p style="color:var(--muted)">Lütfen daha sonra tekrar deneyin.</p></div>'
    }));
  }
});

// ═══════════════════════════════════════════════
// GET /p/analyses — Public analysis listing (SEO)
// ═══════════════════════════════════════════════
router.get('/analyses', async (req, res) => {
  try {
    const { category, page = 1 } = req.query;
    const take = 20;
    const skip = (Math.max(1, Number(page)) - 1) * take;
    const where = { status: 'active' };
    if (category) where.category = category;

    const [analyses, total] = await Promise.all([
      prisma.analysis.findMany({
        where,
        orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
        select: { id: true, title: true, category: true, symbol: true, summary: true, risk: true, plan: true, featured: true, createdAt: true, chartUrls: true }
      }),
      prisma.analysis.count({ where })
    ]);

    const pages = Math.ceil(total / take);
    const pageUrl = `${SITE_URL}/p/analyses${category ? '?category=' + category : ''}`;

    const cardsHtml = analyses.map(a => {
      const isFree = a.plan === 'free';
      return `<a href="/p/analysis/${a.id}" class="related-card" style="text-decoration:none">
        ${a.chartUrls && a.chartUrls[0] ? `<img src="${esc(a.chartUrls[0])}" style="width:100%;height:120px;object-fit:cover;border-radius:12px;margin-bottom:10px" loading="lazy" alt="${esc(a.title)}"/>` : ''}
        <div style="display:flex;gap:6px;margin-bottom:8px"><span class="badge" style="font-size:.75rem">${catIcon(a.category)} ${esc(a.category)}</span><span class="badge" style="font-size:.75rem">${esc(a.symbol)}</span>${!isFree ? '<span class="badge" style="font-size:.75rem;background:#023e8a;color:#fff;border:none">🔒</span>' : ''}</div>
        <h4 style="margin:0 0 6px">${esc(a.title)}</h4>
        <p>${esc(truncate(a.summary, 100))}</p>
      </a>`;
    }).join('');

    const paginationHtml = pages > 1 ? `<div style="display:flex;gap:8px;justify-content:center;margin:28px 0">${
      Array.from({ length: Math.min(pages, 10) }, (_, i) => {
        const p = i + 1;
        const active = p === Number(page);
        return `<a href="/p/analyses?page=${p}${category ? '&category=' + category : ''}" style="padding:8px 14px;border-radius:10px;border:1px solid var(--border);${active ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : 'background:var(--panel)'};font-weight:700;font-size:.9rem">${p}</a>`;
      }).join('')
    }</div>` : '';

    const body = `
<div class="hero"><div class="container">
  <h1>${category ? esc(category) + ' Analizleri' : 'Tüm Analizler'}</h1>
  <div class="meta"><span>${total} analiz</span></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
    <a href="/p/analyses" class="badge" style="${!category ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : ''}">Tümü</a>
    <a href="/p/analyses?category=Hisse" class="badge" style="${category === 'Hisse' ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : ''}">📈 Hisse</a>
    <a href="/p/analyses?category=Kripto" class="badge" style="${category === 'Kripto' ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : ''}">₿ Kripto</a>
    <a href="/p/analyses?category=Forex" class="badge" style="${category === 'Forex' ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : ''}">💱 Forex</a>
    <a href="/p/analyses?category=Emtia" class="badge" style="${category === 'Emtia' ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : ''}">🥇 Emtia</a>
  </div>
</div></div>
<div class="content"><div class="container">
  <div class="related-grid">${cardsHtml}</div>
  ${paginationHtml}
  ${!analyses.length ? '<div style="text-align:center;padding:40px 0;color:var(--muted)">Bu kategoride henüz analiz yok.</div>' : ''}
</div></div>`;

    res.send(pageShell({
      title: category ? `${category} Analizleri` : 'Analizler',
      description: `${SITE_NAME} platformundaki ${category ? category.toLowerCase() : 'tüm'} finans analizlerini incele.`,
      ogUrl: pageUrl,
      canonical: pageUrl,
      body
    }));
  } catch (err) {
    console.error('Analysis listing error:', err.message);
    res.status(500).send('Hata');
  }
});

// ═══════════════════════════════════════════════
// GET /p/blog — Blog listing (Phase 5)
// ═══════════════════════════════════════════════
router.get('/blog', async (req, res) => {
  try {
    // Blog uses featured analyses as content + static educational posts
    const featured = await prisma.analysis.findMany({
      where: { status: 'active', featured: true },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, title: true, category: true, symbol: true, summary: true, createdAt: true, chartUrls: true }
    });

    const postsHtml = featured.map(a => `
      <a href="/p/analysis/${a.id}" class="related-card" style="text-decoration:none">
        ${a.chartUrls && a.chartUrls[0] ? `<img src="${esc(a.chartUrls[0])}" style="width:100%;height:140px;object-fit:cover;border-radius:12px;margin-bottom:10px" loading="lazy"/>` : ''}
        <span class="badge" style="font-size:.75rem;margin-bottom:8px">${catIcon(a.category)} ${esc(a.category)}</span>
        <h4 style="margin:0 0 6px">${esc(a.title)}</h4>
        <p>${esc(truncate(a.summary, 120))}</p>
        <div style="font-size:.78rem;color:var(--muted);margin-top:8px">${a.createdAt ? new Date(a.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</div>
      </a>
    `).join('');

    const body = `
<div class="hero"><div class="container">
  <h1>BORSiA Blog</h1>
  <p class="summary">Piyasa analizleri, yatırım stratejileri ve finans dünyasından güncel içerikler.</p>
</div></div>
<div class="content"><div class="container">
  <div class="related-grid">${postsHtml}</div>
  ${!featured.length ? '<div style="text-align:center;padding:40px 0;color:var(--muted)">Henüz blog içeriği yok. Yakında burada olacak!</div>' : ''}
  <div class="cta-box" style="margin-top:32px">
    <h3>Analizleri kaçırma</h3>
    <p>Ücretsiz üye ol, haftalık piyasa özetleri ve yeni analizlerden haberdar ol.</p>
    <a href="${SITE_URL}" class="cta-btn">Ücretsiz Başla →</a>
  </div>
</div></div>`;

    res.send(pageShell({
      title: 'Blog — Piyasa Analizleri ve Yatırım İçerikleri',
      description: 'BORSiA Blog: Hisse, kripto, forex ve emtia analizleri, yatırım stratejileri ve piyasa yorumları.',
      ogUrl: `${SITE_URL}/p/blog`,
      canonical: `${SITE_URL}/p/blog`,
      body
    }));
  } catch (err) {
    console.error('Blog error:', err.message);
    res.status(500).send('Hata');
  }
});

// ═══════════════════════════════════════════════
// GET /sitemap.xml — Google sitemap
// ═══════════════════════════════════════════════
router.get('/sitemap.xml', async (req, res) => {
  try {
    const analyses = await prisma.analysis.findMany({
      where: { status: 'active' },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' }
    });

    const urls = [
      { loc: SITE_URL, priority: '1.0', changefreq: 'daily' },
      { loc: `${SITE_URL}/p/analyses`, priority: '0.9', changefreq: 'daily' },
      { loc: `${SITE_URL}/p/blog`, priority: '0.8', changefreq: 'weekly' },
      ...analyses.map(a => ({
        loc: `${SITE_URL}/p/analysis/${a.id}`,
        lastmod: a.updatedAt ? a.updatedAt.toISOString().slice(0, 10) : undefined,
        priority: '0.7',
        changefreq: 'weekly'
      }))
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap error:', err.message);
    res.status(500).send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

// ═══════════════════════════════════════════════
// GET /robots.txt
// ═══════════════════════════════════════════════
router.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /p/
Allow: /sitemap.xml
Disallow: /api/
Sitemap: ${SITE_URL}/sitemap.xml`);
});

module.exports = router;
