export async function loadRegistry() {
  const [scenes, avatars] = await Promise.all([fetchJSON('./data/scene-registry.json'), fetchJSON('./data/avatar-registry.json')]);
  if (!Array.isArray(scenes.scenes) || !Array.isArray(avatars.avatars)) throw new Error('一覧データを読み込めませんでした。');
  return { scenes: scenes.scenes, avatars: avatars.avatars };
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} (${response.status})`);
  return response.json();
}

export async function loadScene(meta) {
  const scene = await fetchJSON(meta.file);
  if (scene.sceneId !== meta.id || !scene.nodes?.[scene.startNode]) throw new Error('シーンのデータが正しくありません。');
  for (const node of Object.values(scene.nodes)) {
    if (!node.prompt || !Array.isArray(node.examples) || !Array.isArray(node.acceptedIntents)) throw new Error('会話データが不完全です。');
    if (typeof node.next === 'string' && !scene.nodes[node.next]) throw new Error('次の会話が見つかりません。');
  }
  return scene;
}

export function nextNode(scene, node, evaluation) {
  if (typeof node.next === 'string' || node.next == null) return node.next;
  const selected = node.next.variants?.find(item => evaluation?.matched?.includes(item.ifIntent));
  return selected?.node ?? node.next.default ?? null;
}

export function turnCount(scene) {
  let count = 0, id = scene.startNode;
  const visited = new Set();
  while (id && !visited.has(id) && count < 50) {
    visited.add(id); count++;
    const next = scene.nodes[id]?.next;
    id = typeof next === 'string' ? next : next?.default || null;
  }
  return count;
}
