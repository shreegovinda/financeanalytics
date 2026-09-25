const { AI_CATALOGUE, isValidProvider, isValidModel } = require('../config/aiCatalogue');
const { encrypt, decrypt, maskKey } = require('./crypto');
const { validateConnection } = require('./aiValidation');

const USE_CASES = [
  { id: 'text_chat', label: 'Text chatbot', description: 'Financial questions and product help.' },
  {
    id: 'voice_chat',
    label: 'Voice answers',
    description:
      'Generates answers to spoken questions. Speech recognition and playback use your browser.',
  },
  {
    id: 'statement_extraction',
    label: 'Statement extraction',
    description: 'Reads PDF and spreadsheet statements, including WhatsApp uploads.',
  },
  {
    id: 'categorization',
    label: 'Transaction categorization',
    description: 'Suggests categories after imports and when you request categorization.',
  },
  {
    id: 'bill_extraction',
    label: 'Bill and receipt extraction',
    description: 'Reads details from attached bills and receipts.',
  },
  {
    id: 'whatsapp_chat',
    label: 'WhatsApp chatbot',
    description: 'Answers questions sent through WhatsApp.',
  },
];
function validUseCase(value) {
  return USE_CASES.some((item) => item.id === value);
}
function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

async function resolveUseCase(pool, userId, useCase) {
  if (!validUseCase(useCase)) throw badRequest('Invalid AI use case.');
  const { rows } = await pool.query(
    'SELECT provider, model, key_mode, encrypted_key FROM user_ai_use_cases WHERE user_id=$1 AND use_case=$2',
    [userId, useCase],
  );
  const setting = rows[0];
  if (!setting)
    throw Object.assign(
      new Error(
        `AI use case not configured: ${useCase}. Configure it in Settings → AI Models & Keys.`,
      ),
      { code: 'AI_SETUP_REQUIRED' },
    );
  let apiKey = null;
  if (setting.key_mode !== 'admin') {
    let encryptedKey = setting.encrypted_key;
    if (setting.key_mode === 'saved')
      throw new Error(
        'Personal API key mode is enabled, but no personal key has been saved for this use case.',
      );
    if (!encryptedKey)
      throw new Error('Personal API key mode is enabled, but no personal key has been saved.');
    try {
      apiKey = decrypt(encryptedKey);
    } catch {
      throw new Error('Failed to decrypt personal API key.');
    }
  }
  return {
    providerId: setting.provider,
    model: setting.model,
    apiKey,
    keyMode: setting.key_mode === 'admin' ? 'admin' : 'personal',
  };
}

async function listUseCases(pool, userId) {
  const { rows } = await pool.query(
    'SELECT use_case, provider, model, key_mode, key_hint, updated_at, validated_at FROM user_ai_use_cases WHERE user_id=$1',
    [userId],
  );
  return USE_CASES.map((item) => ({
    ...item,
    setting: rows.find((row) => row.use_case === item.id) || null,
  }));
}

async function saveUseCase(pool, userId, useCase, body, validate = validateConnection) {
  if (!validUseCase(useCase)) throw badRequest('Invalid AI use case.');
  if (body.inherit === true)
    throw badRequest('Shared defaults have been removed. Configure each use case separately.');
  if (body.clear === true) {
    await pool.query('DELETE FROM user_ai_use_cases WHERE user_id=$1 AND use_case=$2', [
      userId,
      useCase,
    ]);
    return;
  }
  const { provider, model, keyMode, apiKey } = body;
  if (!isValidProvider(provider) || !isValidModel(provider, model))
    throw badRequest('Select a valid provider and model from the catalogue.');
  if (!['admin', 'personal'].includes(keyMode)) throw badRequest('Select a valid key source.');
  if (
    apiKey !== undefined &&
    (typeof apiKey !== 'string' || apiKey.trim().length < 8 || apiKey.length > 4096)
  )
    throw badRequest('Enter an API key between 8 and 4,096 characters.');
  if (apiKey !== undefined && keyMode !== 'personal')
    throw badRequest('A dedicated key requires dedicated key mode.');
  const encryptedKey = apiKey ? encrypt(apiKey.trim()) : null;
  const hint = apiKey ? maskKey(apiKey.trim()) : null;
  // INSERT's candidate row must satisfy the constraint even on an update.
  // Reuse only this user's existing dedicated key for the same feature/provider.
  const existing =
    keyMode === 'personal' && !encryptedKey
      ? (
          await pool.query(
            'SELECT encrypted_key, key_hint FROM user_ai_use_cases WHERE user_id=$1 AND use_case=$2 AND provider=$3 AND key_mode=$4',
            [userId, useCase, provider, 'personal'],
          )
        ).rows[0]
      : null;
  if (keyMode === 'personal' && !encryptedKey && !existing?.encrypted_key)
    throw badRequest('Enter a dedicated API key for this use case.');
  let plainKey = null;
  if (keyMode === 'personal') {
    try {
      plainKey = decrypt(encryptedKey || existing.encrypted_key);
    } catch {
      throw badRequest('Your saved key cannot be read. Enter it again to validate.');
    }
  }
  await validate({ providerId: provider, model, apiKey: plainKey });
  await pool.query(
    `INSERT INTO user_ai_use_cases (user_id, use_case, provider, model, key_mode, encrypted_key, key_hint, validated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    ON CONFLICT (user_id,use_case) DO UPDATE SET provider=EXCLUDED.provider, model=EXCLUDED.model,
    key_mode=EXCLUDED.key_mode, encrypted_key=EXCLUDED.encrypted_key, key_hint=EXCLUDED.key_hint, validated_at=NOW(), updated_at=NOW()`,
    [
      userId,
      useCase,
      provider,
      model,
      keyMode,
      encryptedKey || existing?.encrypted_key || null,
      hint || existing?.key_hint || null,
    ],
  );
}

module.exports = {
  USE_CASES,
  validUseCase,
  resolveUseCase,
  listUseCases,
  saveUseCase,
  AI_CATALOGUE,
};
