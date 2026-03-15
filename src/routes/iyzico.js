// ═══════════════════════════════════════════════
// BORSiA — iyzico Payment Routes (Turkey)
// ═══════════════════════════════════════════════

const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── iyzico CONFIG ───
const IYZICO_API_KEY = process.env.IYZICO_API_KEY || '';
const IYZICO_SECRET_KEY = process.env.IYZICO_SECRET_KEY || '';
const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'; // sandbox for testing
const SITE_URL = process.env.FRONTEND_URL || 'http://localhost:5500';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// ─── PLAN PRICES (TL) ───
const PLAN_PRICES = {
  'pro-monthly': { name: 'Yatırımcı Aylık', price: '599.00', plan: 'pro' },
  'pro-yearly': { name: 'Yatırımcı Yıllık', price: '5750.00', plan: 'pro' },
  'premium-monthly': { name: 'Profesyonel Aylık', price: '899.00', plan: 'premium' },
  'premium-yearly': { name: 'Profesyonel Yıllık', price: '8630.00', plan: 'premium' }
};

// ─── iyzico AUTH HELPERS ───
function generateAuthorizationHeader(uri, body) {
  const randomString = Date.now().toString() + Math.random().toString(36).slice(2);
  const payload = randomString + uri + (body || '');
  const signature = crypto
    .createHmac('sha256', IYZICO_SECRET_KEY)
    .update(payload)
    .digest('hex');
  const authorizationParams = [
    'apiKey:' + IYZICO_API_KEY,
    'randomHeaderValue:' + randomString,
    'signature:' + signature
  ].join('&');
  return 'IYZWS ' + Buffer.from(authorizationParams).toString('base64');
}

async function iyzicoRequest(path, body) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const uri = '/payment' + path;
  const authorization = generateAuthorizationHeader(uri, bodyStr);

  const response = await fetch(IYZICO_BASE_URL + uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authorization,
      'x-iyzi-rnd': Date.now().toString(),
    },
    body: bodyStr || undefined
  });

  return response.json();
}

function generateConversationId() {
  return 'borsia_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// ═══════════════════════════════════════════════
// POST /api/subscriptions/checkout — iyzico checkout form oluştur
// ═══════════════════════════════════════════════
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    if (!IYZICO_API_KEY || !IYZICO_SECRET_KEY) {
      return res.status(503).json({
        error: 'Ödeme sistemi henüz yapılandırılmamış.',
        demo: true,
        message: 'iyzico API anahtarları .env dosyasına eklenmeli.'
      });
    }

    const { plan, billing = 'monthly' } = req.body;
    if (!['pro', 'premium'].includes(plan)) {
      return res.status(400).json({ error: 'Geçersiz plan.' });
    }

    const priceKey = `${plan}-${billing}`;
    const planInfo = PLAN_PRICES[priceKey];
    if (!planInfo) {
      return res.status(400).json({ error: 'Bu plan/dönem kombinasyonu bulunamadı.' });
    }

    const conversationId = generateConversationId();

    // Subscription kaydı oluştur/güncelle
    await prisma.subscription.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        plan: 'free',
        status: 'incomplete'
      },
      update: {}
    });

    // iyzico Checkout Form oluştur
    const checkoutRequest = {
      locale: 'tr',
      conversationId: conversationId,
      price: planInfo.price,
      paidPrice: planInfo.price,
      currency: 'TRY',
      basketId: 'borsia_' + priceKey + '_' + req.user.id,
      paymentGroup: 'SUBSCRIPTION',
      callbackUrl: BACKEND_URL + '/api/subscriptions/callback?userId=' + req.user.id + '&plan=' + plan + '&conversationId=' + conversationId,
      enabledInstallments: [1],
      buyer: {
        id: req.user.id,
        name: req.user.name.split(' ')[0] || 'Kullanıcı',
        surname: req.user.name.split(' ').slice(1).join(' ') || 'BORSiA',
        email: req.user.email,
        identityNumber: '00000000000', // Test için
        registrationAddress: 'Türkiye',
        ip: req.ip || '127.0.0.1',
        city: 'Istanbul',
        country: 'Turkey'
      },
      shippingAddress: {
        contactName: req.user.name,
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Türkiye'
      },
      billingAddress: {
        contactName: req.user.name,
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Türkiye'
      },
      basketItems: [
        {
          id: priceKey,
          name: planInfo.name,
          category1: 'Abonelik',
          category2: 'SaaS',
          itemType: 'VIRTUAL',
          price: planInfo.price
        }
      ]
    };

    const result = await iyzicoRequest('/iyzipos/checkoutform/initialize/auth/ecom', checkoutRequest);

    if (result.status === 'success' && result.paymentPageUrl) {
      res.json({
        checkoutUrl: result.paymentPageUrl,
        token: result.token,
        conversationId: conversationId
      });
    } else {
      console.error('iyzico checkout error:', result);
      res.status(400).json({
        error: result.errorMessage || 'Ödeme formu oluşturulamadı.',
        errorCode: result.errorCode,
        demo: false
      });
    }
  } catch (err) {
    console.error('Checkout hatası:', err.message);
    res.status(500).json({ error: 'Ödeme oturumu oluşturulamadı.' });
  }
});

