const { resolveUseCase } = require('../services/aiUseCases');
const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { chatErrorResponse } = require('../services/chatErrors');
const { answerQuestion } = require('../services/chat');
const router = express.Router();
const active = new Set();
const chatHistory = require('../services/chatHistory');
router.get('/conversations', auth, async (req, res) => {
  try {
    res
      .set('Cache-Control', 'no-store')
      .json({ conversations: await chatHistory.conversations(pool, req.user.id) });
  } catch {
    res.status(500).json({ error: 'Unable to load conversations.' });
  }
});
router.post('/conversations', auth, async (req, res) => {
  if (
    req.body.title !== undefined &&
    (typeof req.body.title !== 'string' || req.body.title.length > 80)
  )
    return res.status(400).json({ error: 'Chat titles must be up to 80 characters.' });
  try {
    res.status(201).json(await chatHistory.createConversation(pool, req.user.id, req.body.title));
  } catch {
    res.status(500).json({ error: 'Unable to create conversation.' });
  }
});
router.delete('/conversations/:id', auth, async (req, res) => {
  try {
    await chatHistory.deleteConversation(pool, req.user.id, req.params.id);
    res.status(204).end();
  } catch (error) {
    res.status(error.status || 500).json({ error: 'Unable to delete conversation.' });
  }
});
router.get('/history', auth, async (req, res) => {
  try {
    res
      .set('Cache-Control', 'no-store')
      .json(await chatHistory.page(pool, req.user.id, req.query.before, req.query.conversationId));
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.status === 400 ? error.message : 'Unable to load history. Please retry.',
    });
  }
});
router.delete('/history', auth, async (req, res) => {
  try {
    await chatHistory.remove(pool, req.user.id);
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Unable to delete history. Please retry.' });
  }
});
router.post('/', auth, async (req, res) => {
  const { message, history = [], useCase = 'text_chat', conversationId } = req.body;
  if (!['text_chat', 'voice_chat'].includes(useCase))
    return res.status(400).json({ error: 'Invalid chat use case.' });
  if (
    typeof message !== 'string' ||
    !message.trim() ||
    message.length > 2000 ||
    !Array.isArray(history) ||
    history.length > 8 ||
    history.some(
      (item) =>
        !item ||
        !['user', 'assistant'].includes(item.role) ||
        typeof item.content !== 'string' ||
        item.content.length > 12000,
    )
  ) {
    return res.status(400).json({ error: 'Enter a question up to 2,000 characters.' });
  }
  if (active.has(req.user.id))
    return res.status(429).json({ error: 'Please wait for your current answer to finish.' });
  active.add(req.user.id);
  try {
    if (conversationId !== undefined)
      await chatHistory.requireConversation(pool, req.user.id, conversationId);
    const scopedHistory =
      conversationId !== undefined
        ? (await chatHistory.page(pool, req.user.id, undefined, conversationId)).messages
            .slice(-6)
            .map(({ role, content }) => ({ role, content }))
        : history;
    const historyVersion = await chatHistory.version(pool, req.user.id);
    const result = await answerQuestion(pool, req.user.id, message.trim(), scopedHistory, () =>
      resolveUseCase(pool, req.user.id, useCase),
    );
    const saved = await chatHistory.save(
      pool,
      req.user.id,
      historyVersion,
      message.trim(),
      result,
      conversationId,
    );
    if (!saved)
      return res.status(409).json({
        error: 'History was deleted while this answer was being prepared. Please reload.',
      });
    res.set('Cache-Control', 'no-store').json(result);
  } catch (error) {
    if (error.message === 'Conversation not found.')
      return res
        .status(404)
        .json({ error: 'This conversation was deleted or is unavailable. Start a new chat.' });
    // Do not log prompts, financial data, credentials or upstream error bodies.
    const failure = chatErrorResponse(error);
    console.warn('Assistant request failed:', failure.code);
    res.status(failure.status).json({ error: failure.message, code: failure.code });
  } finally {
    active.delete(req.user.id);
  }
});
module.exports = router;
