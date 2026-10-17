// Offline support for the web app. Template: scripts/pwa-postbuild.mjs fills in the build
// version and the file list after `expo export`, and only post-processed builds register it.
//
// - Install: download every file of this build into its own cache ("gym-app-<version>").
// - Fetch: cache first. Page loads always get this build's index.html, so the app opens offline.
// - Update: a new deploy changes this file, the browser installs the new worker next to the old
//   one, and the page tells it when to take over (see the loader in index.html). On activation
//   the old caches are deleted and the page reloads once onto the new build.
//
// Kill switch, if a bad worker ever ships: deploy a sw.js whose activate handler deletes all
// caches and calls self.registration.unregister().

const VERSION = '06947eb0cf10';
const PRECACHE = [
  "_expo/static/js/web/[id]-16084c63c513cada6c7f10d22f12954b.js",
  "_expo/static/js/web/[id]-17942180fa2d997941d540fa8d9476f5.js",
  "_expo/static/js/web/[id]-a37fe9a30e8654d53f9e7d80a8f183f7.js",
  "_expo/static/js/web/[id]-f66423466a13f01174ef75cff1a39e12.js",
  "_expo/static/js/web/[step]-a966e42fe4e31a53d8f10a361cff83d9.js",
  "_expo/static/js/web/[workoutId]-5aefacce2fc5e95f99f62bd34dbaa3c4.js",
  "_expo/static/js/web/__common-d9ae1fad1258a32be69a6c5d791968fd.js",
  "_expo/static/js/web/__expo-metro-runtime-97703ae02682710149335928b974f18d.js",
  "_expo/static/js/web/_layout-9495b937587c422ec0ed5e0512df8ffc.js",
  "_expo/static/js/web/_layout-b68ff05f02e90f045b27e90d98e05606.js",
  "_expo/static/js/web/_layout-f2ba73c51836b2e8b9c74bcd448236e9.js",
  "_expo/static/js/web/account-acefdc3d77a8945f52bad3b6a5add239.js",
  "_expo/static/js/web/entry-8f1677bed40ff72cf77ede9221a21053.js",
  "_expo/static/js/web/index-01a7f969003b343815896a5a010d5862.js",
  "_expo/static/js/web/index-057d864ba6dfec87735484a231aa39b3.js",
  "_expo/static/js/web/index-2637edb90c1d9db023c767153c65865a.js",
  "_expo/static/js/web/new-f20d8cf19e749287284e85d4ba332c81.js",
  "_expo/static/js/web/plan-170a57023a28512d5b4b640577fd50b5.js",
  "_expo/static/js/web/progress-4d063d14933d8dd796c7c6ca03f0cdde.js",
  "_expo/static/js/web/recap-ca26e3f27854ef62b01f5144741c4dc2.js",
  "_expo/static/js/web/you-52ed17231b1b9bbbf16ee62d6d148d0d.js",
  "assets/__node_modules/expo-router/assets/arrow_down.017bc6ba3fc25503e5eb5e53826d48a8.png",
  "assets/__node_modules/expo-router/assets/error.d1ea1496f9057eb392d5bbf3732a61b7.png",
  "assets/__node_modules/expo-router/assets/file.19eeb73b9593a38f8e9f418337fc7d10.png",
  "assets/__node_modules/expo-router/assets/forward.d8b800c443b8972542883e0b9de2bdc6.png",
  "assets/__node_modules/expo-router/assets/pkg.ab19f4cbc543357183a20571f68380a3.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/back-icon-mask.0a328cd9c1afd0afe8e3b1ec5165b1b4.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/back-icon.35ba0eaec5a4f5ed12ca16fabeae451d.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55@2x.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55@3x.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55@4x.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7@2x.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7@3x.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7@4x.png",
  "assets/__node_modules/expo-router/assets/react-navigation/elements/search-icon.286d67d3f74808a60a78d3ebf1a5fb57.png",
  "assets/__node_modules/expo-router/assets/sitemap.412dd9275b6b48ad28f5e3d81bb1f626.png",
  "assets/__node_modules/expo-router/assets/unmatched.20e71bdf79e3a97bf55fd9e164041578.png",
  "assets/assets/fonts/Archivo-latin-var.cd56e2ec63d7a63df092f824f981253c.woff2",
  "favicon.ico",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "manifest.webmanifest"
];

const PREFIX = 'gym-app-';
const CACHE = PREFIX + VERSION;
const SCOPE = self.registration.scope; // e.g. https://kouvani.github.io/gym-preview/
const SHELL = new URL('index.html', SCOPE).href;
// Plain static pages that live next to the app but are not part of it (the landing page and
// its quiz under start/). The worker must leave them to the network, or a returning visitor
// would get the app shell, and its "page not found" screen, instead of the landing page.
const STATIC_PAGES = [new URL('start/', SCOPE).href];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache, so a fresh deploy is never mixed with stale files.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(PRECACHE.map((path) => new Request(new URL(path, SCOPE).href, { cache: 'reload' }))),
    ),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;
  if (STATIC_PAGES.some((dir) => req.url.startsWith(dir))) return;

  // Every in-app address is the same single-page app.
  if (req.mode === 'navigate') {
    event.respondWith(caches.match(SHELL, { cacheName: CACHE }).then((hit) => hit || fetch(req)));
    return;
  }

  event.respondWith(
    caches.match(req, { cacheName: CACHE }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          // Keep anything the build loads later (fonts, lazy chunks) for the next offline start.
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
