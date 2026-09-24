const express = require('express');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');
const { getProvidersStatus } = require('../services/ai');
const { AI_CATALOGUE, isValidProvider, isValidModel } = require('../config/aiCatalogue');
const { encrypt, maskKey } = require('../services/crypto');

const router = express.Router();
const { listUseCases, saveUseCase } = require('../services/aiUseCases');
const validationInProgress = new Set();

router.get('/use-cases', authenticateToken, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json({ useCases: await listUseCases(pool, req.user.id) });
  } catch {
    res.status(500).json({ error: 'Unable to load AI use-case settings.' });
  }
});
router.put('/use-cases/:useCase', authenticateToken, async (req, res) => {
  if (validationInProgress.has(req.user.id))
    return res
      .status(429)
      .json({ error: 'A model check is already running. Please wait for it to finish.' });
  validationInProgress.add(req.user.id);
  try {
    await saveUseCase(pool, req.user.id, req.params.useCase, req.body || {});
    res.json({
      success: true,
      message: req.body?.clear
        ? 'Feature disconnected.'
        : 'Validated and saved. Applies to the next operation; no restart needed.',
    });
  } catch (error) {
    res.status([400, 422].includes(error.status) ? error.status : 500).json({
      error: [400, 422].includes(error.status)
        ? error.message
        : 'Unable to save AI use-case settings.',
      code: error.code || 'AI_SETTINGS_ERROR',
    });
  } finally {
    validationInProgress.delete(req.user.id);
  }
});

/**
 * GET /api/ai/providers
 * Backward compatibility: legacy provider status.
 */
router.get('/providers', (req, res) => {
  res.json(getProvidersStatus());
});

/**
 * GET /api/ai/catalogue
 * Publicly visible catalogue of allowed AI providers and models,
 * combined with authenticated user's current preference and personal key presence.
 */
