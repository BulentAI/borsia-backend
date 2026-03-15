// ═══════════════════════════════════════════════
// BORSiA — Zod Validation Schemas
// ═══════════════════════════════════════════════

const { z } = require('zod');

// ─── AUTH ───

const registerSchema = z.object({
  name: z.string().min(2, 'İsim en az 2 karakter olmalı').max(100),
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string()
    .min(6, 'Şifre en az 6 karakter olmalı')
    .max(128)
});

const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Şifre gerekli')
});

// ─── ANALYSES ───

const createAnalysisSchema = z.object({
  title: z.string().min(3, 'Başlık en az 3 karakter').max(200),
  category: z.string().min(1, 'Kategori gerekli'),
  symbol: z.string().min(1, 'Sembol gerekli').max(20),
  summary: z.string().min(10, 'Özet en az 10 karakter'),
  detail: z.string().min(20, 'Detay en az 20 karakter'),
  risk: z.string().optional().default('Orta'),
  plan: z.enum(['free', 'pro', 'premium']).optional().default('free'),
  status: z.enum(['active', 'archived']).optional().default('active'),
  featured: z.boolean().optional().default(false),
  subcategory: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  chartUrls: z.array(z.string().url()).optional().default([])
});

const updateAnalysisSchema = createAnalysisSchema.partial();

// ─── CONTACT ───

const contactSchema = z.object({
  name: z.string().min(2, 'İsim en az 2 karakter').max(100),
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  message: z.string().min(10, 'Mesaj en az 10 karakter').max(5000)
});

// ─── AI ───

const aiChatSchema = z.object({
  message: z.string().min(1, 'Mesaj gerekli').max(2000),
  context: z.any().optional()
});

const aiGenerateSchema = z.object({
  symbol: z.string().min(1, 'Sembol gerekli'),
  category: z.string().optional().default('Genel'),
  prompt: z.string().optional().default(''),
  context: z.any().optional()
});

const aiExpandSchema = z.object({
  analysisId: z.string().optional(),
  content: z.string().min(1, 'İçerik gerekli'),
  mode: z.string().optional().default('expand'),
  prompt: z.string().optional().default('')
});

// ─── SUBSCRIPTION ───

const checkoutSchema = z.object({
  plan: z.enum(['pro', 'premium']),
  billing: z.enum(['monthly', 'yearly']).optional().default('monthly')
});

// ─── USER UPDATE (admin) ───

const updateUserSchema = z.object({
  plan: z.enum(['free', 'pro', 'premium']).optional(),
  role: z.enum(['user', 'admin']).optional(),
  name: z.string().min(2).max(100).optional()
});

// ─── VALIDATOR MIDDLEWARE ───

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }));
      return res.status(400).json({ error: 'Doğrulama hatası', details: errors });
    }
    req.validated = result.data;
    next();
  };
}

module.exports = {
  registerSchema, loginSchema,
  createAnalysisSchema, updateAnalysisSchema,
  contactSchema,
  aiChatSchema, aiGenerateSchema, aiExpandSchema,
  checkoutSchema, updateUserSchema,
  validate
};
