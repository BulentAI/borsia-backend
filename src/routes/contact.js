// ═══════════════════════════════════════════════
// BORSiA — Contact Routes
// ═══════════════════════════════════════════════

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { validate, contactSchema } = require('../utils/validators');

const router = express.Router();
const prisma = new PrismaClient();

// ─── POST /api/contact ───
router.post('/', validate(contactSchema), async (req, res) => {
  try {
    const { name, email, message } = req.validated;

    const contact = await prisma.contactMessage.create({
      data: { name, email, message }
    });

    res.status(201).json({
      message: 'Mesajınız alındı. En kısa sürede dönüş yapılacaktır.',
      id: contact.id
    });
  } catch (err) {
    console.error('Contact hatası:', err.message);
    res.status(500).json({ error: 'Mesaj gönderilemedi.' });
  }
});

module.exports = router;
