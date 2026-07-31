if (typeof window === "undefined") {
  try {
    importScripts("./sw.js");
  } catch (_) {}

  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;

    event.respondWith(
      fetch(request)
        .then((response) => applyCoiHeaders(response))
        .catch(() => caches.match(request).then(applyCoiHeaders))
    );
  });
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(document.currentScript?.src || "./coi-sw.js").catch(() => {});

  if (!window.crossOriginIsolated) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });

    if (navigator.serviceWorker.controller) {
      window.location.reload();
    }
  }
}

function applyCoiHeaders(response) {
  if (
    !response ||
    response.status === 0 ||
    response.status === 204 ||
    response.status === 304 ||
    response.type === "opaque" ||
    response.type === "opaqueredirect"
  ) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
