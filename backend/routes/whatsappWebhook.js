const express = require('express');
const {
  verifyWebhookSignature,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  normalizePhoneNumber,
  simulatedMessages,
} = require('../services/whatsappService');
const { handleWhatsAppChatMessage } = require('../services/whatsappChatHandler');
const {
  handleWhatsAppDocumentUpload,
  handleWhatsAppInteractiveReply,
} = require('../services/whatsappUploadHandler');

const router = express.Router();

/**
 * WhatsApp Integration Status & Diagnostics (GET /api/whatsapp/status)
 */
router.get('/status', (req, res) => {
  const isConfigured = Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN,
  );
  res.json({
    mode: isConfigured ? 'live' : 'simulation',
    configured: isConfigured,
    phoneNumberIdConfigured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    accessTokenConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    appSecretConfigured: Boolean(process.env.WHATSAPP_APP_SECRET),
    webhookVerifyToken: WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    simulatedMessagesCount: simulatedMessages.length,
    latestSimulatedMessage:
      simulatedMessages.length > 0 ? simulatedMessages[simulatedMessages.length - 1] : null,
    setupGuide: !isConfigured
      ? {
          step1:
            'Register a Meta Developer account at https://developers.facebook.com and create a Business App',
          step2: 'Add WhatsApp product to your App',
          step3: 'In WhatsApp -> API Setup, copy Phone Number ID and Access Token',
          step4: 'Add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to backend/.env.local',
          step5:
            'Add your test mobile number to the "To" allowlist in Meta WhatsApp API Setup to permit sending',
        }
      : undefined,
  });
});

/**
 * WhatsApp Simulated Messages (GET /api/whatsapp/simulated) - for local testing
 */
router.get('/simulated', (req, res) => {
  res.json({
    count: simulatedMessages.length,
    messages: simulatedMessages.slice(-20),
  });
});

/**
 * Meta WhatsApp Cloud API Webhook Challenge Verification (GET)
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ WhatsApp Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn('❌ WhatsApp Webhook verification failed: token mismatch');
  return res.status(403).json({ error: 'Verification token mismatch' });
});

/**
 * Meta WhatsApp Cloud API & Twilio Inbound Webhook (POST)
 */
router.post('/webhook', async (req, res) => {
  // 1. Signature validation for Meta Webhooks — missing or unsigned requests are rejected
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('❌ Invalid WhatsApp webhook signature rejected');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  // Acknowledge receipt immediately so WhatsApp/Twilio doesn't time out or retry
  res.status(200).json({ status: 'ok' });

  try {
    const body = req.body;

    // Mode A: Meta WhatsApp Cloud API payload format
    if (body.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (!Array.isArray(entry.changes)) continue;

        for (const change of entry.changes) {
          const value = change.value;
          if (!value || !Array.isArray(value.messages)) continue;

          for (const msg of value.messages) {
            const fromPhone = normalizePhoneNumber(msg.from);
            const messageId = msg.id;

            if (msg.type === 'text') {
              const text = msg.text?.body;
              void handleWhatsAppChatMessage(fromPhone, text, messageId);
            } else if (msg.type === 'document') {
              void handleWhatsAppDocumentUpload(fromPhone, msg.document, messageId);
            } else if (msg.type === 'interactive') {
              const replyId = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id;
              void handleWhatsAppInteractiveReply(fromPhone, replyId, messageId);
            }
          }
        }
      }
      return;
    }

    // Mode B: Twilio Inbound WhatsApp payload format
    if (body.From && typeof body.From === 'string' && body.From.startsWith('whatsapp:')) {
      const fromPhone = normalizePhoneNumber(body.From.replace('whatsapp:', ''));
      const bodyText = body.Body || '';
      const numMedia = parseInt(body.NumMedia || '0', 10);

      if (numMedia > 0 && body.MediaUrl0) {
        // Document attached via Twilio
        const docObj = {
          id: body.MessageSid,
          filename: body.MediaContentType0?.includes('pdf') ? 'statement.pdf' : 'statement.xlsx',
          caption: bodyText,
        };
        void handleWhatsAppDocumentUpload(fromPhone, docObj, body.MessageSid);
      } else if (bodyText) {
        // Text message
        void handleWhatsAppChatMessage(fromPhone, bodyText, body.MessageSid);
      }
    }
  } catch (err) {
    console.error('❌ Error processing WhatsApp webhook payload:', err);
  }
});

module.exports = router;
