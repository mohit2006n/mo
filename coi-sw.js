/* Cross-Origin Isolation Service Worker
 * Registers itself as a SW and replays the page with COOP/COEP headers
 * so that SharedArrayBuffer and cross-origin isolation work on GitHub Pages.
 */

if (typeof window === 'undefined') {
    /* ── Service Worker context ── */
    try { importScripts('./sw.js'); } catch (_) {}

    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

    self.addEventListener('fetch', (event) => {
        const { request: r } = event;

        // Never touch no-cache same-origin-only requests (Firefox quirk)
        if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

        event.respondWith(
            fetch(r)
                .then((res) => addIsolationHeaders(res))
                .catch(async () => {
                    const cached = await caches.match(r);
                    return cached ? addIsolationHeaders(cached) : Response.error();
                })
        );
    });

    function addIsolationHeaders(res) {
        // Opaque (cross-origin no-cors) or error responses — leave unchanged
        if (!res.status || res.status === 0) return res;

        const h = new Headers(res.headers);
        h.set('Cross-Origin-Opener-Policy', 'same-origin');
        h.set('Cross-Origin-Embedder-Policy', 'require-corp');
        h.set('Cross-Origin-Resource-Policy', 'cross-origin');

        return new Response(res.status === 204 ? null : res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: h,
        });
    }

} else {
    /* ── Window / page context ── */
    (() => {
        // Already isolated — nothing to do
        if (window.crossOriginIsolated) return;

        const sw = navigator.serviceWorker;
        if (!sw) return;

        // If we're already being controlled by a SW but isolation still failed,
        // do one forced reload so the SW can properly intercept the navigation.
        // We track this in sessionStorage to avoid infinite loops.
        if (sw.controller) {
            const alreadyRetried = sessionStorage.getItem('coiRetry');
            if (!alreadyRetried) {
                sessionStorage.setItem('coiRetry', '1');
                window.location.reload();
            }
            // If we've already retried and isolation still didn't work, give up.
            return;
        }

        // Clear any stale retry flag from a previous session
        sessionStorage.removeItem('coiRetry');

        // Register the SW (this script IS the SW)
        sw.register(document.currentScript.src).then((reg) => {
            // New SW installed — reload so it can take control immediately
            reg.addEventListener('updatefound', () => window.location.reload());

            // SW was already active but not yet controlling this page
            if (reg.active && !sw.controller) {
                window.location.reload();
            }
        });
    })();
}
