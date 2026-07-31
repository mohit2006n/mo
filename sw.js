const CACHE_NAME = "morph-v1";

const STATIC_ASSETS = [
  "./",
  "./index.js",
  "./manifest.webmanifest",
  "./src/style.css",
  "./src/script.js",
  "./src/components/index.css",
  "./src/components/index.js",
  "./src/components/globals.css",
  "./src/components/js/theme.js",
  "./src/components/css/accordion.css",
  "./src/components/css/badge.css",
  "./src/components/css/button.css",
  "./src/components/css/card.css",
  "./src/components/css/checkbox.css",
  "./src/components/css/select.css",
  "./src/assets/morph/morph-icon.svg",
  "./src/assets/morph/icon-192.png",
  "./src/assets/morph/icon-512.png",
  "./lib/contract.js",
  "./lib/flow.js",
  "./lib/formats.js",
  "./lib/queue.js",
  "./lib/state.js",
  "./lib/runtime.js",
  "./lib/archive.js",
  "./lib/content.js",
  "./lib/data.js",
  "./lib/database.js",
  "./lib/document.js",
  "./lib/ebook.js",
  "./lib/image.js",
  "./lib/media.js",
  "./lib/pdf.js",
  "./lib/presentation.js",
  "./lib/subtitle.js",
  "./lib/suite.js",
  "./lib/word.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});