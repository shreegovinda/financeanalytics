const test = require('node:test');
const assert = require('node:assert/strict');

const ai = require('../services/ai');

const KEYS = [
  'AI_PROVIDER',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'ANTHROPIC_MODEL',
  'GEMINI_MODEL',
];

/**
 * ai.js reads process.env at call time, so each case can reshape the
 * environment as long as it restores it afterwards.
 */
function withEnv(overrides, fn) {
  const saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
  }
  try {
    for (const key of KEYS) {
      delete process.env[key];
    }
    Object.assign(process.env, overrides);
    return fn();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

const selected = () => ai.getProvidersStatus().selectedProvider;

test('an explicit configured AI_PROVIDER is used', () => {
  withEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }, () => {
    assert.equal(selected(), 'gemini');
  });
  withEnv({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a' }, () => {
    assert.equal(selected(), 'anthropic');
  });
});

test('an explicit choice wins even when both providers are configured', () => {
  withEnv({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }, () => {
    assert.equal(selected(), 'gemini');
  });
});

// REGRESSION: with no keys at all, this used to fall through to a hardcoded
// 'anthropic'. Someone who had set AI_PROVIDER=gemini was told "Claude is not
// configured" and went looking for the wrong key.
test('an explicit choice is reported even when nothing is configured', () => {
  withEnv({ AI_PROVIDER: 'gemini' }, () => {
    assert.equal(
      selected(),
      'gemini',
      'an unconfigured explicit choice must still be named, so the error points at the right key',
    );
  });
});

test('an unconfigured explicit choice still yields to a provider that works', () => {
  // Being usable beats being asked for.
  withEnv({ AI_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'a' }, () => {
    assert.equal(selected(), 'anthropic');
  });
});

test('an unrecognised AI_PROVIDER does not select a bogus provider', () => {
  withEnv({ AI_PROVIDER: 'gpt-4', ANTHROPIC_API_KEY: 'a' }, () => {
    assert.equal(selected(), 'anthropic');
  });
  withEnv({ AI_PROVIDER: 'gpt-4' }, () => {
    assert.equal(selected(), 'anthropic', 'falls back to the built-in default');
  });
});

test('with no AI_PROVIDER, whichever provider has a key is used', () => {
  withEnv({ GEMINI_API_KEY: 'g' }, () => {
    assert.equal(selected(), 'gemini');
  });
  withEnv({ ANTHROPIC_API_KEY: 'a' }, () => {
    assert.equal(selected(), 'anthropic');
  });
});

test('the placeholder key "sk-" does not count as configured', () => {
  withEnv({ ANTHROPIC_API_KEY: 'sk-' }, () => {
    assert.equal(ai.isProviderConfigured('anthropic'), false);
  });
  withEnv({ ANTHROPIC_API_KEY: '' }, () => {
    assert.equal(ai.isProviderConfigured('anthropic'), false);
  });
});

test('labels carry no model version, so they cannot drift', () => {
  // The label previously read "Claude 3.5 Sonnet" while ANTHROPIC_MODEL was
  // claude-sonnet-4-5. The version belongs in `model`, which is derived.
  withEnv({ ANTHROPIC_MODEL: 'claude-opus-5' }, () => {
    const anthropic = ai.getProvidersStatus().providers.find((p) => p.id === 'anthropic');
    assert.equal(anthropic.label, 'Claude');
    assert.doesNotMatch(anthropic.label, /\d/, 'no version number in the label');
    assert.equal(anthropic.model, 'claude-opus-5', 'the model reflects the environment');
  });
});

test('the model falls back to a current default when unset', () => {
  withEnv({}, () => {
    const anthropic = ai.getProvidersStatus().providers.find((p) => p.id === 'anthropic');
    assert.equal(anthropic.model, 'claude-opus-5');
  });
});

test('the not-configured message names the variable and the file to edit', () => {
  withEnv({}, () => {
    const message = ai.notConfiguredMessage('gemini');
    assert.match(message, /GEMINI_API_KEY/, 'names the variable to set');
    assert.match(message, /backend\/\.env\.local/, 'names the file');
    assert.match(message, /ANTHROPIC_API_KEY/, 'mentions the alternative provider');
  });
});
