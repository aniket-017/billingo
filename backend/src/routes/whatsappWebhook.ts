import { Router } from 'express';
import { handleWhatsAppWebhookPayload } from '../services/whatsappWebhook.js';

const router = Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe') {
    return res.sendStatus(403);
  }

  if (!VERIFY_TOKEN || token !== VERIFY_TOKEN) {
    console.warn('WhatsApp webhook verification failed: token mismatch');
    return res.sendStatus(403);
  }

  if (typeof challenge !== 'string' || !challenge) {
    return res.sendStatus(400);
  }

  console.log('WhatsApp webhook verified');
  return res.status(200).send(challenge);
});

router.post('/', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (!body || typeof body !== 'object') return;

  try {
    await handleWhatsAppWebhookPayload(body);
  } catch (err) {
    console.error('WhatsApp webhook handler error:', err);
  }
});

export default router;
