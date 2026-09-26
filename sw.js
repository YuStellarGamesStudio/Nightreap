/* Asset list and its import hash are refreshed together for each release. */
importScripts('./sw-assets.js?v=2f7bd25217ab22ba');

const CACHE_PREFIX = 'nightreap-assets-';
const CACHE_NAME = CACHE_PREFIX + RELEASE.version;
const scope = new URL('./', self.location.href);
const entries = new Map(RELEASE.assets.map(asset => [new URL(asset.path, scope).pathname, asset]));
const shell = RELEASE.assets.find(asset => asset.path === 'index.html');
const assetURL = asset => new URL(`${asset.path}?v=${asset.hash}`, scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await Promise.all(RELEASE.assets.map(async asset => {
        const url = assetURL(asset);
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error(`Offline asset unavailable: ${asset.path}`);
        const bytes = await response.clone().arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
        if (hash !== asset.hash) throw new Error(`Offline asset version mismatch: ${asset.path}`);
        await cache.put(url, response);
      }));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Retain one prior release for already-open clients during an explicit update.
    const versions = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX));
    const previous = versions.filter(name => name !== CACHE_NAME).at(-1);
    await Promise.all(versions.filter(name => name !== CACHE_NAME && name !== previous).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;
  const navigation = request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === new URL('index.html', scope).pathname);
  const entry = navigation ? shell : entries.get(url.pathname);
  if (!entry) return;
  // Unversioned dynamic SVG requests resolve to this release. Explicit hashes are never ignored.
  const key = navigation || !url.search ? assetURL(entry) : request.url;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(key);
    if (cached) return cached;
    if (url.searchParams.has('v')) {
      const prior = await caches.match(key);
      if (prior) return prior;
    }
    return fetch(request);
  })());
});
