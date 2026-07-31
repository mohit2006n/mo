if (typeof window === 'undefined') {
    try {
        importScripts("./sw.js");
    } catch (_) {}

    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", (event) => {
        const { request: r } = event;
        
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;

        event.respondWith(
            fetch(r)
                .then((response) => {
                    if (!response.status || response.status > 399) return response;
                    
                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                    
                    return new Response(response.status === 204 ? null : response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch(async (e) => {
                    const cached = await caches.match(r);
                    if (cached) {
                        const newHeaders = new Headers(cached.headers);
                        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
                        newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                        newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                        
                        return new Response(cached.body, {
                            status: cached.status,
                            statusText: cached.statusText,
                            headers: newHeaders,
                        });
                    }
                    throw e;
                })
        );
    });
} else {
    (() => {
        if (window.crossOriginIsolated !== false) return;

        const n = navigator;
        if (!n.serviceWorker) return;

        n.serviceWorker.register(window.document.currentScript.src, { scope: '.' }).then(
            (registration) => {
                registration.addEventListener("updatefound", () => {
                    window.location.reload();
                });
                
                if (registration.active && !n.serviceWorker.controller) {
                    window.location.reload();
                }
            }
        );
    })();
}
