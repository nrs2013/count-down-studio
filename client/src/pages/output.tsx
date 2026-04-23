import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useCountdownReceiver } from "@/hooks/use-countdown-broadcast";
import { CountdownDisplay } from "@/components/countdown-display";
import { EventInfoDisplay } from "@/components/event-info-display";

// ===== Concert End Summary =====
// Displayed on the sub-display when the director presses "End Show" in the main app.
// Shows TOTAL / MC / ENCORE elapsed times plus START / END wall-clock times,
// styled to feel like a curtain-call closing card (warm dark canvas + amber accent).
function formatHMS(ms: number): string {
  if (!ms || ms < 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ConcertSummaryDisplay({
  totalMs,
  mcMs,
  encoreMs,
  startTime,
  endTime,
}: {
  totalMs: number;
  mcMs: number;
  encoreMs: number;
  startTime: string;
  endTime: string;
}) {
  const MONO = "'JetBrains Mono', 'Roboto Mono', monospace";
  const UI = "'Noto Sans JP', 'Inter', sans-serif";

  const StatRow = ({
    label,
    value,
    big,
    accent,
  }: {
    label: string;
    value: string;
    big?: boolean;
    accent?: boolean;
  }) => (
    <div className="flex flex-col items-center">
      <div
        style={{
          fontFamily: UI,
          letterSpacing: "0.28em",
          fontSize: big ? 18 : 14,
          fontWeight: 700,
          color: accent ? "#e8b04a" : "#76766f",
          marginBottom: big ? 14 : 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: big ? 120 : 52,
          fontWeight: 300,
          lineHeight: 1,
          color: accent ? "#f0c77a" : "#e8e8e2",
          letterSpacing: "0.04em",
          textShadow: accent ? "0 0 40px rgba(232,176,74,0.25)" : "none",
        }}
      >
        {value}
      </div>
    </div>
  );

  return (
    <div
      className="w-screen h-screen flex flex-col items-center justify-center"
      style={{
        background: "#0c0b0a",
        backgroundImage:
          "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(232,176,74,0.08), transparent 65%), radial-gradient(ellipse 80% 60% at 50% 100%, rgba(193,134,200,0.06), transparent 65%)",
        animation: "summaryFadeIn 1.2s ease-out forwards",
      }}
      data-testid="concert-summary"
    >
      {/* Heading */}
      <div
        style={{
          fontFamily: UI,
          fontSize: 28,
          letterSpacing: "0.5em",
          color: "rgba(232,176,74,0.9)",
          fontWeight: 700,
          marginBottom: 12,
          textTransform: "uppercase",
        }}
      >
        End of Show
      </div>
      <div
        style={{
          fontFamily: UI,
          fontSize: 14,
          letterSpacing: "0.3em",
          color: "#5a5a54",
          marginBottom: 64,
          textTransform: "uppercase",
        }}
      >
        Thank you for tonight
      </div>

      {/* Central TOTAL TIME */}
      <div style={{ marginBottom: 72 }}>
        <StatRow label="Total Time" value={formatHMS(totalMs)} big accent />
      </div>

      {/* MC / ENCORE side by side */}
      <div
        className="flex items-start"
        style={{ gap: 120, marginBottom: 64 }}
      >
        <StatRow label="MC Time" value={formatHMS(mcMs)} />
        <div style={{ width: 1, height: 80, background: "rgba(168,168,160,0.2)" }} />
        <StatRow label="Encore Time" value={formatHMS(encoreMs)} />
      </div>

      {/* Divider */}
      <div style={{ width: 180, height: 1, background: "rgba(232,176,74,0.25)", marginBottom: 40 }} />

      {/* START / END wall clocks */}
      <div className="flex items-start" style={{ gap: 120 }}>
        <div className="flex flex-col items-center">
          <div
            style={{
              fontFamily: UI,
              letterSpacing: "0.28em",
              fontSize: 12,
              fontWeight: 700,
              color: "#76766f",
              marginBottom: 6,
            }}
          >
            Start Time
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 36,
              fontWeight: 300,
              color: "#a8a8a0",
              letterSpacing: "0.05em",
            }}
          >
            {startTime || "--:--:--"}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div
            style={{
              fontFamily: UI,
              letterSpacing: "0.28em",
              fontSize: 12,
              fontWeight: 700,
              color: "#76766f",
              marginBottom: 6,
            }}
          >
            End Time
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 36,
              fontWeight: 300,
              color: "#a8a8a0",
              letterSpacing: "0.05em",
            }}
          >
            {endTime || "--:--:--"}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes summaryFadeIn {
          0% { opacity: 0; transform: scale(0.98); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

export default function Output() {
  const [, setLocation] = useLocation();
  const isLegitOutput = typeof window !== "undefined" &&
    (window.opener !== null || new URLSearchParams(window.location.search).has("secondary"));

  useEffect(() => {
    if (!isLegitOutput) {
      setLocation("/");
    }
  }, [isLegitOutput, setLocation]);

  const state = useCountdownReceiver();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const secondaryRef = useRef<any>(null);

  useEffect(() => {
    document.title = "Output - COUNT DOWN STUDIO";
  }, []);

  useEffect(() => {
    if (!isLegitOutput) return;
    const tryAutoFullscreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (_) {}
    };
    tryAutoFullscreen();
    const t = setTimeout(tryAutoFullscreen, 500);
    return () => clearTimeout(t);
  }, [isLegitOutput]);

  useEffect(() => {
    const cacheSecondary = async () => {
      try {
        if (!("getScreenDetails" in window)) return;
        const details = await (window as any).getScreenDetails();
        if (!details?.screens || details.screens.length < 2) return;
        const sec = details.screens.find((s: any) => !s.isPrimary);
        if (sec) secondaryRef.current = sec;
      } catch (_) {}
    };
    cacheSecondary();
  }, []);

  const goFullscreenOnSecondary = useCallback(async () => {
    try {
      if (secondaryRef.current) {
        await document.documentElement.requestFullscreen({ screen: secondaryRef.current } as any);
        return;
      }
      if ("getScreenDetails" in window) {
        const details = await (window as any).getScreenDetails();
        if (details?.screens) {
          const sec = details.screens.find((s: any) => !s.isPrimary);
          if (sec) {
            secondaryRef.current = sec;
            await document.documentElement.requestFullscreen({ screen: sec } as any);
            return;
          }
        }
      }
      await document.documentElement.requestFullscreen();
    } catch (_) {
      try { await document.documentElement.requestFullscreen(); } catch (_e) {}
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      await goFullscreenOnSecondary();
    }
  }, [goFullscreenOnSecondary]);

  const notifyFullscreenStatus = useCallback((fs: boolean) => {
    try {
      localStorage.setItem("countdown-output-fullscreen", JSON.stringify({ fullscreen: fs, _ts: Date.now() }));
    } catch (_) {}
    try {
      localStorage.setItem("countdown-ping", JSON.stringify({ type: "output-fullscreen", fullscreen: fs, _ts: Date.now() }));
    } catch (_) {}
    try {
      if (window.opener) {
        window.opener.postMessage({ type: "songcountdown-ping", action: "output-fullscreen", fullscreen: fs }, "*");
      }
    } catch (_) {}
    try {
      const bc = new BroadcastChannel("songcountdown-sync");
      bc.postMessage({ type: "output-fullscreen", fullscreen: fs });
      bc.close();
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) setShowHint(false);
      notifyFullscreenStatus(fs);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [notifyFullscreenStatus]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "songcountdown-request-fullscreen") {
        goFullscreenOnSecondary();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [goFullscreenOnSecondary]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F" || ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F"))) {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleFullscreen]);

  useEffect(() => {
    let lastClick = 0;
    const handler = () => {
      const now = Date.now();
      if (now - lastClick < 400) {
        toggleFullscreen();
      } else if (!isFullscreen) {
        goFullscreenOnSecondary();
      }
      lastClick = now;
    };
    window.addEventListener("click", handler);
    window.addEventListener("touchend", handler);
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("touchend", handler);
    };
  }, [toggleFullscreen, isFullscreen, goFullscreenOnSecondary]);

  useEffect(() => {
    if (showHint) {
      const t = setTimeout(() => setShowHint(false), 8000);
      return () => clearTimeout(t);
    }
  }, [showHint]);

  return (
    <div
      className="w-screen h-screen bg-black overflow-hidden cursor-none relative"
      data-testid="output-page"
    >
      {state.showConcertSummary ? (
        <ConcertSummaryDisplay
          totalMs={state.summaryTotalMs || 0}
          mcMs={state.summaryMcMs || 0}
          encoreMs={state.summaryEncoreMs || 0}
          startTime={state.summaryStartTime || ""}
          endTime={state.summaryEndTime || ""}
        />
      ) : state.showEventInfo ? (
        <EventInfoDisplay
          concertTitle={state.eventConcertTitle || ""}
          doorOpen={state.eventDoorOpen || null}
          showTime={state.eventShowTime || null}
          rehearsal={state.eventRehearsal || null}
        />
      ) : (
        <CountdownDisplay
          formattedTime={state.formattedTime}
          status={state.status}
          progress={state.progress}
          songTitle={state.songTitle}
          nextSongTitle={state.nextSongTitle}
          remainingSeconds={state.remainingSeconds}
          isEvent={state.isEvent}
          xTime={state.xTime}
          isMC={state.isMC}
          isEncore={state.isEncore}
          isCountUp={state.isCountUp}
          elapsedSeconds={state.elapsedSeconds}
          mcTargetSeconds={state.mcTargetSeconds}
          subTimerFormatted={state.subTimerFormatted}
          subTimerRemaining={state.subTimerRemaining}
          subTimerSeconds={state.subTimerSeconds}
          subTimerActive={state.subTimerActive}
        />
      )}

      {!isFullscreen && showHint && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          style={{
            animation: "fadeOut 8s ease-in forwards",
          }}
        >
          <div
            className="flex items-center gap-3 px-5 py-2.5 rounded-full"
            style={{
              background: "rgba(0,0,0,0.7)",
              border: "1px solid rgba(6,182,212,0.2)",
              backdropFilter: "blur(8px)",
            }}
          >
            <span
              className="text-[11px] font-medium tracking-wider"
              style={{ color: "rgba(6,182,212,0.7)" }}
            >
              Click or press
            </span>
            <kbd
              className="px-2 py-0.5 rounded text-[11px] font-bold"
              style={{
                background: "rgba(6,182,212,0.15)",
                border: "1px solid rgba(6,182,212,0.3)",
                color: "#22d3ee",
              }}
            >
              F
            </kbd>
            <span
              className="text-[11px] font-medium tracking-wider"
              style={{ color: "rgba(6,182,212,0.7)" }}
            >
              for fullscreen
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeOut {
          0%, 70% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
