import test from 'node:test';
import assert from 'node:assert/strict';
import { appStorageUsage } from '../js/storage.js';

test('usage counts only MachiTalk caches on a shared GitHub Pages origin', async () => {
  const previousWindow = globalThis.window;
  const previousCaches = globalThis.caches;
  const appCache = {
    keys: async () => ['app.js', 'scene.json'],
    match: async key => new Response(key === 'app.js' ? '12345' : 'abc')
  };
  globalThis.window = { caches: {} }; // No IndexedDB in this test environment.
  globalThis.caches = {
    keys: async () => ['unrelated-app', 'machitalk-v1.8.0'],
    open: async name => {
      assert.equal(name, 'machitalk-v1.8.0');
      return appCache;
    }
  };
  try {
    assert.deepEqual(await appStorageUsage(), { cacheBytes: 8, dataBytes: 0, partial: true });
  } finally {
    globalThis.window = previousWindow;
    globalThis.caches = previousCaches;
  }
});
