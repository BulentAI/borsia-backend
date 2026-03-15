// ═══════════════════════════════════════════════
// BORSiA — AI Routes (LM Studio Proxy)
// ═══════════════════════════════════════════════

const express = require('express');
const fetch = require('node-fetch');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter, getAIUsageInfo } = require('../middleware/aiLimiter');
const { validate, aiChatSchema, aiGenerateSchema, aiExpandSchema } = require('../utils/validators');

const router = express.Router();
const prisma = new PrismaClient();

const LM_STUDIO_URL = process.env.GROQ_API_KEY
  ? 'https://api.groq.com/openai'
  : (process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

// ─── HELPER: AI'ya istek gönder (Groq veya LM Studio) ───
async function queryLMStudio(messages, options = {}) {
  const isGroq = Boolean(GROQ_API_KEY);
  const baseUrl = isGroq ? 'https://api.groq.com/openai' : LM_STUDIO_URL;
  const headers = { 'Content-Type': 'application/json' };
  if (isGroq) headers['Authorization'] = `Bearer ${GROQ_API_KEY}`;

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: options.model || AI_MODEL,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2048,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`AI HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    model: data.model || AI_MODEL,
    usage: data.usage || {},
    provider: isGroq ? 'groq' : 'lm-studio'
  };
}

// ─── POST /api/ai/chat ───
router.post('/chat', requireAuth, aiLimiter, validate(aiChatSchema), async (req, res) => {
  try {
    const { message, context } = req.validated;

    const systemPrompt = `Sen BORSiA platformunun AI Finans asistanısın. Türkçe yanıt ver. 
Kullanıcıya finansal piyasalar, teknik analiz, temel analiz, risk yönetimi ve yatırım stratejileri konusunda yardımcı ol.
Kesin yatırım tavsiyesi verme, bunun yerine eğitici ve bilgilendirici ol. 
Yanıtların özlü, profesyonel ve aksiyon odaklı olsun.`;

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Opsiyonel bağlam (varlık verisi vs.)
    if (context) {
      messages.push({ role: 'system', content: `Bağlam bilgisi: ${JSON.stringify(context)}` });
    }

    messages.push({ role: 'user', content: message });

    const result = await queryLMStudio(messages);

    // Son prompt'u kaydet
    await saveRecentPrompt(req.user.id, message);

    res.json({
      reply: result.content,
      model: result.model,
      provider: result.provider || 'groq',
      live: true
    });
  } catch (err) {
    console.error('AI Chat hatası:', err.message);

    // Fallback yanıt
    res.json({
      reply: 'AI servisi şu anda yanıt veremiyor. LM Studio bağlantısını kontrol edin. Kısa süre sonra tekrar deneyin.',
      model: 'fallback',
      provider: 'fallback',
      live: false
    });
  }
});

// ─── POST /api/ai/generate-analysis ───
router.post('/generate-analysis', requireAuth, aiLimiter, validate(aiGenerateSchema), async (req, res) => {
  try {
    const { symbol, category, prompt, context } = req.validated;

    const systemPrompt = `Sen BORSiA platformu için profesyonel finans analizi üreten bir AI'sın. Türkçe yaz.
Analiz çıktın şu JSON formatında olmalı:
{
  "title": "Analiz başlığı",
  "category": "Kategori",
  "symbol": "SEMBOL",
  "summary": "Kısa özet (2-3 cümle)",
  "detail": "Detaylı analiz (en az 3 paragraf)",
  "risk": "Düşük/Orta/Yüksek",
  "plan": "Teknik görünüm ve strateji",
  "subcategory": "Alt kategori",
  "tags": ["etiket1", "etiket2"]
}
Sadece JSON döndür, başka bir şey yazma.`;

    const userMsg = [
      `${symbol} için ${category} kategorisinde analiz üret.`,
      prompt ? `Ek yönlendirme: ${prompt}` : '',
      context ? `Mevcut bağlam: ${JSON.stringify(context)}` : ''
    ].filter(Boolean).join('\n');

    const result = await queryLMStudio([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ], { temperature: 0.6, max_tokens: 3000 });

    // JSON parse dene
    let analysis = null;
    let preview = result.content;
    try {
      const cleaned = result.content.replace(/```json\s*|```/g, '').trim();
      analysis = JSON.parse(cleaned);
      // Zorunlu alanları garanti et
      analysis.symbol = analysis.symbol || symbol;
      analysis.category = analysis.category || category;
    } catch {
      // JSON parse başarısız — raw text olarak dön
      analysis = null;
    }

    res.json({
      analysis,
      preview,
      model: result.model,
      provider: analysis ? 'lm-studio' : 'lm-studio-raw',
      live: true,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('AI Generate hatası:', err.message);
    res.json({
      analysis: null,
      preview: 'AI analiz üretimi şu anda yapılamıyor. LM Studio bağlantısını kontrol edin.',
      model: 'fallback',
      provider: 'fallback',
      live: false,
      createdAt: new Date().toISOString()
    });
  }
});

// ─── POST /api/ai/expand-analysis ───
router.post('/expand-analysis', requireAuth, aiLimiter, validate(aiExpandSchema), async (req, res) => {
  try {
    const { content, mode, prompt } = req.validated;

    const modeInstructions = {
      expand: 'Bu analizi daha detaylı genişlet. Teknik seviyeler, risk noktaları ve alternatif senaryolar ekle.',
      risk: 'Bu analiz için kapsamlı bir risk değerlendirmesi yap. Stop-loss, destek/direnç ve risk/ödül oranlarını belirle.',
      scenario: 'Bu analiz için en az 3 alternatif senaryo oluştur: boğa, ayı ve nötr senaryoları detaylandır.',
      action: 'Bu analize dayalı aksiyon planı oluştur. Giriş noktaları, çıkış stratejisi ve izleme planını belirle.'
    };

    const systemPrompt = `Sen BORSiA platformunun analiz geliştirme asistanısın. Türkçe yaz. Profesyonel, özlü ve aksiyon odaklı ol.
${modeInstructions[mode] || modeInstructions.expand}
${prompt ? `Ek yönlendirme: ${prompt}` : ''}`;

    const result = await queryLMStudio([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Şu analizi geliştir:\n\n${content}` }
    ], { temperature: 0.6, max_tokens: 3000 });

    res.json({
      expanded: result.content,
      mode,
      model: result.model,
      provider: result.provider || 'groq',
      live: true
    });
  } catch (err) {
    console.error('AI Expand hatası:', err.message);
    res.json({
      expanded: 'AI genişletme şu anda yapılamıyor. LM Studio bağlantısını kontrol edin.',
      mode: req.body?.mode || 'expand',
      model: 'fallback',
      provider: 'fallback',
      live: false
    });
  }
});

