import { useState, useEffect, useCallback, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AppModeProvider, useAppMode } from "@/hooks/use-app-mode";
import { ModeTabBar } from "@/components/mode-tab-bar";
import { useUndo } from "@/hooks/use-undo";
import Home from "@/pages/home";
import Manage from "@/pages/manage";
import Output from "@/pages/output";
import OutputFirebase from "@/pages/output-firebase";
import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/error-boundary";

const INSTANCE_CHANNEL = "songcountdown-instance";
const INSTANCE_LS_KEY = "songcountdown-instance-active";
const INSTANCE_SS_KEY = "songcountdown-instance-id";

// Same instance id across reloads in the SAME tab — sessionStorage is per-tab,
// so a SW auto-reload or hand-reload re-uses the id and avoids the page
// "seeing itself" as a different instance + showing the duplicate-tab
// warning. A brand new tab gets a brand new id (sessionStorage is empty).
function getOrCreateInstanceId(): string {
  try {
    const existing = sessionStorage.getItem(INSTANCE_SS_KEY);
    if (existing) return existing;
  } catch (_) {}
  const fresh = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try { sessionStorage.setItem(INSTANCE_SS_KEY, fresh); } catch (_) {}
  return fresh;
}

function useDuplicateGuard(enabled: boolean = true) {
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const instanceId = useRef(getOrCreateInstanceId());

  // A live show is sacred: while a countdown is in progress on THIS tab
  // (running / paused / between songs), no signal from another tab may
  // replace this screen with the DuplicateWarning — unmounting /manage
  // would wipe the remaining time and freeze the projector output.
  // The NEW tab still sees its own warning via checkExisting().
  const showInProgress = () => !!(window as any).__cdsActive;

  useEffect(() => {
    if (!enabled) return;
    let bc: BroadcastChannel | null = null;

    const markActive = () => {
      try {
        localStorage.setItem(INSTANCE_LS_KEY, JSON.stringify({ id: instanceId.current, ts: Date.now() }));
      } catch (_) {}
    };

    const checkExisting = () => {
      try {
        const raw = localStorage.getItem(INSTANCE_LS_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          // 4000 ms window: markActive runs every 3s, so a live tab's ts
          // is always <= 3s old. 4s gives a 1s margin without being so
          // wide that a tab closed seconds ago still looks alive.
          if (data.id !== instanceId.current && Date.now() - data.ts < 4000) {
            return true;
          }
        }
      } catch (_) {}
      return false;
    };

    try {
      bc = new BroadcastChannel(INSTANCE_CHANNEL);
      bc.postMessage({ type: "ping", id: instanceId.current });
      bc.addEventListener("message", (e) => {
        if (showInProgress()) return;
        if (e.data?.type === "ping" && e.data.id !== instanceId.current) {
          setIsDuplicate(true);
        }
        if (e.data?.type === "pong" && e.data.id !== instanceId.current) {
          setIsDuplicate(true);
        }
        if (e.data?.type === "take-over" && e.data.id !== instanceId.current) {
          setIsDuplicate(true);
        }
      });
    } catch (_) {}

    if (checkExisting()) {
      setIsDuplicate(true);
    }

    markActive();
    const interval = setInterval(markActive, 3000);

    const handleStorage = (e: StorageEvent) => {
      if (showInProgress()) return;
      if (e.key === INSTANCE_LS_KEY && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.id !== instanceId.current) {
            setIsDuplicate(true);
          }
        } catch (_) {}
      }
    };
    window.addEventListener("storage", handleStorage);

    // Clear our own active marker when the tab closes — otherwise the next
    // tab opened within the 4-second window sees a stale ts and falsely
    // triggers DuplicateWarning. Only clear when WE are the one holding
    // the marker, so concurrent tabs aren't disrupted.
    const handleBeforeUnload = () => {
      try {
        const raw = localStorage.getItem(INSTANCE_LS_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.id === instanceId.current) {
            localStorage.removeItem(INSTANCE_LS_KEY);
          }
        }
      } catch (_) {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      try { bc?.close(); } catch (_) {}
    };
  }, [enabled]);

  const takeOver = useCallback(() => {
    setIsDuplicate(false);
    setDismissed(true);
    try {
      localStorage.setItem(INSTANCE_LS_KEY, JSON.stringify({ id: instanceId.current, ts: Date.now() }));
    } catch (_) {}
    try {
      const bc = new BroadcastChannel(INSTANCE_CHANNEL);
      bc.postMessage({ type: "take-over", id: instanceId.current });
      bc.close();
    } catch (_) {}
  }, []);

  return { isDuplicate: enabled && isDuplicate && !dismissed, takeOver };
}

