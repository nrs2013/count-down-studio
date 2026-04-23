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
  mcSegments,
  encoreSegments,
  startTime,
  endTime,
}: {
  totalMs: number;
  mcSegments: number[];
  encoreSegments: number[];
  startTime: string;
  endTime: string;
}) {
  // Cinematic-theater typography: elegant italic serif for titles, thin Archivo for numbers.
  const SERIF = "'Cormorant Garamond', 'Playfair Display', Georgia, serif";
  const DISPLAY = "'Archivo', 'Inter', system-ui, sans-serif";

  const SegmentList = ({
    title,
    label,
    segments,
  }: {
    title: string;
    label: string;
    segments: number[];
  }) => (
    <div className="flex flex-col items-start" style={{ minWidth: 240 }}>
      <div
        style={{
          fontFamily: DISPLAY,
          letterSpacing: "0.4em",
          fontSize: 13,
          fontWeight: 500,
          color: "rgba(168,168,160,0.6)",
          marginBottom: 18,
          textTransform: "uppercase",
          alignSelf: "center",
        }}
      >
        {title}
      </div>
      {segments.length === 0 ? (
        <div
          style={{
            fontFamily: DISPLAY,
            fontSize: 22,
            fontWeight: 200,
            color: "rgba(168,168,160,0.3)",
            alignSelf: "center",
            letterSpacing: "0.1em",
          }}
        >
          —
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full">
          {segments.map((ms, i) => (
            <div key={i} className="flex items-baseline justify-between w-full" style={{ gap: 28 }}>
              <div
                style={{
                  fontFamily: DISPLAY,
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: "0.28em",
                  color: "rgba(168,168,160,0.55)",
                  textTransform: "uppercase",
                  minWidth: 60,
                }}
              >
                {label} {i + 1}
              </div>
              <div
                style={{
                  fontFamily: DISPLAY,
                  fontSize: 34,
                  fontWeight: 200,
                  lineHeight: 1,
                  color: "#e8e8e2",
                  letterSpacing: "0.04em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatHMS(ms)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="w-screen h-screen flex flex-col items-center justify-center overflow-auto py-8"
      style={{
        background: "#0c0b0a",
        backgroundImage:
          "radial-gradient(ellipse 55% 40% at 50% 28%, rgba(232,176,74,0.1), transparent 65%), radial-gradient(ellipse 85% 60% at 50% 100%, rgba(193,134,200,0.06), transparent 65%)",
        animation: "summaryFadeIn 1.4s ease-out forwards",
      }}
      data-testid="concert-summary"
    >
      {/* Elegant italic serif heading */}
      <div
        style={{
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: 88,
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
          fontSize: 20,
          fontWeight: 300,
          color: "rgba(168,168,160,0.55)",
          marginBottom: 52,
          letterSpacing: "0.15em",
        }}
      >
        ——  thank you for tonight  ——
      </div>

      {/* Central TOTAL TIME — huge, thin display number, amber glow */}
      <div className="flex flex-col items-center" style={{ marginBottom: 52 }}>
        <div
          style={{
            fontFamily: DISPLAY,
            letterSpacing: "0.4em",
            fontSize: 15,
            fontWeight: 500,
            color: "rgba(232,176,74,0.85)",
            marginBottom: 20,
            textTransform: "uppercase",
          }}
        >
          Total Time
        </div>
        <div
          style={{
            fontFamily: DISPLAY,
            fontSize: 160,
            fontWeight: 100,
            lineHeight: 1,
            color: "#f0c77a",
            letterSpacing: "0.02em",
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 0 60px rgba(232,176,74,0.3)",
          }}
        >
          {formatHMS(totalMs)}
        </div>
      </div>

      {/* MC / ENCORE breakdowns — listed individually (MC 1, MC 2, …) */}
      <div className="flex items-start" style={{ gap: 80, marginBottom: 48 }}>
        <SegmentList title="MC Breakdown" label="MC" segments={mcSegments} />
        <div style={{ width: 1, height: "100%", minHeight: 60, background: "rgba(168,168,160,0.18)" }} />
        <SegmentList title="Encore Breakdown" label="EN" segments={encoreSegments} />
      </div>

      {/* Thin amber divider */}
      <div
        style={{
          width: 220,
          height: 1,
          background: "linear-gradient(to right, transparent, rgba(232,176,74,0.35), transparent)",
          marginBottom: 32,
        }}
      />

      {/* START / END wall clocks */}
      <div className="flex items-start" style={{ gap: 120 }}>
        <div className="flex flex-col items-center">
          <div
            style={{
              fontFamily: DISPLAY,
              letterSpacing: "0.4em",
              fontSize: 11,
              fontWeight: 500,
              color: "rgba(168,168,160,0.6)",
              marginBottom: 10,
              textTransform: "uppercase",
            }}
          >
            Start Time
          </div>
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: 40,
              fontWeight: 200,
              lineHeight: 1,
              color: "#e8e8e2",
              letterSpacing: "0.04em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {startTime || "--:--:--"}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div
            style={{
              fontFamily: DISPLAY,
              letterSpacing: "0.4em",
              fontSize: 11,
              fontWeight: 500,
              color: "rgba(168,168,160,0.6)",
              marginBottom: 10,
              textTransform: "uppercase",
            }}
          >
            End Time
          </div>
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: 40,
              fontWeight: 200,
              lineHeight: 1,
              color: "#e8e8e2",
              letterSpacing: "0.04em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {endTime || "--:--:--"}
          </div>
        </div>
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
          mcSegments={state.summaryMcSegments || []}
          encoreSegments={state.summaryEncoreSegments || []}
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
