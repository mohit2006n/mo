const cacheName = "morph-v1";

const staticAssets = [
  "./",
  "./index.html",
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
      .then((cache) =>
        Promise.allSettled(
          staticAssets.map((asset) =>
            cache.add(asset).catch((err) => console.warn("Failed to cache:", asset, err))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
}

function handleActivate(event) {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== cacheName)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
}

function handleFetch(event) {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response.bodyUsed && response.status === 200) {
          const copy = response.clone();
          caches
            .open(cacheName)
            .then((cache) => cache.put(event.request, copy))
            .catch(() => {});
        }
        return applyHeaders(response);
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) {
            return applyHeaders(cached);
          }
          return caches.match("./").then((fallback) => applyHeaders(fallback));
        })
      )
  );
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    const scriptUrl = document.currentScript
      ? document.currentScript.src
      : "./sw.js";
    navigator.serviceWorker.register(scriptUrl).catch((err) => {
      console.warn("ServiceWorker registration failed:", err);
    });
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
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}