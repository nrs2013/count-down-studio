import { useEffect, useRef, useCallback, useState } from "react";
import { type CountdownStatus } from "./use-countdown";

export interface CountdownState {
  formattedTime: string;
  status: CountdownStatus;
  progress: number;
  songTitle?: string;
  artist?: string;
  nextSongTitle?: string;
  remainingSeconds: number;
  isEvent?: boolean;
  xTime?: boolean;
  isMC?: boolean;
  isEncore?: boolean;
  isCountUp?: boolean;
  elapsedSeconds?: number;
  mcTargetSeconds?: number;
  showEventInfo?: boolean;
  eventConcertTitle?: string;
  eventDoorOpen?: string | null;
  eventShowTime?: string | null;
  eventRehearsal?: string | null;
  subTimerSeconds?: number;
  subTimerRemaining?: number;
  subTimerFormatted?: string;
  subTimerActive?: boolean;
  // Concert End Summary (shown on sub-display when the director ends the show)
  showConcertSummary?: boolean;
  summaryTotalMs?: number;
  summaryMcSegments?: number[]; // each MC (MC1, MC2, …) in milliseconds
  summaryEncoreSegments?: number[]; // each ENCORE (EN1, EN2, …) in milliseconds
  summaryStartTime?: string;
  summaryEndTime?: string;
  summaryDate?: string; // e.g. "2026.04.24 (Thu)" — the show's date, printed on the closing card
  summaryConcertTitle?: string; // the setlist's name, e.g. "Starlight Tour 2026 Final"
}

const LS_KEY = "countdown-state";
const LS_PING_KEY = "countdown-ping";
const LS_OUTPUT_ALIVE_KEY = "countdown-output-alive";
const LS_OUTPUT_FS_KEY = "countdown-output-fullscreen";
const BC_CHANNEL_NAME = "songcountdown-sync";
const PM_TYPE = "songcountdown-state";
const PM_PING_TYPE = "songcountdown-ping";

export function closeOutputWindowExternal() {
  try { localStorage.removeItem(LS_OUTPUT_ALIVE_KEY); } catch (_) {}
  try { localStorage.setItem(LS_PING_KEY, JSON.stringify({ type: "request-close", _ts: Date.now() })); } catch (_) {}
  try {
    const bc = new BroadcastChannel(BC_CHANNEL_NAME);
    bc.postMessage({ type: "request-close" });
    bc.close();
  } catch (_) {}
}

