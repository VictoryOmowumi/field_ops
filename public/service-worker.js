const VERSION = "v1.0.2";
const APP_SHELL_CACHE = `app-shell-${VERSION}`;
const API_CACHE = `api-get-${VERSION}`;

const APP_SHELL_ASSETS = [
  "/",
  "/login",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS))
  );
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
  return url.pathname.startsWith("/api/auth/");
}

function isStaticAssetRequest(request) {
  const url = new URL(request.url);
  return (
    url.origin === self.location.origin
    && /\.(?:js|css|png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (isApiGetRequest(request)) {
    if (shouldBypassApiCache(request)) {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(
      fetch(request)
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
    event.respondWith(
      fetch(request).catch(() => caches.match("/login"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (!isStaticAssetRequest(request) || !response.ok) return response;
          const cloned = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() => caches.match("/login"));
    })
  );
});