function AppHeader() {
  const [location] = useLocation();
  const { outputOpen, outputFullscreen, openOutputWindow, closeOutputWindow } = useAppMode();
  if (location === "/output" || location === "/") return null;

  const currentMode = outputOpen ? "show" as const : "setlist" as const;

  const handleOutputOn = () => {
    openOutputWindow();
  };

  // ModeTabBar sits inside the fixed topbar strip (56px) on the right side.
  return (
    <div
      className="fixed top-0 right-4 z-50 flex items-center h-[56px]"
      style={{ background: "transparent" }}
      data-testid="app-header"
    >
      <ModeTabBar
        activeMode={currentMode}
        outputOpen={outputOpen}
        outputFullscreen={outputFullscreen}
        onOutputOn={handleOutputOn}
        onOutputOff={closeOutputWindow}
      />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/manage" component={Manage} />
      <Route path="/output" component={Output} />
      <Route path="/output-firebase" component={OutputFirebase} />
      <Route component={NotFound} />
    </Switch>
  );
}

function UndoListener() {
  useUndo();
  return null;
}

function DuplicateWarning({ onTakeOver }: { onTakeOver: () => void }) {
  return (
    <div className="h-screen w-full flex items-center justify-center" style={{ background: "#262624" }}>
      <div
        className="max-w-md mx-auto p-8 rounded-lg text-center"
        style={{
          background: "rgba(193,134,200,0.05)",
          border: "1px solid rgba(193,134,200,0.2)",
        }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{
            background: "rgba(250,204,21,0.1)",
            border: "1px solid rgba(250,204,21,0.3)",
          }}
        >
          <span style={{ fontSize: 28 }}>!</span>
        </div>
        <h2
          className="text-lg font-bold mb-3"
          style={{ color: "rgba(250,204,21,0.9)", fontFamily: "'Noto Sans JP', 'Inter', sans-serif" }}
        >
          既に起動中です
        </h2>
        <p
          className="text-sm mb-6"
          style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Noto Sans JP', 'Inter', sans-serif", lineHeight: 1.6 }}
        >
          COUNT DOWN STUDIO は別のタブまたはウィンドウで既に開かれています。複数同時に起動すると競合が発生する可能性があります。
        </p>
        <div className="flex gap-3 justify-center">
          <button
            className="px-5 py-2 rounded-full text-xs font-bold tracking-wider uppercase transition-all"
            style={{
              background: "rgba(193,134,200,0.8)",
              color: "#fff",
              border: "1px solid rgba(193,134,200,0.9)",
              fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
            }}
            onClick={onTakeOver}
            data-testid="button-take-over"
          >
            こちらで使用する
          </button>
        </div>
      </div>
    </div>
  );
}

function AppLayout() {
  const [location] = useLocation();
  // /output-firebase も chrome なし (phone-staff の iframe 埋め込みで director の
  // AppHeader = SET LIST / SHOW ON-OFF ボタンが出ると邪魔なので)
  const isOutput = location === "/output" || location === "/output-firebase";
  const isHome = location === "/";
  const { isDuplicate, takeOver } = useDuplicateGuard(!isOutput && !isHome);

  if (isOutput || isHome) {
    return <Router />;
  }

  if (isDuplicate) {
    return <DuplicateWarning onTakeOver={takeOver} />;
  }

  return (
    <div className="h-screen w-full overflow-hidden relative">
      <UndoListener />
      <AppHeader />
      <div className="h-full overflow-hidden">
        <Router />
      </div>
    </div>
  );
}

// GitHub Pages base path (stripped of trailing slash for wouter's base convention)
const ROUTER_BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={ROUTER_BASE}>
          <AppModeProvider>
            <Toaster />
            <AppLayout />
          </AppModeProvider>
        </WouterRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
