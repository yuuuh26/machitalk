import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluate, evaluateAlternatives } from '../js/evaluator.js';
import { classifyAttempt } from '../js/attempts.js';
import { buildBiasPhrases, listen, stopListening } from '../js/speech.js';

const scene = async name => JSON.parse(await readFile(new URL(`../data/scenes/${name}.json`, import.meta.url)));

test('natural alternatives pass while key facts and negations remain protected', async () => {
  const station = (await scene('station-guide')).nodes;
  const town = (await scene('town-guide')).nodes;
  const mall = (await scene('mall-guide')).nodes;
  const asking = (await scene('station-ask')).nodes;
  for (const [node, phrase] of [
    [station.n1, 'This train goes to Osaka.'],
    [station.n2, 'You can stay on this train.'],
    [station.n3, 'It leaves from platform number 3.'],
    [station.n4, 'It takes around 15 min.'],
    [town.n1, 'Head straight down this street.'],
    [town.n2, 'Make a left at the next signal.'],
    [mall.n1, 'The book shop is upstairs on level 2.'],
    [asking.n1, 'What is the best way to Osaka Station?'],
  ]) assert.notEqual(evaluate(node, phrase).grade, 'try-again', phrase);
  for (const [node, phrase] of [
    [station.n1, "Don't take this train to Osaka."],
    [station.n2, 'Yes, you need to change trains.'],
    [station.n3, 'Use platform four, not platform three.'],
    [station.n4, 'It takes ten minutes.'],
    [town.n2, 'Turn right at the light.'],
    [mall.n1, 'The bookstore is on the first floor.'],
    [asking.n1, 'How can I get to Tokyo Station?'],
  ]) assert.equal(evaluate(node, phrase).grade, 'try-again', phrase);
});

test('nearby recognition alternatives can rescue a good answer; distant guesses cannot', async () => {
  const node = (await scene('town-guide')).nodes.n2;
  const nearby = evaluateAlternatives(node, [
    { transcript: 'Turn right at the light.', confidence: .65 },
    { transcript: 'Turn left at the light.', confidence: .57 },
  ]);
  assert.equal(nearby.usedAlternative, true);
  assert.notEqual(nearby.grade, 'try-again');
  const distant = evaluateAlternatives(node, [
    { transcript: 'Turn right at the light.', confidence: .9 },
    { transcript: 'Turn left at the light.', confidence: .3 },
  ]);
  assert.equal(distant.grade, 'try-again');
});

test('clear wrong answer reveals immediately; uncertain recognition has three chances', () => {
  assert.equal(classifyAttempt({ grade: 'try-again', transcript: 'Turn right.', confidence: .9 }), 'wrong');
  assert.equal(classifyAttempt({ grade: 'try-again', transcript: 'Turn right.', confidence: .25 }, { issues: 0 }), 'retry');
  assert.equal(classifyAttempt({ grade: 'try-again', transcript: 'Turn right.', confidence: .25 }, { issues: 2 }), 'reveal');
  assert.equal(classifyAttempt({ grade: 'no-speech' }, { issues: 2 }), 'reveal');
  assert.equal(classifyAttempt({ grade: 'try-again', transcript: 'No.', confidence: .15 }, { typed: true }), 'wrong');
  assert.equal(classifyAttempt({ grade: 'good', transcript: 'Go straight.' }), 'success');
});

test('speech recognition shows interim text, returns multiple final candidates, and ends once', () => {
  let current, interim = '', results = [], noSpeech = 0;
  class FakeRecognition {
    constructor() { current = this; }
    start() {}
    abort() {}
  }
  globalThis.window = { SpeechRecognition: FakeRecognition, speechSynthesis: { cancel() {} } };
  globalThis.speechSynthesis = window.speechSynthesis;
  listen({ onStart() {}, onInterim: text => { interim = text; }, onResult: alternatives => { results = alternatives; }, onNoSpeech: () => { noSpeech++; }, onError: () => {} });
  assert.equal(current.lang, 'en-US');
  assert.equal(current.interimResults, true);
  assert.equal(current.maxAlternatives, 5);
  current.onresult({ results: [Object.assign([{ transcript: 'Take the' }], { isFinal: false })] });
  assert.equal(interim, 'Take the');
  current.onresult({ results: [Object.assign([
    { transcript: 'Take this train', confidence: .7 },
    { transcript: 'Take the train', confidence: .6 },
  ], { isFinal: true })] });
  assert.equal(results.length, 2);
  current.onend();
  assert.equal(noSpeech, 0);
  listen({ onStart() {}, onResult: alternatives => { results = alternatives; }, onNoSpeech: () => { noSpeech++; }, onError: () => {} });
  current.onresult({ results: [
    Object.assign([{ transcript: 'Take this', confidence: .7 }], { isFinal: true }),
    Object.assign([{ transcript: ' train to Osaka', confidence: .8 }], { isFinal: true }),
  ] });
  assert.equal(results[0].transcript, 'Take this train to Osaka');
  stopListening();
  delete globalThis.window; delete globalThis.speechSynthesis;
});

test('supported browsers receive a small contextual phrase boost; unsupported browsers still listen', async () => {
  let current, error = '';
  class FakeRecognition {
    constructor() { current = this; this.phrases = []; }
    start() {}
    abort() {}
  }
  class FakePhrase { constructor(phrase, boost) { this.phrase = phrase; this.boost = boost; } }
  const node = (await scene('station-guide')).nodes.n1;
  assert.ok(buildBiasPhrases(node).includes('Osaka'));
  globalThis.window = { SpeechRecognition: FakeRecognition, SpeechRecognitionPhrase: FakePhrase, speechSynthesis: { cancel() {} } };
  globalThis.speechSynthesis = window.speechSynthesis;
  const callbacks = { node, onStart() {}, onResult() {}, onNoSpeech() {}, onError: message => { error = message; } };
  listen(callbacks);
  assert.ok(current.phrases.some(item => item.phrase === 'Osaka'));
  assert.ok(current.phrases.every(item => item.boost <= 2));
  current.onerror({ error: 'phrases-not-supported' });
  assert.match(error, /補助なし/);
  listen(callbacks);
  assert.deepEqual(current.phrases, []);
  stopListening();
  delete globalThis.window; delete globalThis.speechSynthesis;
});
