import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
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

  const isOutputPage = window.location.pathname === import.meta.env.BASE_URL + "output";
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

const SW_CACHE_NAME = "songcountdown-v78";

// Build banner — visible on every page load so we can tell at a glance
// whether the director's tab is running the latest deploy.
// eslint-disable-next-line no-console
console.log("%c[CDS] build " + SW_CACHE_NAME + " loaded", "color:#c186c8;font-weight:600");


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
  // Auto-reload when a brand-new Service Worker takes over the page.
  // Background: the SW uses skipWaiting + clients.claim, so a new build
  // becomes the controller as soon as it activates — but the page itself
  // is still showing whatever the OLD bundle rendered. Without this
  // listener the director would have to manually Cmd+Shift+R after every
  // deploy. With it, the page silently reloads itself the moment a new
  // worker takes over, so deploys become invisible to the user.
  //
  // We track whether a controller existed at page load to suppress the
  // very first controllerchange (which fires when the SW is registered
  // for the first time on a fresh visit — there is no previous bundle to
  // replace, so no reload is needed).
  let reloadingForNewSW = false;
  // D10: Cmd+Shift+R（SW バイパス）後のタブも以後の自動リロード対象に戻す。
  // 「初回登録の controllerchange だけスキップ」し、2回目以降は通常どおり扱う
  // （旧実装はロード時に controller が無いと永久にリロード対象外だった）。
  let sawController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForNewSW) return;
    if (!sawController) { sawController = true; return; } // first-ever registration

    // Don't yank the page out from under the director mid-show. Defer the
    // reload until BOTH:
    //   1) the tab is actually being looked at (visibilityState === visible)
    //   2) no show is in progress (window.__cdsActive — set by
    //      use-countdown.ts on /manage, and mirrored from the broadcast
    //      state by output.tsx on /output). Paused/finished count as
    //      in-progress; only true idle allows the reload.
    // The "cds-countdown-idle" event fires when status returns to idle,
    // so a deferred reload catches up the moment the show ends.
    const safeToReload = () =>
      document.visibilityState === "visible" &&
      !(window as any).__cdsActive &&
      !(window as any).__cdsOverlayActive; // サマリー/EVENT INFO 表示中もリロード保留

    const doReload = () => {
      reloadingForNewSW = true;
      window.location.reload();
    };

    if (safeToReload()) {
      doReload();
      return;
    }

    const retry = () => {
      if (safeToReload()) {
        document.removeEventListener("visibilitychange", retry);
        window.removeEventListener("cds-countdown-idle", retry);
        doReload();
      }
    };
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("cds-countdown-idle", retry);
  });

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
