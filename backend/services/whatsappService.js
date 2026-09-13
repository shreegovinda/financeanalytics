const crypto = require('crypto');

// Environment variables
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v19.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';
const WHATSAPP_WEBHOOK_VERIFY_TOKEN =
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'finlytix_wa_verify_secret';

// In-memory message store for local simulation & testing
const simulatedMessages = [];

/**
 * Standardize phone number to digits only with country code (e.g. 919876543210)
 */
function normalizePhoneNumber(rawPhone) {
  if (!rawPhone) return '';
  let digits = String(rawPhone).replace(/[^\d]/g, '');
  // Default to 91 (India) if 10 digits provided
  if (digits.length === 10) {
    digits = '91' + digits;
  }
  return digits;
}

/**
 * Format standard markdown to WhatsApp chat markdown
 * - **bold** -> *bold*
 * - __italic__ -> _italic_
 * - `code` -> ```code``` or `code`
 */
function formatForWhatsApp(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*') // Bold
    .replace(/__(.*?)__/g, '_$1_') // Italic
    .replace(/### (.*?)\n/g, '*$1*\n') // Heading 3
    .replace(/## (.*?)\n/g, '*$1*\n') // Heading 2
    .replace(/# (.*?)\n/g, '*$1*\n'); // Heading 1
}

/**
 * Validates Meta X-Hub-Signature-256 header against the raw body buffer
 */
function verifyWebhookSignature(rawBody, signatureHeader, secret = WHATSAPP_APP_SECRET) {
  if (!secret) return true; // Bypass in dev if secret not configured
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = signatureHeader.substring(7);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const actualSignature = hmac.digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(actualSignature, 'hex'),
    );
  } catch {
    return false;
  }
}

/**
 * Send text message via WhatsApp Cloud API or simulation transport
 */
async function sendTextMessage(toPhone, text) {
  const normalizedPhone = normalizePhoneNumber(toPhone);
  const formattedText = formatForWhatsApp(text);

  // If credentials are not set or in test environment, simulate sending
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN || process.env.NODE_ENV === 'test') {
    const messageRecord = {
      to: normalizedPhone,
      text: formattedText,
      type: 'text',
      timestamp: new Date().toISOString(),
      id: 'sim_msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    };
    simulatedMessages.push(messageRecord);
    return { success: true, simulated: true, messageId: messageRecord.id };
  }

  const endpoint = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'text',
      text: { body: formattedText },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`❌ Meta WhatsApp API error [${response.status}]:`, errorBody);
    throw new Error(`WhatsApp API error: ${response.status} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Send interactive button options (e.g. Confirm Draft, Discard)
 * @param {string} toPhone
 * @param {string} bodyText
 * @param {Array<{ id: string, title: string }>} buttons (max 3 buttons)
 */
async function sendInteractiveButtons(toPhone, bodyText, buttons = []) {
  const normalizedPhone = normalizePhoneNumber(toPhone);
  const formattedBody = formatForWhatsApp(bodyText);

  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN || process.env.NODE_ENV === 'test') {
    const messageRecord = {
      to: normalizedPhone,
      body: formattedBody,
      buttons,
      type: 'interactive_button',
      timestamp: new Date().toISOString(),
      id: 'sim_btn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    };
    simulatedMessages.push(messageRecord);
    return { success: true, simulated: true, messageId: messageRecord.id };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedPhone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: formattedBody },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: {
            id: b.id,
            title: b.title.slice(0, 20), // WhatsApp button title limit: 20 chars
          },
        })),
      },
    },
  };

  const endpoint = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`❌ WhatsApp interactive button error [${response.status}]:`, errorBody);
    throw new Error(`WhatsApp API error: ${response.status} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Send authentication code / magic link via WhatsApp
 */
async function sendOtpTemplate(toPhone, otpCode, magicLink = '') {
  const messageBody =
    `🔒 *Finlytix Security Code*: *${otpCode}*\n\n` +
    `Valid for 5 minutes. Never share this code with anyone.\n` +
    (magicLink ? `\n👉 Tap here to login instantly:\n${magicLink}` : '');

  return sendTextMessage(toPhone, messageBody);
}

/**
 * Downloads binary media from WhatsApp Cloud API using media ID
 */
async function downloadMedia(mediaId) {
  if (!mediaId) throw new Error('Missing WhatsApp mediaId');

  // If mock media requested or running in test without token, return mock PDF buffer
  if (mediaId.startsWith('mock_media_') || process.env.NODE_ENV === 'test') {
    return {
      buffer: Buffer.from('%PDF-1.4 Mock statement file content for testing'),
      mimeType: 'application/pdf',
      fileSize: 45,
    };
  }

  if (!WHATSAPP_ACCESS_TOKEN) {
    throw new Error('WHATSAPP_ACCESS_TOKEN not configured for media download');
  }

  // Step 1: Query Graph API to get the media download URL
  const metaUrl = `${WHATSAPP_API_URL}/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to retrieve media URL: ${metaRes.status}`);
  }

  const metaData = await metaRes.json();
  const downloadUrl = metaData.url;
  const mimeType = metaData.mime_type || 'application/octet-stream';
  const fileSize = metaData.file_size || 0;

  // Step 2: Download binary data
  const binaryRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
  });

  if (!binaryRes.ok) {
    throw new Error(`Failed to download binary media: ${binaryRes.status}`);
  }

  const arrayBuffer = await binaryRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType,
    fileSize,
  };
}

module.exports = {
  normalizePhoneNumber,
  formatForWhatsApp,
  verifyWebhookSignature,
  sendTextMessage,
  sendInteractiveButtons,
  sendOtpTemplate,
  downloadMedia,
  simulatedMessages,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN,
};
