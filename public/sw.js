// sentences · service worker
// 策略：
//   导航请求 → 网络优先，断网回退缓存
//   其他同源 GET → 缓存优先 + 后台更新（stale-while-revalidate）
// 只预缓存应用外壳；地图不预缓存，按需使用（对局/回顾加载过的章节自动进缓存，
// 也可以在设置里主动把整本书缓到本地）。
const VERSION = 'v4';
const CACHE = 'sentences-' + VERSION;
const BASE = self.registration.scope;

const url = function (p) { return new URL(p, BASE).toString(); };

const SHELL = ['', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'maps/index.json'].map(url);

/** 单项写入缓存；失败只影响这一项 */
async function put(cache, target) {
  try {
    const res = await fetch(target, { cache: 'reload' });
    if (res && res.ok) await cache.put(target, res);
  } catch (e) {
    /* 忽略单项失败 */
  }
}

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(function (u) { return put(cache, u); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const target = new URL(req.url);
  if (target.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async function () {
      try {
        // no-store：GitHub Pages 给 HTML 发了 max-age=600，不绕过 HTTP 缓存就会拿到 10 分钟前的页面
        const res = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
        return res;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match(req)) || (await cache.match(url('index.html'))) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async function () {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req)
      .then(function (res) { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(function () { return null; });
    if (cached) { network.catch(function () {}); return cached; }
    const res = await network;
    return res || Response.error();
  })());
});
