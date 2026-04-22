import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/noto-sans-jp/japanese-400.css";
import "@fontsource/noto-sans-jp/japanese-500.css";
import "@fontsource/noto-sans-jp/japanese-600.css";
import "@fontsource/noto-sans-jp/japanese-700.css";
import "@fontsource/noto-sans-jp/japanese-800.css";
import "@fontsource/noto-sans-jp/japanese-900.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/600.css";
import "@fontsource/noto-sans-jp/700.css";
import "@fontsource/noto-sans-jp/800.css";
import "@fontsource/noto-sans-jp/900.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/jetbrains-mono/400.css";

function moveToMainScreen() {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
  if (!isStandalone) return;

  const isOutputPage = window.location.pathname === "/output";
  if (isOutputPage) return;

  const tryMove = async () => {
    try {
      if ("getScreenDetails" in window) {
        const details = await (window as any).getScreenDetails();
        if (!details?.screens || details.screens.length < 2) return;
        const primary = details.screens.find((s: any) => s.isPrimary);
        if (!primary) return;

        const currentScreen = details.currentScreen;
        if (currentScreen && currentScreen.isPrimary) return;

        window.moveTo(primary.left, primary.top);
        setTimeout(() => {
          window.moveTo(primary.left, primary.top);
        }, 200);
        return;
      }
    } catch {}

    try {
      if (window.screenX < 0 || window.screenX > window.screen.width) {
        window.moveTo(0, 0);
      }
    } catch {}
  };

  tryMove();
  setTimeout(tryMove, 500);
}

moveToMainScreen();

const SW_CACHE_NAME = "songcountdown-v26";

async function clearOldCaches() {
  try {
    const keys = await caches.keys();
    const oldKeys = keys.filter((k) => k !== SW_CACHE_NAME);
    if (oldKeys.length > 0) {
      await Promise.all(oldKeys.map((k) => caches.delete(k)));
    }
  } catch {}
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    await clearOldCaches();

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.update();
      }
    } catch {}

    const SW_URL = (import.meta.env.BASE_URL || "/") + "sw.js";
    navigator.serviceWorker.register(SW_URL).then((reg) => {
      reg.update();

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "activated") {
              clearOldCaches();
            }
          });
        }
      });
    }).catch(() => {});

    navigator.serviceWorker.ready.then(async () => {
      try {
        const cache = await caches.open(SW_CACHE_NAME);
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const origin = location.origin;
        const urls = resources
          .map((r) => r.name)
          .filter((url) => {
            if (!url.startsWith(origin)) return false;
            const path = new URL(url).pathname;
            if (path.startsWith("/api/")) return false;
            return true;
          });
        for (const url of urls) {
          const existing = await cache.match(url);
          if (!existing) {
            await cache.add(url).catch(() => {});
          }
        }
      } catch {}
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
