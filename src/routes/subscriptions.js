// ═══════════════════════════════════════════════
// BORSiA — Subscriptions Routes (Stripe)
// ═══════════════════════════════════════════════

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Stripe lazy init (sadece key varsa)
let stripe = null;
function getStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

// ─── PRICE MAP ───
function getPriceId(plan, billing) {
  const map = {
    'pro-monthly': process.env.STRIPE_PRO_PRICE_ID,
    'pro-yearly': process.env.STRIPE_PRO_YEARLY_PRICE_ID,
    'premium-monthly': process.env.STRIPE_PREMIUM_PRICE_ID,
    'premium-yearly': process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID
  };
  return map[`${plan}-${billing}`];
}

// ─── POST /api/subscriptions/checkout ───
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const s = getStripe();
    if (!s) {
      return res.status(503).json({ error: 'Ödeme sistemi henüz yapılandırılmamış.' });
    }

    const { plan, billing = 'monthly' } = req.body;
    if (!['pro', 'premium'].includes(plan)) {
      return res.status(400).json({ error: 'Geçersiz plan.' });
    }

    const priceId = getPriceId(plan, billing);
    if (!priceId) {
      return res.status(400).json({ error: 'Bu plan/ödeme döngüsü için fiyat tanımlı değil.' });
    }

    // Stripe customer bul veya oluştur
    let subscription = await prisma.subscription.findUnique({
      where: { userId: req.user.id }
    });

    let customerId = subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await s.customers.create({
        email: req.user.email,
        name: req.user.name,
        metadata: { borsiaUserId: req.user.id }
      });
      customerId = customer.id;
    }

    // Checkout session oluştur
    const session = await s.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}?subscription=success&plan=${plan}`,
      cancel_url: `${process.env.FRONTEND_URL}?subscription=canceled`,
      metadata: {
        borsiaUserId: req.user.id,
        plan,
        billing
      }
    });

    // Subscription kaydını oluştur/güncelle
    await prisma.subscription.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        stripeCustomerId: customerId,
        plan: 'free',
        status: 'incomplete'
      },
      update: {
        stripeCustomerId: customerId
      }
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout hatası:', err.message);
    res.status(500).json({ error: 'Ödeme oturumu oluşturulamadı.' });
  }
});

// ─── GET /api/subscriptions/status ───
router.get('/status', requireAuth, async (req, res) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user.id }
    });

    if (!subscription) {
      return res.json({
        plan: req.user.plan,
        status: 'active',
        hasSubscription: false
      });
    }

    res.json({
      plan: subscription.plan,
      status: subscription.status,
      hasSubscription: true,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
    });
  } catch (err) {
    console.error('Subscription status hatası:', err.message);
    res.status(500).json({ error: 'Abonelik durumu alınamadı.' });
  }
});

// ─── POST /api/subscriptions/cancel ───
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const s = getStripe();
    if (!s) return res.status(503).json({ error: 'Ödeme sistemi yapılandırılmamış.' });

    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user.id }
    });

    if (!subscription?.stripeSubscriptionId) {
      return res.status(404).json({ error: 'Aktif abonelik bulunamadı.' });
    }

    // Dönem sonunda iptal et
    await s.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    await prisma.subscription.update({
      where: { userId: req.user.id },
      data: { cancelAtPeriodEnd: true }
    });

    res.json({ message: 'Abonelik dönem sonunda iptal edilecek.' });
  } catch (err) {
    console.error('Cancel hatası:', err.message);
    res.status(500).json({ error: 'İptal işlemi gerçekleştirilemedi.' });
  }
});

// ─── STRIPE WEBHOOK HANDLER ───
// Bu fonksiyon server.js'de raw body ile mount edilir
async function webhookHandler(req, res) {
  try {
    const s = getStripe();
    if (!s) return res.status(503).send('Stripe yapılandırılmamış');

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = s.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('Webhook signature doğrulama hatası:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Event handling
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.borsiaUserId;
        const plan = session.metadata?.plan;
        if (userId && plan) {
          await activateSubscription(userId, plan, session.subscription, session.customer);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        await syncSubscription(sub);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await deactivateSubscription(sub);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const sub = invoice.subscription;
        if (sub) {
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: String(sub) },
            data: { status: 'past_due' }
          });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook hatası:', err.message);
    res.status(500).json({ error: 'Webhook işlenemedi.' });
  }
}

// ─── HELPERS ───
async function activateSubscription(userId, plan, stripeSubId, stripeCustomerId) {
  const stripeSub = getStripe() ? await getStripe().subscriptions.retrieve(stripeSubId) : null;

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeCustomerId: String(stripeCustomerId),
      stripeSubscriptionId: String(stripeSubId),
      plan,
      status: 'active',
      currentPeriodStart: stripeSub ? new Date(stripeSub.current_period_start * 1000) : new Date(),
      currentPeriodEnd: stripeSub ? new Date(stripeSub.current_period_end * 1000) : null
    },
    update: {
      stripeSubscriptionId: String(stripeSubId),
      stripeCustomerId: String(stripeCustomerId),
      plan,
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: stripeSub ? new Date(stripeSub.current_period_start * 1000) : new Date(),
      currentPeriodEnd: stripeSub ? new Date(stripeSub.current_period_end * 1000) : null
    }
  });

  // User plan güncelle
  await prisma.user.update({
    where: { id: userId },
    data: { plan }
  });

  console.log(`✅ Abonelik aktif: user=${userId} plan=${plan}`);
}

async function syncSubscription(stripeSub) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: stripeSub.id },
    data: {
      status: stripeSub.status,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000)
    }
  });
}

async function deactivateSubscription(stripeSub) {
  const sub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSub.id }
  });
  if (!sub) return;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'canceled', cancelAtPeriodEnd: false }
  });

  // Kullanıcıyı free'ye düşür
  await prisma.user.update({
    where: { id: sub.userId },
    data: { plan: 'free' }
  });

  console.log(`⚠️ Abonelik iptal edildi: user=${sub.userId}`);
}

module.exports = { router, webhookHandler };
