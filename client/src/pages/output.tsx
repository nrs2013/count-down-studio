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
  // Cinematic-theater typography:
  //   - Cormorant Garamond (italic thin) for the title — movie-credit / program-book elegance
  //   - Archivo (ultra-thin, tabular) for big numbers — sleek, modern, not "programmer mono"
  //   - Archivo (500 uppercase, wide-spaced) for labels
  const SERIF = "'Cormorant Garamond', 'Playfair Display', Georgia, serif";
  const DISPLAY = "'Archivo', 'Inter', system-ui, sans-serif";

  const StatColumn = ({
    label,
    value,
    size = "md",
    accent,
  }: {
    label: string;
    value: string;
    size?: "xl" | "md" | "sm";
    accent?: boolean;
  }) => {
    const valueSize = size === "xl" ? 180 : size === "md" ? 78 : 44;
    const labelSize = size === "xl" ? 15 : size === "md" ? 12 : 11;
    const valueWeight = size === "xl" ? 100 : 200;
    return (
      <div className="flex flex-col items-center">
        <div
          style={{
            fontFamily: DISPLAY,
            letterSpacing: "0.4em",
            fontSize: labelSize,
            fontWeight: 500,
            color: accent ? "rgba(232,176,74,0.85)" : "rgba(168,168,160,0.6)",
            marginBottom: size === "xl" ? 22 : 12,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: DISPLAY,
            fontSize: valueSize,
            fontWeight: valueWeight,
            lineHeight: 1,
            color: accent ? "#f0c77a" : "#e8e8e2",
            letterSpacing: size === "xl" ? "0.02em" : "0.04em",
            fontVariantNumeric: "tabular-nums",
            textShadow: accent ? "0 0 60px rgba(232,176,74,0.3)" : "none",
          }}
        >
          {value}
        </div>
      </div>
    );
  };

  return (
    <div
      className="w-screen h-screen flex flex-col items-center justify-center"
      style={{
        background: "#0c0b0a",
        backgroundImage:
          "radial-gradient(ellipse 55% 40% at 50% 28%, rgba(232,176,74,0.1), transparent 65%), radial-gradient(ellipse 85% 60% at 50% 100%, rgba(193,134,200,0.06), transparent 65%)",
        animation: "summaryFadeIn 1.4s ease-out forwards",
      }}
      data-testid="concert-summary"
    >
      {/* Elegant italic serif heading — like a program book closing page */}
      <div
        style={{
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: 92,
          fontWeight: 300,
          color: "rgba(232,176,74,0.95)",
          marginBottom: 4,
          letterSpacing: "0.01em",
          lineHeight: 1,
        }}
      >
        End of Show
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: 22,
          fontWeight: 300,
          color: "rgba(168,168,160,0.55)",
          marginBottom: 68,
          letterSpacing: "0.15em",
        }}
      >
        ——  thank you for tonight  ——
      </div>

      {/* Central TOTAL TIME — huge, thin display number, amber glow */}
      <div style={{ marginBottom: 68 }}>
        <StatColumn label="Total Time" value={formatHMS(totalMs)} size="xl" accent />
      </div>

      {/* MC / ENCORE side by side — mid size */}
      <div className="flex items-start" style={{ gap: 140, marginBottom: 56 }}>
        <StatColumn label="MC Time" value={formatHMS(mcMs)} size="md" />
        <div style={{ width: 1, height: 100, background: "rgba(168,168,160,0.18)", marginTop: 28 }} />
        <StatColumn label="Encore Time" value={formatHMS(encoreMs)} size="md" />
      </div>

      {/* Thin amber divider */}
      <div
        style={{
          width: 220,
          height: 1,
          background: "linear-gradient(to right, transparent, rgba(232,176,74,0.35), transparent)",
          marginBottom: 40,
        }}
      />

      {/* START / END wall clocks — small, sleek */}
      <div className="flex items-start" style={{ gap: 140 }}>
        <StatColumn label="Start Time" value={startTime || "--:--:--"} size="sm" />
        <StatColumn label="End Time" value={endTime || "--:--:--"} size="sm" />
      </div>

      <style>{`
        @keyframes summaryFadeIn {
          0% { opacity: 0; transform: translateY(8px) scale(0.99); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
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
