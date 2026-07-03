const VERSION = "v1.0.9";
const APP_SHELL_CACHE = `app-shell-${VERSION}`;
const API_CACHE = `api-get-${VERSION}`;
const NETWORK_TIMEOUT_MS = 9000;

// On a poor/unstable connection, fetch() can hang instead of rejecting, which
// would block these handlers from ever falling back to cache. Aborting after
// NETWORK_TIMEOUT_MS turns a hang into a rejection so the existing catch-based
// cache fallback below actually runs.
function fetchWithTimeout(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

const APP_SHELL_ASSETS = [
  "/login",
  "/agent/home",
  "/agent/campaigns",
  "/agent/sync",
  "/agent/outlets",
  "/agent/sales",
];

async function precacheAppShell() {
  const cache = await caches.open(APP_SHELL_CACHE);
  await Promise.allSettled(
    APP_SHELL_ASSETS.map((asset) => cache.add(new Request(asset, { cache: "reload" })))
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![APP_SHELL_CACHE, API_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isApiGetRequest(request) {
  return request.method === "GET" && request.url.includes("/api/");
}

function shouldBypassApiCache(request) {
  const url = new URL(request.url);
  return (
    url.pathname.startsWith("/api/auth/")
    || url.pathname.startsWith("/api/public/brand")
    || url.pathname.startsWith("/api/brand/active")
  );
}

function isStaticAssetRequest(request) {
  const url = new URL(request.url);
  return (
    url.origin === self.location.origin
    && (
      url.pathname.startsWith("/_next/static/")
      || /\.(?:js|css|png|jpg|jpeg|svg|gif|webp|ico|woff2?|json)$/i.test(url.pathname)
    )
  );
}

function offlineAgentFallback() {
  return new Response(
    "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Offline</title></head><body style=\"font-family:system-ui,sans-serif;margin:0;padding:24px;background:#fff7ed;color:#431407\"><main style=\"max-width:420px;margin:20vh auto;border:1px solid #fed7aa;border-radius:24px;padding:20px;background:#fffbeb\"><p style=\"font-size:14px;font-weight:700;margin:0 0 8px\">Needs online preload</p><p style=\"font-size:14px;line-height:1.5;margin:0\">Reconnect once and open the agent app before using it offline on this device.</p></main></body></html>",
    { status: 503, headers: { "Content-Type": "text/html" } }
  );
}

async function handleAgentNavigation(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedRequest = await caches.match(request);
    if (cachedRequest) return cachedRequest;

    const cachedHome = await caches.match("/agent/home");
    if (cachedHome) return cachedHome;

    return offlineAgentFallback();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isApiGetRequest(request)) {
    if (shouldBypassApiCache(request)) {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(
      fetchWithTimeout(request)
        .then((response) => {
          if (!response.ok) return response;
          const cloned = response.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(
            JSON.stringify({
              success: false,
              offline: true,
              message: "Offline and no cached API response available.",
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          );
        })
    );
    return;
  }

  if (request.mode === "navigate") {
    if (url.origin === self.location.origin && url.pathname.startsWith("/agent/")) {
      event.respondWith(handleAgentNavigation(request));
      return;
    }

    event.respondWith(
      fetch(request).catch(async () => {
        const cachedRequest = await caches.match(request);
        if (cachedRequest) return cachedRequest;
        return new Response(
          "<!DOCTYPE html><html><body><h1>You're offline</h1><p>This page isn't cached yet. Reconnect and try again.</p></body></html>",
          { status: 503, headers: { "Content-Type": "text/html" } }
        );
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!isStaticAssetRequest(request) || !response.ok) return response;
        const cloned = response.clone();
        caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, cloned));
        return response;
      });
    })
  );
});