// ─── GET /api/ai/usage ───
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const info = await getAIUsageInfo(req.user.id, req.user.plan);
    res.json(info);
  } catch (err) {
    console.error('AI Usage hatası:', err.message);
    res.status(500).json({ error: 'AI kullanım bilgisi alınamadı.' });
  }
});

// ─── GET /api/ai/recent-prompts ───
router.get('/recent-prompts', requireAuth, async (req, res) => {
  try {
    const prompts = await prisma.aIRecentPrompt.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, prompt: true, createdAt: true }
    });

    res.json({ prompts });
  } catch (err) {
    console.error('Recent prompts hatası:', err.message);
    res.json({ prompts: [] });
  }
});

// ─── HELPER: Son prompt kaydet ───
async function saveRecentPrompt(userId, prompt) {
  try {
    const clean = String(prompt || '').trim();
    if (!clean || clean.length < 3) return;

    // Aynı prompt varsa sil
    await prisma.aIRecentPrompt.deleteMany({
      where: { userId, prompt: clean }
    });

    // Yeni ekle
    await prisma.aIRecentPrompt.create({
      data: { userId, prompt: clean }
    });

    // Maksimum 6 tut
    const all = await prisma.aIRecentPrompt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: 6
    });
    if (all.length > 0) {
      await prisma.aIRecentPrompt.deleteMany({
        where: { id: { in: all.map(p => p.id) } }
      });
    }
  } catch (err) {
    console.error('Recent prompt kayıt hatası:', err.message);
  }
}

module.exports = router;
