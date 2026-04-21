import { useState, useEffect, useCallback, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppModeProvider, useAppMode } from "@/hooks/use-app-mode";
import { ModeTabBar } from "@/components/mode-tab-bar";
import { useUndo } from "@/hooks/use-undo";
import Home from "@/pages/home";
import Manage from "@/pages/manage";
import Output from "@/pages/output";
import NotFound from "@/pages/not-found";

const INSTANCE_CHANNEL = "songcountdown-instance";
const INSTANCE_LS_KEY = "songcountdown-instance-active";

function useDuplicateGuard() {
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const instanceId = useRef(Date.now().toString(36) + Math.random().toString(36).slice(2, 6));

  useEffect(() => {
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
          if (data.id !== instanceId.current && Date.now() - data.ts < 5000) {
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

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
      try { bc?.close(); } catch (_) {}
    };
  }, []);

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

  return { isDuplicate: isDuplicate && !dismissed, takeOver };
}

function AppHeader() {
  const [location] = useLocation();
  const { outputOpen, outputFullscreen, openOutputWindow, closeOutputWindow } = useAppMode();
  if (location === "/output" || location === "/") return null;

  const currentMode = outputOpen ? "show" as const : "setlist" as const;

  const bgColor = outputOpen
    ? "rgba(38,38,36,0.85)"
    : "rgba(50,50,48,0.85)";

  const handleOutputOn = () => {
    openOutputWindow();
  };

  return (
    <div
      className="fixed top-3 right-3 z-50"
      style={{
        background: bgColor,
        borderRadius: "9999px",
        padding: "2px",
        backdropFilter: "blur(12px)",
      }}
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
          background: "rgba(232,121,249,0.05)",
          border: "1px solid rgba(232,121,249,0.2)",
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
              background: "rgba(232,121,249,0.8)",
              color: "#fff",
              border: "1px solid rgba(232,121,249,0.9)",
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
  const isOutput = location === "/output";
  const isHome = location === "/";
  const { isDuplicate, takeOver } = useDuplicateGuard();

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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppModeProvider>
          <Toaster />
          <AppLayout />
        </AppModeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
