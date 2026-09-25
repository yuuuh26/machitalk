import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluate } from '../js/evaluator.js';
import { nextNode, turnCount } from '../js/scene-engine.js';

const readJSON = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));

test('registry and every scene remain data driven and playable', async () => {
  const registry = await readJSON('../data/scene-registry.json');
  const avatars = await readJSON('../data/avatar-registry.json');
  assert.equal(registry.scenes.length, 8);
  assert.deepEqual(registry.scenes.reduce((totals, scene) => ({ ...totals, [scene.mode]: (totals[scene.mode] || 0) + 1 }), {}), { ask: 4, guide: 4 });
  assert.ok(avatars.avatars[0].assets.perfect);
  for (const entry of registry.scenes) {
    const scene = await readJSON(`../${entry.file.slice(2)}`);
    assert.equal(scene.sceneId, entry.id);
    assert.ok(avatars.avatars.find(avatar => avatar.id === scene.avatar));
    assert.equal(turnCount(scene), 6);
    for (const node of Object.values(scene.nodes)) {
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