// ═══════════════════════════════════════════════
// POST /api/subscriptions/callback — iyzico payment callback
// ═══════════════════════════════════════════════
router.post('/callback', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { token } = req.body;
    const { userId, plan, conversationId } = req.query;

    if (!token || !userId || !plan) {
      return res.redirect(SITE_URL + '?subscription=error&reason=missing_params');
    }

    // Ödeme sonucunu iyzico'dan doğrula
    const verifyResult = await iyzicoRequest('/iyzipos/checkoutform/auth/ecom/detail', {
      locale: 'tr',
      conversationId: conversationId || '',
      token: token
    });

    if (verifyResult.status === 'success' && verifyResult.paymentStatus === 'SUCCESS') {
      // Abonelik aktif et
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + (plan.includes('yearly') ? 12 : 1));

      await prisma.subscription.upsert({
        where: { userId: userId },
        create: {
          userId: userId,
          plan: plan,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          stripeCustomerId: verifyResult.paymentId || null, // iyzico payment ID
          stripeSubscriptionId: verifyResult.token || null
        },
        update: {
          plan: plan,
          status: 'active',
          cancelAtPeriodEnd: false,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          stripeCustomerId: verifyResult.paymentId || null,
          stripeSubscriptionId: verifyResult.token || null
        }
      });

      // Kullanıcı planını güncelle
      await prisma.user.update({
        where: { id: userId },
        data: { plan: plan }
      });

      console.log(`✅ iyzico ödeme başarılı: user=${userId} plan=${plan} paymentId=${verifyResult.paymentId}`);
      return res.redirect(SITE_URL + '?subscription=success&plan=' + plan);
    } else {
      console.error('iyzico ödeme doğrulama başarısız:', verifyResult);
      return res.redirect(SITE_URL + '?subscription=error&reason=' + encodeURIComponent(verifyResult.errorMessage || 'payment_failed'));
    }
  } catch (err) {
    console.error('Callback hatası:', err.message);
    return res.redirect(SITE_URL + '?subscription=error&reason=server_error');
  }
});

// ═══════════════════════════════════════════════
// GET /api/subscriptions/status
// ═══════════════════════════════════════════════
router.get('/status', requireAuth, async (req, res) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user.id }
    });

    if (!subscription) {
      return res.json({
        plan: req.user.plan,
        status: 'active',
        hasSubscription: false,
        provider: 'iyzico'
      });
    }

    res.json({
      plan: subscription.plan,
      status: subscription.status,
      hasSubscription: true,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      provider: 'iyzico'
    });
  } catch (err) {
    console.error('Subscription status hatası:', err.message);
    res.status(500).json({ error: 'Abonelik durumu alınamadı.' });
  }
});

// ═══════════════════════════════════════════════
// POST /api/subscriptions/cancel
// ═══════════════════════════════════════════════
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user.id }
    });

    if (!subscription || subscription.status !== 'active') {
      return res.status(404).json({ error: 'Aktif abonelik bulunamadı.' });
    }

    // Dönem sonunda iptal et (iyzico'da otomatik yenileme iptal)
    await prisma.subscription.update({
      where: { userId: req.user.id },
      data: { cancelAtPeriodEnd: true }
    });

    res.json({
      message: 'Abonelik dönem sonunda iptal edilecek.',
      currentPeriodEnd: subscription.currentPeriodEnd
    });
  } catch (err) {
    console.error('Cancel hatası:', err.message);
    res.status(500).json({ error: 'İptal işlemi gerçekleştirilemedi.' });
  }
});

module.exports = router;
