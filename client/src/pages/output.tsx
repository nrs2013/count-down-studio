import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
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

// Same design-canvas approach as CountdownDisplay — 1920x1080 fixed layout,
// scaled to fit whatever screen it's on. Guarantees a single 16:9 frame.
const SUMMARY_DESIGN_W = 1920;
const SUMMARY_DESIGN_H = 1080;

function ConcertSummaryDisplay({
  totalMs,
  mcSegments,
  encoreSegments,
  startTime,
  endTime,
  date,
  concertTitle,
}: {
  totalMs: number;
  mcSegments: number[];
  encoreSegments: number[];
  startTime: string;
  endTime: string;
  date: string;
  concertTitle: string;
}) {
  // Cinematic-theater typography.
  const SERIF = "'Cormorant Garamond', 'Playfair Display', Georgia, serif";
  const DISPLAY = "'Archivo', 'Inter', system-ui, sans-serif";

  // Fit the 1920x1080 design canvas inside whatever viewport we're given — same
  // algorithm as CountdownDisplay so the two screens behave identically.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const updateScale = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const sx = rect.width / SUMMARY_DESIGN_W;
    const sy = rect.height / SUMMARY_DESIGN_H;
    setScale(Math.min(sx, sy));
  }, []);
  useLayoutEffect(() => {
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  // Auto-shrink concert title (now displayed as a sub-hero under "End of Show").
  const titleLen = concertTitle?.length || 0;
  const subtitleFontSize = titleLen > 40 ? 32 : titleLen > 28 ? 42 : titleLen > 18 ? 52 : 60;

  // Auto-shrink per-row number in breakdowns if there are many (cap at 5 typical,
  // handle up to 8 gracefully).
  const maxRows = Math.max(mcSegments.length, encoreSegments.length, 1);
  const rowValueSize = maxRows > 6 ? 30 : maxRows > 4 ? 38 : 46;
  const rowGap = maxRows > 6 ? 4 : maxRows > 4 ? 6 : 8;

  // ---- Inner sub-components (coord system = 1920x1080 design px) ----
  const SegmentCard = ({
    title,
    label,
    segments,
  }: {
    title: string;
    label: string;
    segments: number[];
  }) => (
    <div
      style={{
        width: 620,
        padding: "28px 44px",
        background: "rgba(255,255,255,0.018)",
        border: "1px solid rgba(232,176,74,0.14)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: DISPLAY,
          letterSpacing: "0.5em",
          fontSize: 22,
          fontWeight: 500,
          color: "rgba(232,176,74,0.8)",
          marginBottom: 18,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {title}
      </div>
      {segments.length === 0 ? (
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: 26,
            fontWeight: 300,
            color: "rgba(168,168,160,0.35)",
            textAlign: "center",
            padding: "14px 0",
          }}
        >
          — none —
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: rowGap }}>
          {segments.map((ms, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 20,
                paddingBottom: 6,
                borderBottom: i === segments.length - 1 ? "none" : "1px solid rgba(168,168,160,0.08)",
              }}
            >
              <div
                style={{
                  fontFamily: DISPLAY,
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: "0.3em",
                  color: "rgba(168,168,160,0.75)",
                  textTransform: "uppercase",
                }}
              >
                {label} {i + 1}
              </div>
              <div
                style={{
                  fontFamily: DISPLAY,
                  fontSize: rowValueSize,
                  fontWeight: 200,
                  lineHeight: 1,
                  color: "#d8d8d8",
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

  const ClockStat = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div
        style={{
          fontFamily: DISPLAY,
          letterSpacing: "0.5em",
          fontSize: 18,
          fontWeight: 500,
          color: "rgba(168,168,160,0.7)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 68,
          fontWeight: 200,
          lineHeight: 1,
          color: "#d8d8d8",
          letterSpacing: "0.05em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value || "--:--:--"}
      </div>
    </div>
  );

  // OUTER: fills the viewport. INNER: a fixed 1920x1080 design canvas scaled to fit.
  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center select-none overflow-hidden"
      style={{
        background: "#0c0b0a",
        backgroundImage:
          "radial-gradient(ellipse 55% 40% at 50% 22%, rgba(232,176,74,0.12), transparent 65%), radial-gradient(ellipse 85% 60% at 50% 100%, rgba(212,146,90,0.07), transparent 65%)",
        animation: "summaryFadeIn 1.6s ease-out forwards",
      }}
      data-testid="concert-summary"
    >
      <div
        style={{
          width: SUMMARY_DESIGN_W,
          height: SUMMARY_DESIGN_H,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {/* Inner layout — absolute values on a 1920x1080 design canvas.
            Vertical budget (after 40+40 padding = 80 used, 1000 available):
              hero band ~230 / total time ~260 / breakdowns ~340 / footer ~120
              + 3 gaps from space-between ≈ fits in 1000 */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "40px 80px",
          }}
        >
          {/* ====== HERO BAND: END OF SHOW (grand) → Concert Title (sub) → Date ====== */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Tiny top accent line */}
            <div
              style={{
                width: 120,
                height: 1,
                background: "linear-gradient(to right, transparent, rgba(232,176,74,0.5), transparent)",
                marginBottom: 12,
              }}
            />
            {/* "End of Show" — grand italic serif, main hero */}
            <div
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 160,
                fontWeight: 400,
                color: "#f2e3c2",
                letterSpacing: "0.005em",
                lineHeight: 0.95,
                textAlign: "center",
                textShadow: "0 0 80px rgba(232,176,74,0.3)",
              }}
            >
              End of Show
            </div>
            {/* Concert Title — sub-hero, uppercase display letterspaced for program-book feel */}
            <div
              style={{
                fontFamily: DISPLAY,
                fontSize: subtitleFontSize,
                fontWeight: 300,
                color: "rgba(232,176,74,0.85)",
                letterSpacing: "0.15em",
                textAlign: "center",
                marginTop: 18,
                maxWidth: 1600,
                padding: "0 40px",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {concertTitle || "Untitled Concert"}
            </div>
            {/* Date — small amber, tabular */}
            {date ? (
              <div
                style={{
                  fontFamily: DISPLAY,
                  fontSize: 22,
                  fontWeight: 300,
                  color: "rgba(232,176,74,0.6)",
                  letterSpacing: "0.35em",
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 12,
                }}
              >
                {date}
              </div>
            ) : null}
          </div>

          {/* ====== TOTAL TIME — hero stat ====== */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "22px 100px 28px",
              background: "rgba(232,176,74,0.03)",
              border: "1px solid rgba(232,176,74,0.25)",
              borderRadius: 12,
              boxShadow: "0 0 140px rgba(232,176,74,0.1) inset",
            }}
          >
            <div
              style={{
                fontFamily: DISPLAY,
                letterSpacing: "0.55em",
                fontSize: 22,
                fontWeight: 500,
                color: "rgba(232,176,74,0.95)",
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              Total Time
            </div>
            <div
              style={{
                fontFamily: DISPLAY,
                fontSize: 180,
                fontWeight: 100,
                lineHeight: 0.9,
                color: "#f0c77a",
                letterSpacing: "0.02em",
                fontVariantNumeric: "tabular-nums",
                textShadow: "0 0 100px rgba(232,176,74,0.4)",
              }}
            >
              {formatHMS(totalMs)}
            </div>
          </div>

          {/* ====== MC / ENCORE breakdowns ====== */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 60 }}>
            <SegmentCard title="MC Times" label="MC" segments={mcSegments} />
            <SegmentCard title="Encore Times" label="EN" segments={encoreSegments} />
          </div>

          {/* ====== FOOTER: START / END wall clocks ====== */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 140 }}>
            <ClockStat label="Start" value={startTime} />
            <div
              style={{
                width: 1,
                height: 60,
                background: "linear-gradient(to bottom, transparent, rgba(232,176,74,0.35), transparent)",
              }}
            />
            <ClockStat label="End" value={endTime} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes summaryFadeIn {
          0% { opacity: 0; transform: translateY(12px) scale(0.98); }
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

  // Click handling on /output:
  //   - Single click is a NO-OP. Any stray click on the output window during
  //     a show MUST NOT change fullscreen state — that would visibly interrupt
  //     the LED feed.
  //   - Double click (within 400ms) toggles fullscreen, intentional gesture.
  //   - ESC / F key exit fullscreen via the keyboard handler above (and ESC
  //     also exits via the browser's built-in fullscreen behavior).
  useEffect(() => {
    let lastClick = 0;
    const handler = () => {
      const now = Date.now();
      if (now - lastClick < 400) {
        toggleFullscreen();
        lastClick = 0; // consume the double-click so the next click is fresh
      } else {
        lastClick = now;
      }
    };
    window.addEventListener("click", handler);
    window.addEventListener("touchend", handler);
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("touchend", handler);
    };
  }, [toggleFullscreen]);

  useEffect(() => {
    if (showHint) {
      const t = setTimeout(() => setShowHint(false), 8000);
      return () => clearTimeout(t);
    }
  }, [showHint]);

  return (
    <div
      className={`w-screen h-screen bg-black overflow-hidden relative ${isFullscreen ? "cursor-none" : ""}`}
      data-testid="output-page"
    >
      {state.showConcertSummary ? (
        <ConcertSummaryDisplay
          totalMs={state.summaryTotalMs || 0}
          mcSegments={state.summaryMcSegments || []}
          encoreSegments={state.summaryEncoreSegments || []}
          startTime={state.summaryStartTime || ""}
          endTime={state.summaryEndTime || ""}
          date={state.summaryDate || ""}
          concertTitle={state.summaryConcertTitle || ""}
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