export function useCountdownBroadcaster() {
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputFullscreen, setOutputFullscreen] = useState(false);
  const outputWindowRef = useRef<Window | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const lastStateRef = useRef<CountdownState>({
    formattedTime: "--:--",
    status: "idle",
    progress: 0,
    remainingSeconds: 0,
  });

  useEffect(() => {
    try {
      bcRef.current = new BroadcastChannel(BC_CHANNEL_NAME);
    } catch (_) {}
    return () => {
      try { bcRef.current?.close(); } catch (_) {}
    };
  }, []);

  const isOutputWindowAlive = useCallback((): boolean => {
    if (outputWindowRef.current) {
      try {
        if (!outputWindowRef.current.closed) {
          return true;
        }
      } catch (_) {}
      outputWindowRef.current = null;
    }
    const alive = localStorage.getItem(LS_OUTPUT_ALIVE_KEY);
    if (alive) {
      try {
        const ts = parseInt(alive, 10);
        if (Date.now() - ts < 5000) {
          return true;
        }
      } catch (_) {}
    }
    return false;
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LS_PING_KEY && e.newValue) {
        try {
          const msg = JSON.parse(e.newValue);
          if (msg.type === "output-alive") {
            setOutputOpen(true);
          }
          if (msg.type === "output-closed") {
            setOutputOpen(false);
            setOutputFullscreen(false);
          }
          if (msg.type === "output-fullscreen") {
            setOutputFullscreen(!!msg.fullscreen);
          }
          if (msg.type === "request-state") {
            if (lastStateRef.current.songTitle || lastStateRef.current.status !== "idle") {
              localStorage.setItem(LS_KEY, JSON.stringify({ ...lastStateRef.current, _ts: Date.now() }));
            }
          }
        } catch (_) {}
      }
    };
    window.addEventListener("storage", handleStorage);

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === PM_PING_TYPE) {
        if (e.data.action === "output-alive") {
          setOutputOpen(true);
        }
        if (e.data.action === "output-closed") {
          setOutputOpen(false);
          setOutputFullscreen(false);
        }
        if (e.data.action === "output-fullscreen") {
          setOutputFullscreen(!!e.data.fullscreen);
        }
        if (e.data.action === "request-state") {
          sendToOutput(lastStateRef.current);
        }
      }
    };
    window.addEventListener("message", handleMessage);

    const handleBc = (e: MessageEvent) => {
      if (e.data?.type === "output-alive") {
        setOutputOpen(true);
      }
      if (e.data?.type === "output-closed") {
        setOutputOpen(false);
        setOutputFullscreen(false);
      }
      if (e.data?.type === "output-fullscreen") {
        setOutputFullscreen(!!e.data.fullscreen);
      }
      if (e.data?.type === "request-state") {
        sendToOutput(lastStateRef.current);
      }
    };
    try { bcRef.current?.addEventListener("message", handleBc); } catch (_) {}

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("message", handleMessage);
      try { bcRef.current?.removeEventListener("message", handleBc); } catch (_) {}
    };
  }, []);

  const sendToOutput = useCallback((state: CountdownState) => {
    const data = { ...state, _ts: Date.now() };
    try {
      if (outputWindowRef.current && !outputWindowRef.current.closed) {
        outputWindowRef.current.postMessage({ type: PM_TYPE, state: data }, "*");
      }
    } catch (_) {}
    try {
      bcRef.current?.postMessage({ type: "state", state: data });
    } catch (_) {}
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (_) {}
  }, []);

  const broadcast = useCallback((state: CountdownState) => {
    lastStateRef.current = state;
    sendToOutput(state);
  }, [sendToOutput]);

  const openingRef = useRef(false);
  const secondaryScreenCache = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  const fetchAndCacheSecondary = async (): Promise<{ left: number; top: number; width: number; height: number } | null> => {
    try {
      if (!("getScreenDetails" in window)) return null;
      const sd = await (window as any).getScreenDetails();
      if (!sd?.screens || sd.screens.length < 2) return null;
      const sec = sd.screens.find((s: any) => !s.isPrimary);
      if (!sec) return null;
      const result = {
        left: sec.left ?? 0,
        top: sec.top ?? 0,
        width: sec.availWidth ?? sec.width ?? 960,
        height: sec.availHeight ?? sec.height ?? 540,
      };
      secondaryScreenCache.current = result;
      return result;
    } catch (_) {
      return secondaryScreenCache.current;
    }
  };

  useEffect(() => {
    fetchAndCacheSecondary();
  }, []);

  const openOutputWindow = useCallback(() => {
    if (openingRef.current) return;
    openingRef.current = true;

    try { localStorage.removeItem(LS_OUTPUT_ALIVE_KEY); } catch (_) {}
    try {
      if (outputWindowRef.current && !outputWindowRef.current.closed) {
        try { outputWindowRef.current.close(); } catch (_) {}
      }
    } catch (_) {}
    outputWindowRef.current = null;

    const cached = secondaryScreenCache.current;

    const features = cached
      ? `left=${cached.left},top=${cached.top},width=${cached.width},height=${cached.height},menubar=no,toolbar=no,location=no,status=no,scrollbars=no`
      : "width=960,height=540,menubar=no,toolbar=no,location=no,status=no,scrollbars=no";

    // Base URL respects Vite's base config (e.g. "/count-down-studio/" on GitHub Pages)
    const BASE_URL = import.meta.env.BASE_URL || "/";
    const w = window.open(`${BASE_URL}output?secondary=1`, "songcountdown_output", features);

    if (w) {
      outputWindowRef.current = w;
      setOutputOpen(true);

      const moveToSecondary = async () => {
        const screen = await fetchAndCacheSecondary();
        if (!screen) return;
        const doMove = () => {
          try {
            if (!w || w.closed) return;
            w.moveTo(screen.left, screen.top);
            w.resizeTo(screen.width, screen.height);
          } catch (_) {}
        };
        doMove();
        setTimeout(doMove, 100);
        setTimeout(doMove, 400);
        setTimeout(doMove, 1000);
      };

      moveToSecondary();

      try {
        w.addEventListener("load", () => {
          moveToSecondary();
          try {
            if (!w.closed && w.document?.documentElement?.requestFullscreen) {
              w.document.documentElement.requestFullscreen().catch(() => {});
            }
          } catch (_) {}
        });
      } catch (_) {}

      try {
        if (w.document?.documentElement?.requestFullscreen) {
          w.document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch (_) {}

      const sendInitial = () => {
        sendToOutput(lastStateRef.current);
      };
      setTimeout(sendInitial, 300);
      setTimeout(sendInitial, 1000);
      setTimeout(sendInitial, 2500);
    }

    setTimeout(() => { openingRef.current = false; }, 2500);
  }, [sendToOutput]);

  const closeOutputWindow = useCallback(() => {
    try { localStorage.removeItem(LS_OUTPUT_ALIVE_KEY); } catch (_) {}

    const sendCloseSignals = () => {
      try {
        localStorage.setItem(LS_PING_KEY, JSON.stringify({ type: "request-close", _ts: Date.now() }));
      } catch (_) {}
      try {
        bcRef.current?.postMessage({ type: "request-close" });
      } catch (_) {}
      try {
        if (outputWindowRef.current && !outputWindowRef.current.closed) {
          outputWindowRef.current.postMessage({ type: PM_PING_TYPE, action: "request-close" }, "*");
        }
      } catch (_) {}
    };

    sendCloseSignals();

    const tryCloseWindow = () => {
      try {
        if (outputWindowRef.current && !outputWindowRef.current.closed) {
          outputWindowRef.current.close();
        }
      } catch (_) {}
    };

    tryCloseWindow();
    setTimeout(() => { sendCloseSignals(); tryCloseWindow(); }, 200);
    setTimeout(() => { sendCloseSignals(); tryCloseWindow(); }, 500);
    setTimeout(() => { sendCloseSignals(); tryCloseWindow(); }, 1000);
    setTimeout(() => { sendCloseSignals(); tryCloseWindow(); }, 2000);

    setTimeout(() => {
      try { localStorage.removeItem(LS_OUTPUT_ALIVE_KEY); } catch (_) {}
      outputWindowRef.current = null;
    }, 2500);

    setOutputOpen(false);
    setOutputFullscreen(false);
  }, []);

  const toggleOutputWindow = useCallback(() => {
    if (outputOpen) {
      closeOutputWindow();
    } else {
      openOutputWindow();
    }
  }, [outputOpen, closeOutputWindow, openOutputWindow]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try { localStorage.removeItem(LS_OUTPUT_ALIVE_KEY); } catch (_) {}
      try {
        localStorage.setItem(LS_PING_KEY, JSON.stringify({ type: "request-close", _ts: Date.now() }));
      } catch (_) {}
      try {
        bcRef.current?.postMessage({ type: "request-close" });
      } catch (_) {}
      try {
        if (outputWindowRef.current && !outputWindowRef.current.closed) {
          outputWindowRef.current.postMessage({ type: PM_PING_TYPE, action: "request-close" }, "*");
          outputWindowRef.current.close();
        }
      } catch (_) {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    const checkClosed = setInterval(() => {
      if (outputOpen && !isOutputWindowAlive()) {
        setOutputOpen(false);
        setOutputFullscreen(false);
        outputWindowRef.current = null;
      }
    }, 2000);
    return () => clearInterval(checkClosed);
  }, [outputOpen, isOutputWindowAlive]);

  useEffect(() => {
    const checkFs = setInterval(() => {
      if (!outputOpen) {
        if (outputFullscreen) setOutputFullscreen(false);
        return;
      }
      try {
        const raw = localStorage.getItem(LS_OUTPUT_FS_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          setOutputFullscreen(!!data.fullscreen);
        }
      } catch (_) {}
    }, 1000);
    return () => clearInterval(checkFs);
  }, [outputOpen, outputFullscreen]);

  const requestOutputFullscreen = useCallback(() => {
    try {
      const w = outputWindowRef.current;
      if (w && !w.closed) {
        const doc = w.document;
        if (doc?.documentElement?.requestFullscreen) {
          doc.documentElement.requestFullscreen().catch(() => {});
          return;
        }
      }
    } catch (_) {}
    try {
      outputWindowRef.current?.postMessage({ type: "songcountdown-request-fullscreen" }, "*");
    } catch (_) {}
    try {
      bcRef.current?.postMessage({ type: "songcountdown-request-fullscreen" });
    } catch (_) {}
  }, []);

  return { broadcast, openOutputWindow, closeOutputWindow, toggleOutputWindow, outputOpen, outputFullscreen, requestOutputFullscreen };
}

export function useCountdownReceiver() {
  const [state, setState] = useState<CountdownState>({
    formattedTime: "--:--",
    status: "idle",
    progress: 0,
    remainingSeconds: 0,
  });
  const lastTsRef = useRef(0);

  const applyState = useCallback((data: Record<string, unknown>) => {
    const ts = (data._ts as number) || 0;
    if (ts <= lastTsRef.current) return;
    lastTsRef.current = ts;
    const { _ts, ...rest } = data;
    setState(rest as CountdownState);
  }, []);

  useEffect(() => {
    let bcChannel: BroadcastChannel | null = null;
    let aliveInterval: ReturnType<typeof setInterval>;
    let pollInterval: ReturnType<typeof setInterval>;

    const updateAlive = () => {
      try {
        localStorage.setItem(LS_OUTPUT_ALIVE_KEY, Date.now().toString());
      } catch (_) {}
    };

    const readFromStorage = () => {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        applyState(parsed);
      } catch (_) {}
    };

    const doClose = async () => {
      try { localStorage.removeItem(LS_OUTPUT_ALIVE_KEY); } catch (_) {}
      clearInterval(aliveInterval);
      clearInterval(pollInterval);
      notifyParentClosed();

      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch (_) {}

      try { window.close(); } catch (_) {}

      setTimeout(() => {
        if (!window.closed) {
          try { window.close(); } catch (_) {}
        }
      }, 300);

      setTimeout(() => {
        if (!window.closed) {
          document.title = "CLOSED";
          document.body.innerHTML = '<div style="position:fixed;inset:0;background:#000;display:flex;align-items:center;justify-content:center;font-family:sans-serif;color:#555;font-size:18px;letter-spacing:2px;">WINDOW CLOSED — Please close this tab manually</div>';
        }
      }, 600);
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY && e.newValue) {
        try {
          applyState(JSON.parse(e.newValue));
        } catch (_) {}
      }
      if (e.key === LS_PING_KEY && e.newValue) {
        try {
          const msg = JSON.parse(e.newValue);
          if (msg.type === "request-close") {
            doClose();
          }
        } catch (_) {}
      }
    };

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === PM_TYPE && e.data.state) {
        applyState(e.data.state);
      }
      if (e.data?.type === PM_PING_TYPE && e.data.action === "request-close") {
        doClose();
      }
    };

    const notifyParentClosed = () => {
      try {
        localStorage.removeItem(LS_OUTPUT_ALIVE_KEY);
        localStorage.setItem(LS_PING_KEY, JSON.stringify({ type: "output-closed", _ts: Date.now() }));
      } catch (_) {}
      try {
        if (window.opener) {
          window.opener.postMessage({ type: PM_PING_TYPE, action: "output-closed" }, "*");
        }
      } catch (_) {}
      try {
        bcChannel?.postMessage({ type: "output-closed" });
      } catch (_) {}
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("message", handleMessage);

    try {
      bcChannel = new BroadcastChannel(BC_CHANNEL_NAME);
      bcChannel.addEventListener("message", (e: MessageEvent) => {
        if (e.data?.type === "state" && e.data.state) {
          applyState(e.data.state);
        }
        if (e.data?.type === "request-close") {
          doClose();
        }
      });
    } catch (_) {}

    updateAlive();

    try {
      localStorage.setItem(LS_PING_KEY, JSON.stringify({ type: "output-alive", _ts: Date.now() }));
      localStorage.setItem(LS_PING_KEY, JSON.stringify({ type: "request-state", _ts: Date.now() }));
    } catch (_) {}

    try {
      if (window.opener) {
        window.opener.postMessage({ type: PM_PING_TYPE, action: "output-alive" }, "*");
        window.opener.postMessage({ type: PM_PING_TYPE, action: "request-state" }, "*");
      }
    } catch (_) {}
    try {
      bcChannel?.postMessage({ type: "output-alive" });
      bcChannel?.postMessage({ type: "request-state" });
    } catch (_) {}

    aliveInterval = setInterval(updateAlive, 2000);

    readFromStorage();

    pollInterval = setInterval(readFromStorage, 200);

    const handleUnload = () => {
      notifyParentClosed();
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("beforeunload", handleUnload);
      clearInterval(aliveInterval);
      clearInterval(pollInterval);
      try { bcChannel?.close(); } catch (_) {}
      notifyParentClosed();
    };
  }, [applyState]);

  return state;
}
