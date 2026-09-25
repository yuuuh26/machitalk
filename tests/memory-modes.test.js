import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('memory modes wait for the question, hide the model answer, and accept a paraphrase', async () => {
  const handlers = {}, spoken = [];
  const classList = { toggle() {}, add() {}, remove() {} };
  const app = { innerHTML: '', classList, addEventListener(type, handler) { handlers[type] = handler; } };
  const toast = { textContent: '', classList };
  const avatar = { style: {}, dataset: {}, classList, setAttribute() {}, offsetWidth: 100 };
  const synthesis = { getVoices: () => [], addEventListener() {}, cancel() {}, speak(item) { spoken.push(item); } };
  globalThis.window = { speechSynthesis: synthesis };
  globalThis.speechSynthesis = synthesis;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.document = { querySelector(selector) { return selector === '#app' ? app : selector === '#avatar' ? avatar : toast; } };
  globalThis.fetch = async path => ({ ok: true, json: async () => JSON.parse(await readFile(new URL(`../${path.replace(/^\.\//, '')}`, import.meta.url))) });
  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class { get() { return globalThis.FormData.value; } static value = ''; };
  await import('../js/app.js');
  for (let i = 0; i < 10 && !app.innerHTML.includes('QUICK START'); i++) await new Promise(resolve => setTimeout(resolve, 0));

  const originalTimeout = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  let now = 0, nextId = 0;
  const timers = new Map();
  globalThis.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id, { due: now + delay, callback }); return id; };
  globalThis.clearTimeout = id => { timers.delete(id); };
  const tick = delta => {
    const end = now + delta;
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      now = due[1].due; timers.delete(due[0]); due[1].callback();
    }
    now = end;
  };
  const click = (action, mode) => handlers.click({ target: { closest: () => ({ dataset: { action, mode } }) } });
  try {
    assert.match(app.innerHTML, /聞いて覚える/);
    await click('practice-mode', 'listen');
    await click('quick');
    assert.match(spoken.at(-1).text, /How can I get to Osaka Station/);
    assert.match(app.innerHTML, /data-action="mic" disabled/);
    assert.doesNotMatch(app.innerHTML, /class="memory-flash"/);
    spoken.at(-1).onend();
    tick(649);
    assert.equal(spoken.length, 1);
    tick(1);
    assert.equal(spoken.at(-1).text, 'Take this train to Osaka Station.');
    spoken.at(-1).onend();
    assert.match(app.innerHTML, /思い出して英語で話そう/);
    assert.doesNotMatch(app.innerHTML, /data-action="mic" disabled/);
    assert.doesNotMatch(app.innerHTML, /class="memory-flash"/);
    globalThis.FormData.value = 'This train goes to Osaka.';
    handlers.submit({ target: { id: 'type-form' }, preventDefault() {} });
    assert.match(app.innerHTML, /class="feedback (good|great|excellent|perfect)"/);

    await click('home');
    await click('practice-mode', 'flash');
    await click('quick');
    const question = spoken.at(-1);
    question.onend();
    tick(650);
    assert.match(app.innerHTML, /class="memory-flash"/);
    assert.match(app.innerHTML, /Take this train to Osaka Station/);
    tick(1999);
    assert.match(app.innerHTML, /class="memory-flash"/);
    tick(1);
    assert.doesNotMatch(app.innerHTML, /class="memory-flash"/);
    assert.doesNotMatch(app.innerHTML, /data-action="mic" disabled/);
    globalThis.FormData.value = 'This train goes to Osaka.';
    handlers.submit({ target: { id: 'type-form' }, preventDefault() {} });
    assert.match(app.innerHTML, /class="feedback (good|great|excellent|perfect)"/);

    await click('home');
    await click('quick');
    spoken.at(-1).onend();
    await click('show-answer');
    tick(3000);
    assert.doesNotMatch(app.innerHTML, /class="memory-flash"/);
    assert.match(app.innerHTML, /答え合わせ · 言い方の例/);
    await click('home');

    await click('practice-mode', 'listen');
    await click('quick');
    const stalledQuestion = spoken.at(-1);
    tick(12000);
    tick(650);
    assert.equal(spoken.at(-1).text, 'Take this train to Osaka Station.');
    stalledQuestion.onend();
    tick(12000);
    assert.match(app.innerHTML, /class="memory-flash"/);
    tick(2000);
    assert.doesNotMatch(app.innerHTML, /class="memory-flash"/);
    await click('home');
  } finally {
    globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear;
    globalThis.FormData = OriginalFormData;
    delete globalThis.window; delete globalThis.document; delete globalThis.fetch;
    delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
  }
});
