import { Router } from 'express';
import {
  handleWhatsAppWebhookPayload,
  parseWebhookStatuses,
} from '../services/whatsappWebhook.js';
import { logWhatsAppError, logWhatsAppInfo, logWhatsAppWarn } from '../services/whatsappLog.js';

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
    logWhatsAppWarn('webhook_verify_failed', { reason: 'token_mismatch' });
    return res.sendStatus(403);
  }

  if (typeof challenge !== 'string' || !challenge) {
    return res.sendStatus(400);
  }

  logWhatsAppInfo('webhook_verified');
  return res.status(200).send(challenge);
});

router.post('/', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (!body || typeof body !== 'object') {
    logWhatsAppWarn('webhook_empty_body');
    return;
  }

  const statusUpdates = parseWebhookStatuses(body);
  logWhatsAppInfo('webhook_post_received', {
    statusCount: statusUpdates.length,
    messageIds: statusUpdates.map((u) => u.messageId),
    statuses: statusUpdates.map((u) => ({ messageId: u.messageId, status: u.status })),
  });

  try {
    await handleWhatsAppWebhookPayload(body);
  } catch (err) {
    logWhatsAppError('webhook_handler_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
