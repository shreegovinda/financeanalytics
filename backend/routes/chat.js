const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { getProviderFromRequest } = require('../services/ai');
const { answerQuestion } = require('../services/chat');
const router = express.Router();
const active = new Set();
const chatHistory = require('../services/chatHistory');
router.get('/history', auth, async (req, res) => {
  try {
    res
      .set('Cache-Control', 'no-store')
      .json(await chatHistory.page(pool, req.user.id, req.query.before));
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
  const { message, history = [] } = req.body;
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
    const historyVersion = await chatHistory.version(pool, req.user.id);
    const result = await answerQuestion(
      pool,
      req.user.id,
      message.trim(),
      history,
      getProviderFromRequest(req),
    );
    const saved = await chatHistory.save(pool, req.user.id, historyVersion, message.trim(), result);
    if (!saved)
      return res.status(409).json({
        error: 'History was deleted while this answer was being prepared. Please reload.',
      });
    res.set('Cache-Control', 'no-store').json(result);
  } catch (error) {
    // Do not log prompts, financial data, credentials or upstream error bodies.
    const busy = /request failed \((502|503|504)\)/.test(error.message);
    const quota = /request failed \(429\)/.test(error.message);
    res.status(503).json({
      error: busy
        ? 'The AI provider is temporarily busy. Please retry your question shortly.'
        : quota
          ? 'The AI provider quota is currently exhausted. Please retry after it resets.'
          : 'The assistant could not answer. Try a more specific question or check your AI provider configuration.',
    });
  } finally {
    active.delete(req.user.id);
  }
});
module.exports = router;
