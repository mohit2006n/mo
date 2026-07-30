const cacheName = "morph-v1";

const staticAssets = [
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

function handleInstall(event) {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(staticAssets).catch(() => {}))
      .then(() => self.skipWaiting())
  );
}

function handleActivate(event) {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== cacheName).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
}

function handleFetch(event) {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (!res.bodyUsed && res.status === 200) {
          const copy = res.clone();
          caches.open(cacheName).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return applyHeaders(res);
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        const fallback = cached || (await caches.match("./"));
        return applyHeaders(fallback);
      })
  );
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

if (typeof window === "undefined") {
  self.addEventListener("install", handleInstall);
  self.addEventListener("activate", handleActivate);
  self.addEventListener("fetch", handleFetch);
} else if (navigator.serviceWorker) {
  registerServiceWorker();
}

function applyHeaders(response) {
  if (!response) return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}