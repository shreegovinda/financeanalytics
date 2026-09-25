import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness() {
  const queue = [];
  const timers = new Map();
  let timerId = 0;
  let cancellations = 0;
  const speechSynthesis = {
    speak: (utterance) => queue.push(utterance),
    cancel: () => cancellations++,
    resume() {},
    getVoices: () => [{ lang: 'en-IN', localService: true }],
  };
  const context = {
    exports: {},
    window: { speechSynthesis },
    SpeechSynthesisUtterance: class {
      constructor(text) {
        this.text = text;
      }
    },
    setTimeout: (fn) => {
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const source = fs.readFileSync(new URL('../lib/voice.ts', import.meta.url), 'utf8');
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return { ...context.exports, queue, timers, context, cancellations: () => cancellations };
}

test('spoken answers preserve decimal amounts and strip Markdown and URLs', () => {
  const { spokenChunks } = harness();
  assert.equal(
    spokenChunks('**Spent ₹1,234.56**. [Records](/transactions) https://example.com').join(' '),
    'Spent ₹1,234.56 . Records',
  );
  const text = Array(160).fill('₹1,234.56').join(' ');
  const chunks = spokenChunks(text);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(' '), text);
});

test('recognition supports prefixed browsers and explains denied permissions', () => {
  const h = harness();
  assert.equal(h.recognitionConstructor(), undefined);
  h.context.window.webkitSpeechRecognition = class {};
  assert.equal(h.recognitionConstructor(), h.context.window.webkitSpeechRecognition);
  assert.match(h.recognitionError('not-allowed'), /permission was denied/);
  assert.match(h.recognitionError('network'), /connection/);
});

test('speech completes once after all chunks and clears timers', () => {
  const h = harness();
  const player = new h.VoicePlayback();
  let finished = 0;
  player.speak(
    'A helpful answer. '.repeat(40),
    'en-IN',
    () => finished++,
    () => assert.fail('unexpected error'),
  );
  let i = 0;
  while (i < h.queue.length) {
    const item = h.queue[i++];
    item.onstart();
    item.onend();
  }
  assert.ok(i > 1);
  assert.equal(finished, 1);
  assert.equal(h.timers.size, 0);
});

test('closing or interrupting cancels playback and ignores late callbacks', () => {
  const h = harness();
  const player = new h.VoicePlayback();
  let callbacks = 0;
  player.speak(
    'First answer',
    'en-IN',
    () => callbacks++,
    () => callbacks++,
  );
  const stale = h.queue[0];
  player.stop();
  stale.onstart();
  stale.onend();
  stale.onerror();
  assert.equal(callbacks, 0);
  assert.equal(h.timers.size, 0);
  assert.ok(h.cancellations() >= 2);
});

test('blocked autoplay surfaces a retry instead of remaining stuck', () => {
  const h = harness();
  const player = new h.VoicePlayback();
  let errors = 0;
  player.speak(
    'Answer',
    'en-IN',
    () => assert.fail('unexpected completion'),
    () => errors++,
  );
  [...h.timers.values()][0]();
  h.queue[0].onerror();
  assert.equal(errors, 1);
  assert.equal(h.timers.size, 0);
});

test('missing synthesis fails gracefully, while unlock is safe', () => {
  const h = harness();
  delete h.context.window.speechSynthesis;
  const player = new h.VoicePlayback();
  player.unlock();
  let errors = 0;
  player.speak(
    'Answer',
    'en-IN',
    () => {},
    () => errors++,
  );
  assert.equal(errors, 1);
});
