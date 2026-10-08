const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SPEECH_LANGUAGES,
  parseSpeechLanguage,
  languageReplyInstruction,
  helpGreeting,
} = require('../services/speechLanguages');

test('speech language parser accepts BCP-47 tags and rejects junk', () => {
  assert.equal(parseSpeechLanguage(undefined), undefined);
  assert.equal(parseSpeechLanguage(''), undefined);
  assert.equal(parseSpeechLanguage('hi-IN'), 'hi-IN');
  assert.equal(parseSpeechLanguage('pa-Guru-IN'), 'pa-Guru-IN');
  assert.equal(parseSpeechLanguage('not a lang'), null);
  assert.equal(parseSpeechLanguage('toolong-language-tag-here'), null);
});

test('reply instructions name Indian languages for the model', () => {
  const codes = SPEECH_LANGUAGES.map((item) => item.code);
  for (const code of ['hi-IN', 'bn-IN', 'te-IN', 'or-IN', 'as-IN', 'ur-IN', 'pa-IN']) {
    assert.ok(codes.includes(code));
    assert.match(languageReplyInstruction(code), /Reply entirely/);
  }
  assert.equal(languageReplyInstruction(), '');
});

test('help greetings map to the chosen language', () => {
  assert.match(helpGreeting('hi', 'ta-IN'), /வணக்கம்/);
  assert.match(helpGreeting('नमस्ते', 'en-IN'), /Hello/);
  assert.equal(helpGreeting('How do I upload?', 'hi-IN'), null);
});