router.get('/catalogue', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT selected_ai_provider, selected_ai_model, ai_key_mode
       FROM users WHERE id = $1`,
      [req.user.id],
    );

    const keysResult = await pool.query(
      'SELECT provider, key_hint, updated_at FROM user_ai_keys WHERE user_id = $1',
      [req.user.id],
    );

    const userPrefs = userResult.rows[0] || {
      selected_ai_provider: AI_CATALOGUE.defaultProvider,
      selected_ai_model: AI_CATALOGUE.defaultModel,
      ai_key_mode: 'admin',
    };

    const keysMap = {};
    for (const row of keysResult.rows) {
      keysMap[row.provider] = {
        hasKey: true,
        keyHint: row.key_hint,
        updatedAt: row.updated_at,
      };
    }

    const providers = Object.values(AI_CATALOGUE.providers).map((prov) => ({
      ...prov,
      userKeyConfigured: Boolean(keysMap[prov.id]?.hasKey),
      keyHint: keysMap[prov.id]?.keyHint || null,
      updatedAt: keysMap[prov.id]?.updatedAt || null,
    }));

    res.json({
      catalogue: {
        ...AI_CATALOGUE,
        providers,
      },
      currentPreferences: {
        provider: userPrefs.selected_ai_provider,
        model: userPrefs.selected_ai_model,
        keyMode: userPrefs.ai_key_mode,
      },
    });
  } catch (err) {
    console.error('Error fetching AI catalogue:', err);
    res.status(500).json({ error: 'Failed to fetch AI catalogue' });
  }
});

/**
 * PUT /api/ai/preferences
 * Update user AI provider, model, and key mode preferences.
 */
router.put('/preferences', authenticateToken, async (req, res) => {
  const { provider, model, keyMode } = req.body;

  if (provider && !isValidProvider(provider)) {
    return res.status(400).json({ error: 'Invalid AI provider selected.' });
  }

  const activeProvider = provider || AI_CATALOGUE.defaultProvider;

  if (model && !isValidModel(activeProvider, model)) {
    return res.status(400).json({ error: `Invalid model for provider ${activeProvider}.` });
  }

  if (keyMode && keyMode !== 'admin' && keyMode !== 'personal') {
    return res.status(400).json({ error: "keyMode must be 'admin' or 'personal'." });
  }

  try {
    // If setting keyMode to personal, verify user has a key configured
    if (keyMode === 'personal') {
      const keyCheck = await pool.query(
        'SELECT id FROM user_ai_keys WHERE user_id = $1 AND provider = $2',
        [req.user.id, activeProvider],
      );
      if (keyCheck.rows.length === 0) {
        return res.status(400).json({
          error: `Please save an API key for ${activeProvider} before switching to personal key mode.`,
        });
      }
    }

    const result = await pool.query(
      `UPDATE users
       SET selected_ai_provider = COALESCE($1, selected_ai_provider),
           selected_ai_model = COALESCE($2, selected_ai_model),
           ai_key_mode = COALESCE($3, ai_key_mode)
       WHERE id = $4
       RETURNING selected_ai_provider, selected_ai_model, ai_key_mode`,
      [provider || null, model || null, keyMode || null, req.user.id],
    );

    res.json({
      success: true,
      preferences: {
        provider: result.rows[0].selected_ai_provider,
        model: result.rows[0].selected_ai_model,
        keyMode: result.rows[0].ai_key_mode,
      },
    });
  } catch (err) {
    console.error('Error updating AI preferences:', err);
    res.status(500).json({ error: 'Failed to update AI preferences' });
  }
});

/**
 * POST /api/ai/keys
 * Store an encrypted personal API key for the authenticated user.
 */
router.post('/keys', authenticateToken, async (req, res) => {
  const { provider, apiKey } = req.body;

  if (!provider || !isValidProvider(provider)) {
    return res.status(400).json({ error: 'Valid AI provider (gemini or anthropic) is required.' });
  }

  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return res.status(400).json({ error: 'A valid API key string is required.' });
  }

  const cleanKey = apiKey.trim();
  const encryptedKey = encrypt(cleanKey);
  const keyHint = maskKey(cleanKey);

  try {
    await pool.query(
      `INSERT INTO user_ai_keys (user_id, provider, encrypted_key, key_hint, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, provider)
       DO UPDATE SET encrypted_key = EXCLUDED.encrypted_key,
                     key_hint = EXCLUDED.key_hint,
                     updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, provider, encryptedKey, keyHint],
    );

    await pool.query(
      `UPDATE users
       SET ai_key_mode = 'personal',
           selected_ai_provider = COALESCE(selected_ai_provider, $2)
       WHERE id = $1`,
      [req.user.id, provider],
    );

    res.json({
      success: true,
      provider,
      keyHint,
      message: `Personal API key for ${provider} saved successfully with authenticated encryption.`,
    });
  } catch (err) {
    console.error('Error saving personal AI key:', err);
    res.status(500).json({ error: 'Failed to save personal AI key' });
  }
});

/**
 * DELETE /api/ai/keys/:provider
 * Permanently delete a personal API key.
 */
router.delete('/keys/:provider', authenticateToken, async (req, res) => {
  const { provider } = req.params;

  if (!provider || !isValidProvider(provider)) {
    return res.status(400).json({ error: 'Valid AI provider is required.' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM user_ai_keys WHERE user_id = $1 AND provider = $2 RETURNING id',
      [req.user.id, provider],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Personal key not found' });
    }

    // If active key_mode was personal for this provider, switch back to admin
    await pool.query(
      `UPDATE users
       SET ai_key_mode = 'admin'
       WHERE id = $1 AND selected_ai_provider = $2 AND ai_key_mode = 'personal'`,
      [req.user.id, provider],
    );

    res.json({
      success: true,
      provider,
      message: `Personal key for ${provider} permanently removed.`,
    });
  } catch (err) {
    console.error('Error deleting personal AI key:', err);
    res.status(500).json({ error: 'Failed to delete personal AI key' });
  }
});

module.exports = router;
