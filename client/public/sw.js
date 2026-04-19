const CACHE_NAME = "songcountdown-v26";

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
      .then(() => {
        return caches.open(CACHE_NAME).then(async (cache) => {
          try {
            const response = await fetch("/", { cache: "no-store" });
            cache.put("/", response.clone());
            const html = await response.text();

            const assetUrls = new Set();
            const srcMatches = html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g);
            for (const m of srcMatches) {
              assetUrls.add(m[1]);
            }

            await Promise.all(
              [...assetUrls].map(async (url) => {
                const existing = await cache.match(url);
                if (existing) return;
                try {
                  const res = await fetch(url);
                  if (res.ok) await cache.put(url, res);
                } catch {}
              })
            );

            for (const url of assetUrls) {
              if (!url.endsWith(".js")) continue;
              try {
                const cached = await cache.match(url);
                if (!cached) continue;
                const jsText = await cached.clone().text();
                const chunkMatches = jsText.matchAll(/import\(["'](\/assets\/[^"']+)["']\)/g);
                for (const m of chunkMatches) {
                  const chunkUrl = m[1];
                  const chunkExisting = await cache.match(chunkUrl);
                  if (!chunkExisting) {
                    try {
                      const chunkRes = await fetch(chunkUrl);
                      if (chunkRes.ok) await cache.put(chunkUrl, chunkRes);
                    } catch {}
                  }
                }
              } catch {}
            }
          } catch {}
        });
      })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "FORCE_CLEAR_CACHE") {
    caches.keys().then((keys) => {
      Promise.all(keys.map((key) => caches.delete(key))).then(() => {
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => client.postMessage("CACHE_CLEARED"));
        });
      });
    });
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.protocol === "chrome-extension:") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match("/").then((cached) => {
            if (cached) return cached;
            return new Response("Offline - please connect to the internet and reload", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            });
          });
        })
    );
    return;
  }

  const cacheKey = url.origin === self.location.origin
    ? url.pathname + url.search
    : request.url;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(cacheKey).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
          }
          return response;
        }).catch(() => new Response("", { status: 503 }));
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(cacheKey).then((cached) => {
          if (cached) return cached;
          return caches.match(request).then((cachedByReq) => {
            if (cachedByReq) return cachedByReq;
            return new Response("", { status: 503 });
          });
        });
      })
  );
});
