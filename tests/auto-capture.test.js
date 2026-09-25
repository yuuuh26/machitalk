import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the first recording waits for playback, later attempts are manual, and examples use a male voice', async () => {
  const handlers = {}, spoken = [], recordings = [];
  const classList = { toggle() {}, add() {}, remove() {} };
  const app = { innerHTML: '', classList, addEventListener(type, handler) { handlers[type] = handler; } };
  const toast = { textContent: '', classList };
  const avatar = { style: {}, dataset: {}, classList, setAttribute() {}, offsetWidth: 100 };
  const voices = [
    { name: 'Samantha', lang: 'en-US', voiceURI: 'Samantha' },
    { name: 'Microsoft David - English', lang: 'en-US', voiceURI: 'David' }
  ];
  const synthesis = { getVoices: () => voices, addEventListener() {}, cancel() {}, speak(item) { spoken.push(item); } };
  class Recognition {
    start() { recordings.push(this); this.onstart?.(); }
    abort() { this.onend?.(); }
  }
  globalThis.window = { speechSynthesis: synthesis, SpeechRecognition: Recognition };
  globalThis.speechSynthesis = synthesis;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.document = { querySelector(selector) { return selector === '#app' ? app : selector === '#avatar' ? avatar : toast; } };
  globalThis.fetch = async path => ({ ok: true, json: async () => JSON.parse(await readFile(new URL(`../${path.replace(/^\.\//, '')}`, import.meta.url))) });
  await import('../js/app.js');
  for (let i = 0; i < 10 && !app.innerHTML.includes('QUICK START'); i++) await new Promise(resolve => setTimeout(resolve, 0));

  const originalTimeout = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  let now = 0, nextId = 0;
  const timers = new Map();
  globalThis.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id, { due: now + delay, callback }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const tick = delta => {
    const end = now + delta;
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      now = due[1].due; timers.delete(due[0]); due[1].callback();
    }
    now = end;
  };
  const click = (action, mode) => handlers.click({ target: { closest: () => ({ dataset: { action, mode, index: '0' } }) } });
  try {
    await click('quick');
    assert.match(app.innerHTML, /class="task-row"/);
    assert.match(app.innerHTML, /data-action="mic" aria-label="録音を開始" disabled/);
    assert.equal(recordings.length, 0);
    spoken.at(-1).onend();
    assert.match(app.innerHTML, /少し待って、自動で録音するよ/);
    tick(849);
    assert.equal(recordings.length, 0);
    tick(1);
    assert.equal(recordings.length, 1);
    assert.match(app.innerHTML, /録音中…/);
    assert.match(app.innerHTML, /aria-label="録音を終了"/);
    recordings[0].onend();
    assert.match(app.innerHTML, /再録音を開始/);
    tick(3000);
    assert.equal(recordings.length, 1, 'a failed first attempt must not restart automatically');
    await click('mic');
    assert.equal(recordings.length, 2);
    await click('show-answer');
    await click('sample');
    assert.equal(spoken.at(-1).voice.name, 'Microsoft David - English');
    assert.equal(spoken.at(-1).pitch, 1);

    await click('home');
    await click('settings'); await click('practice-mode', 'listen'); await click('home'); await click('quick');
    const question = spoken.at(-1);
    question.onend(); tick(650);
    assert.equal(spoken.at(-1).text, 'Take this train to Osaka Station.');
    assert.equal(spoken.at(-1).voice.name, 'Microsoft David - English');
    spoken.at(-1).onend();
    tick(849);
    assert.equal(recordings.length, 2);
    tick(1);
    assert.equal(recordings.length, 3);

    await click('home');
    await click('settings'); await click('practice-mode', 'flash'); await click('home'); await click('quick');
    spoken.at(-1).onend(); tick(650);
    assert.match(app.innerHTML, /class="memory-flash"/);
    tick(2000);
    assert.doesNotMatch(app.innerHTML, /class="memory-flash"/);
    tick(850);
    assert.equal(recordings.length, 4);

    await click('home'); await click('quick');
    spoken.at(-1).onend(); tick(650); tick(2000);
    await click('home'); tick(1000);
    assert.equal(recordings.length, 4, 'leaving the conversation cancels scheduled recording');

    voices.pop();
    await click('quick'); await click('show-answer'); await click('sample');
    assert.equal(spoken.at(-1).pitch, .78, 'devices without a named male voice use a lower pitch');
    await click('home');
  } finally {
    globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear;
    delete globalThis.window; delete globalThis.document; delete globalThis.fetch;
    delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
  }
});
