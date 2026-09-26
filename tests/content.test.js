import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluate } from '../js/evaluator.js';
import { nextNode, turnCount } from '../js/scene-engine.js';

const readJSON = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));

test('registry and every scene remain data driven and playable', async () => {
  const registry = await readJSON('../data/scene-registry.json');
  const avatars = await readJSON('../data/avatar-registry.json');
  assert.equal(registry.scenes.length, 18);
  assert.deepEqual(registry.scenes.reduce((totals, scene) => ({ ...totals, [scene.mode]: (totals[scene.mode] || 0) + 1 }), {}), { ask: 9, guide: 9 });
  assert.deepEqual(avatars.avatars.map(avatar => avatar.id), ['aiko', 'linnea', 'koharu']);
  const uniforms = ['station', 'restaurant', 'service', 'bus', 'cafe', 'hotel', 'pharmacy'];
  for (const avatar of avatars.avatars) {
    const portrait = avatar.assets;
    const reactions = ['good', 'great', 'excellent', 'perfect'].map(mood => portrait[mood].image);
    assert.equal(new Set(reactions).size, 4, `${avatar.id}: each grade needs a distinct expression`);
    for (const mood of ['neutral', 'speaking', 'listening', 'encourage', 'good', 'great', 'excellent', 'perfect']) {
      const image = portrait[mood].image;
      assert.ok((await readFile(new URL(`../${image.slice(2)}`, import.meta.url))).length > 0, `${avatar.id}/${mood}: missing portrait`);
    }
    assert.deepEqual(Object.keys(avatar.costumes), uniforms);
    for (const costume of uniforms) {
      const image = avatar.costumes[costume];
      assert.ok((await readFile(new URL(`../${image.slice(2)}`, import.meta.url))).length > 0, `${avatar.id}/${costume}: missing uniform`);
    }
  }
  for (const entry of registry.scenes) {
    if (entry.mode === 'guide' || entry.id === 'town-ask') assert.equal(entry.costume, undefined, `${entry.id}: visitor should wear casual clothes`);
    else assert.ok(uniforms.includes(entry.costume), `${entry.id}: missing staff costume`);
    const scene = await readJSON(`../${entry.file.slice(2)}`);
    assert.equal(scene.sceneId, entry.id);
    assert.ok(avatars.avatars.find(avatar => avatar.id === scene.avatar));
    assert.equal(turnCount(scene), 6);
    for (const node of Object.values(scene.nodes)) {
      assert.ok(node.instruction?.length >= 12, `${entry.id}/${node.id}: missing Japanese instruction`);
      assert.ok(node.hint?.words && node.hint?.starter, `${entry.id}/${node.id}: missing progressive hint`);
      assert.ok(node.examples.length > 0);
      assert.ok(node.examples.every(example => example.split(/\s+/).length <= 20));
      for (const example of node.examples) {
        const score = evaluate(node, example);
        assert.notEqual(score.grade, 'try-again', `${entry.id}/${node.id}: ${example}`);
        assert.equal(score.grade, 'perfect', `${entry.id}/${node.id}: ${example}`);
      }
      if (node.next) assert.ok(scene.nodes[nextNode(scene, node, { matched: [] })]);
    }
  }
});

test('synonyms pass; wrong direction and empty speech do not', async () => {
  const scene = await readJSON('../data/scenes/town-guide.json');
  assert.notEqual(evaluate(scene.nodes.n1, 'Walk straight along the road.').grade, 'try-again');
  assert.equal(evaluate(scene.nodes.n2, 'Turn right at the light.').grade, 'try-again');
  assert.equal(evaluate(scene.nodes.n2, 'Turn left, then turn right at the light.').grade, 'try-again');
  assert.equal(evaluate(scene.nodes.n1, '').grade, 'no-speech');
});

test('new conversations reject opposite size, temperature, direction, and bus door', async () => {
  for (const [file, node, wrong] of [
    ['cafe-ask', 'n2', 'A large one, please.'],
    ['cafe-ask', 'n3', 'Hot, not iced, please.'],
    ['bus-guide', 'n3', 'Please get on through the front door.'],
    ['photo-guide', 'n3', 'Move a little to your right.'],
    ['rain-guide', 'n4', 'Turn left at the intersection.']
  ]) {
    const scene = await readJSON(`../data/scenes/${file}.json`);
    assert.equal(evaluate(scene.nodes[node], wrong).grade, 'try-again', `${file}/${node}`);
  }
});
