/**
 * POST /api/stars/invoice
 * Creates a Telegram Stars invoice link.
 * Body: { profile_id, stars_amount }
 * Returns: { invoice_url }
 */
import express from 'express';
import logger from '../../utils/logger.js';
import { createStarsInvoice } from '../../bot/handlers/starsHandler.js';

const router = express.Router();

// Bot instance is injected at server startup — see server.js
let _bot = null;
export function setBot(bot) { _bot = bot; }

router.post('/invoice', async (req, res) => {
  try {
    const { profile_id, stars_amount } = req.body;
    if (!profile_id) return res.status(400).json({ error: 'profile_id required' });

    const stars = parseInt(stars_amount, 10);
    if (!stars || stars < 1 || stars > 10000) {
      return res.status(400).json({ error: 'stars_amount must be 1–10000' });
    }

    if (!_bot) return res.status(503).json({ error: 'Bot not initialized' });

    const url = await createStarsInvoice(_bot, profile_id, stars);
    return res.json({ ok: true, invoice_url: url });
  } catch (err) {
    logger.error('[stars/invoice] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
