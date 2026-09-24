const { resolveUseCase } = require('./aiUseCases');
const pool = require('../config/db');
const { answerQuestion } = require('./chat');
const chatHistory = require('./chatHistory');
const { sendTextMessage, normalizePhoneNumber } = require('./whatsappService');
const { computeBlindIndex, safeDecrypt } = require('./crypto');

/**
 * Handles inbound natural language chat messages from WhatsApp
 */
async function handleWhatsAppChatMessage(fromPhone, messageText, messageId) {
  const normalizedPhone = normalizePhoneNumber(fromPhone);
  if (!messageText || !messageText.trim()) return;

  try {
    // 1. Resolve user by phone number blind index
    const phoneHash = computeBlindIndex(normalizedPhone);
    const userRes = await pool.query(
      `SELECT id, email, name, phone, phone_verified, currency, locale,
              selected_ai_provider, selected_ai_model, ai_key_mode
       FROM users
       WHERE phone_hash = $1
       LIMIT 1`,
      [phoneHash],
    );

    if (userRes.rows.length === 0) {
      const onboardingMsg =
        `👋 *Welcome to Finlytix!*\n\n` +
        `Your phone number (*+${normalizedPhone}*) is not yet linked to an active Finlytix account.\n\n` +
        `Please sign in or link your number at:\n` +
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth`;
      await sendTextMessage(normalizedPhone, onboardingMsg);
      return;
    }

    const user = userRes.rows[0];
    user.name = safeDecrypt(user.name);
    user.phone = safeDecrypt(user.phone);

    // 2. Track / update WhatsApp conversation session
    await pool.query(
      `INSERT INTO whatsapp_conversations (user_id, phone, phone_hash, last_message_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, phone)
       DO UPDATE SET phone_hash = $3, last_message_id = $4, updated_at = NOW()`,
      [user.id, normalizedPhone, phoneHash, messageId || null],
    );

    // 3. Retrieve recent history for conversational memory
    let history = [];
    try {
      const historyRes = await chatHistory.page(pool, user.id);
      if (historyRes && Array.isArray(historyRes.messages)) {
        history = historyRes.messages.slice(-6).map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content || '',
        }));
      }
    } catch (histErr) {
      console.warn('Could not load chat history for WhatsApp user:', histErr.message);
    }

    // 4. Resolve AI model provider preference & keys
    const aiConfig = await resolveUseCase(pool, user.id, 'whatsapp_chat');

    // 5. Query Finlytix AI Assistant engine with tool-calling
    const result = await answerQuestion(pool, user.id, messageText.trim(), history, aiConfig);

    const answer = result.answer || "I couldn't process your request. Please try again.";

    // 6. Save message exchange in chat history
    try {
      const historyVersion = await chatHistory.version(pool, user.id);
      await chatHistory.save(pool, user.id, historyVersion, messageText.trim(), result);
    } catch (saveErr) {
      console.warn('Failed to persist WhatsApp chat exchange:', saveErr.message);
    }

    // 7. Send formatted response back to WhatsApp
    await sendTextMessage(normalizedPhone, answer);
  } catch (err) {
    console.error('❌ Error handling WhatsApp chat message:', err);
    await sendTextMessage(
      normalizedPhone,
      '⚠️ Sorry, I encountered an issue analyzing your financial data. Please try again in a moment.',
    );
  }
}

module.exports = {
  handleWhatsAppChatMessage,
};
