import { useRef, useState, useEffect, useCallback } from "react";
import { type CountdownStatus } from "@/hooks/use-countdown";

const blinkKeyframes = `
@keyframes blink-sub {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
`;

interface CountdownDisplayProps {
  formattedTime: string;
  status: CountdownStatus | "preview";
  progress: number;
  songTitle?: string;
  nextSongTitle?: string;
  remainingSeconds: number;
  fillWidth?: boolean;
  isEvent?: boolean;
  xTime?: boolean;
  isMC?: boolean;
  isEncore?: boolean;
  isCountUp?: boolean;
  elapsedSeconds?: number;
  mcTargetSeconds?: number;
  subTimerFormatted?: string;
  subTimerRemaining?: number;
  subTimerSeconds?: number;
  subTimerActive?: boolean;
}

function getTimerColor(status: CountdownStatus | "preview", remainingSeconds: number, isEvent?: boolean, isMC?: boolean, mcOverTarget?: boolean, isEncore?: boolean): string {
  if (isEncore) {
    if (status === "idle") return "text-white/20";
    if (status === "preview") return "text-green-400/60";
    if (mcOverTarget) return "text-red-400";
    return "text-green-400";
  }
  if (isMC) {
    if (status === "idle") return "text-white/20";
    if (status === "preview") return "text-sky-300/60";
    if (mcOverTarget) return "text-red-400";
    return "text-sky-300";
  }
  if (status === "finished") return "text-red-500";
  if (status === "idle") return "text-white/20";
  if (status === "preview" && isEvent) return "text-amber-400/60";
  if (status === "preview") return "text-white/60";
  if (remainingSeconds <= 10) return "text-red-400";
  if (isEvent) return "text-amber-400";
  if (remainingSeconds <= 30) return "text-amber-400";
  return "text-white";
}

function getLineGlow(status: CountdownStatus | "preview", remainingSeconds: number) {
  if (status === "finished") return {
    fuchsia: "0 0 12px rgba(232,121,249,0.6), 0 0 30px rgba(232,121,249,0.3)",
    cyan: "0 0 12px rgba(6,182,212,0.6), 0 0 30px rgba(6,182,212,0.3)",
  };
  if (status === "running" && remainingSeconds <= 10) return {
    fuchsia: "0 0 8px rgba(232,121,249,0.5), 0 0 20px rgba(232,121,249,0.2)",
    cyan: "0 0 8px rgba(248,113,113,0.5), 0 0 20px rgba(248,113,113,0.2)",
  };
  return {
    fuchsia: "0 0 8px rgba(232,121,249,0.4), 0 0 20px rgba(232,121,249,0.15)",
    cyan: "0 0 8px rgba(6,182,212,0.4), 0 0 20px rgba(6,182,212,0.15)",
  };
}

const TITLE_FONT = "'Noto Sans JP', 'Inter', sans-serif";
const TIMER_FONT = "'Bebas Neue', Impact, 'Arial Black', sans-serif";
const DESIGN_W = 1920;
const DESIGN_H = 1080;

const LINE_TOP = 186;
const LINE_BOT = 180;
const TIMER_VISUAL_OFFSET = 40;

export function CountdownDisplay({
  formattedTime,
  status,
  progress,
  songTitle,
  nextSongTitle,
  remainingSeconds,
  fillWidth,
  isEvent,
  xTime,
  isMC,
  isEncore,
  isCountUp,
  elapsedSeconds,
  mcTargetSeconds,
  subTimerFormatted,
  subTimerRemaining,
  subTimerSeconds: subTimerTotal,
  subTimerActive: subTimerActiveProp,
}: CountdownDisplayProps) {
  const isCountUpType = isMC || isEncore;
  const displayFormattedTime = isCountUp && elapsedSeconds !== undefined
    ? `${Math.floor(Math.floor(elapsedSeconds) / 60).toString().padStart(2, "0")}:${(Math.floor(elapsedSeconds) % 60).toString().padStart(2, "0")}`
    : formattedTime;
  const mcOverTarget = isCountUpType && mcTargetSeconds !== undefined && mcTargetSeconds > 0 && elapsedSeconds !== undefined && elapsedSeconds >= mcTargetSeconds;
  const timerColor = getTimerColor(status, remainingSeconds, isEvent, isMC, mcOverTarget, isEncore);
  const lineGlow = getLineGlow(status, remainingSeconds);
  const isRunning = status === "running" || status === "paused";
  const subTimerReachedZero = !!(subTimerTotal && subTimerTotal > 0 && (subTimerRemaining ?? 0) <= 0);
  const subFinishedTsRef = useRef<number | null>(null);
  const [dualDismissed, setDualDismissed] = useState(false);
  const prevSubTotalRef = useRef(subTimerTotal);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    const totalChanged = prevSubTotalRef.current !== subTimerTotal;
    const becameRunning = prevStatusRef.current !== "running" && status === "running";
    const becameIdle = status === "idle" || status === "preview";
    prevSubTotalRef.current = subTimerTotal;
    prevStatusRef.current = status;
    if (totalChanged || becameRunning || becameIdle) {
      subFinishedTsRef.current = null;
      setDualDismissed(false);
    }
  }, [subTimerTotal, status]);

  useEffect(() => {
    if (dualDismissed && (subTimerRemaining ?? 0) > 0) {
      subFinishedTsRef.current = null;
      setDualDismissed(false);
    }
  }, [dualDismissed, subTimerRemaining]);

  useEffect(() => {
    if (status === "idle" || status === "preview") {
      return;
    }
    if (subTimerReachedZero && status === "running" && !dualDismissed) {
      if (subFinishedTsRef.current === null) {
        subFinishedTsRef.current = Date.now();
      }
      const iv = setInterval(() => {
        const elapsed = (Date.now() - (subFinishedTsRef.current ?? Date.now())) / 1000;
        if (elapsed >= 5) {
          setDualDismissed(true);
          clearInterval(iv);
        }
      }, 200);
      return () => clearInterval(iv);
    }
  }, [subTimerReachedZero, status, dualDismissed]);

  const subTimerIsActive = subTimerActiveProp !== false;
  const showDualTimer = !!(subTimerTotal && subTimerTotal > 0 && subTimerIsActive && status !== "idle" && status !== "preview" && subTimerFormatted && !dualDismissed);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const updateScale = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const sx = rect.width / DESIGN_W;
    const sy = rect.height / DESIGN_H;
    if (fillWidth) {
      setScale(sx);
    } else {
      setScale(Math.min(sx, sy));
    }
  }, [fillWidth]);

  useEffect(() => {
    updateScale();
    const ro = new ResizeObserver(() => {
      updateScale();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  return (
    <>
    <style>{blinkKeyframes}</style>
    <div
      ref={containerRef}
      className="flex items-center justify-center select-none w-full h-full overflow-hidden"
      style={{
        background: fillWidth ? "none" : "radial-gradient(ellipse at center, #0a0a12 0%, #000000 70%)",
      }}
      data-testid="countdown-display"
    >
      <div
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
        className="relative flex-shrink-0"
      >
        {!fillWidth && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%),
                linear-gradient(180deg, rgba(192,38,211,0.04) 0%, transparent 20%, transparent 80%, rgba(6,182,212,0.04) 100%)
              `,
            }}
          />
        )}

        {/* NOW text - top (hidden for MC, show MC TIME instead) */}
        <div
          className="absolute whitespace-nowrap pointer-events-none"
          style={{
            top: 20,
            left: 0,
            right: 0,
            fontFamily: TITLE_FONT,
            fontWeight: 900,
            fontSize: 110,
            lineHeight: 1.4,
            paddingLeft: isCountUpType ? 0 : 40,
            overflow: "visible",
            clipPath: isCountUpType ? "none" : "inset(0 0 0 0)",
            display: "flex",
            alignItems: "center",
            justifyContent: isCountUpType ? "center" : "flex-start",
            gap: "0.3em",
          }}
          data-testid="now-row"
        >
          {isCountUpType ? (
            <span style={{
              fontFamily: TIMER_FONT,
              fontSize: "1.1em",
              letterSpacing: "0.25em",
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1,
              width: "100%",
              textAlign: "center",
              textShadow: isEncore
                ? "0 0 20px rgba(255,255,255,0.3), 0 0 50px rgba(34,197,94,0.25)"
                : "0 0 20px rgba(255,255,255,0.3), 0 0 50px rgba(56,189,248,0.25)",
              paddingLeft: 0,
              position: "relative",
              top: 40,
            }}>{isEncore ? "ENCORE TIME" : "MC TIME"}</span>
          ) : (
            <>
              <span style={{
                fontFamily: TIMER_FONT,
                fontSize: "0.75em",
                letterSpacing: "0.1em",
                color: "#e879f9",
                background: "rgba(232,121,249,0.15)",
                borderRadius: 8,
                padding: "0.12em 0.2em 0.08em 0.25em",
                lineHeight: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textShadow: "0 0 12px rgba(232,121,249,0.4)",
                flexShrink: 0,
                position: "relative",
                top: 8,
              }}>NOW</span>
              <span className="text-white" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }} data-testid="text-song-title">
                {songTitle || "---"}
              </span>
            </>
          )}
        </div>

        {/* Fuchsia line with glow */}
        <div
          className="absolute w-full"
          style={{ top: LINE_TOP, left: 0, right: 0, height: 2, backgroundColor: isEncore ? "#22c55e" : isMC ? "#38bdf8" : "#e879f9", boxShadow: lineGlow.fuchsia }}
        />

        {/* Timer - centered between lines */}
        <div
          className="absolute flex items-center justify-center"
          style={{ top: LINE_TOP, left: 0, right: 0, bottom: LINE_BOT }}
        >
          {xTime ? (
            <div className="flex flex-col items-center justify-center pointer-events-none" style={{ transform: `translateY(${TIMER_VISUAL_OFFSET}px)` }}>
              <div
                style={{
                  fontSize: 560,
                  fontFamily: TIMER_FONT,
                  letterSpacing: "0.08em",
                  whiteSpace: "nowrap",
                  lineHeight: 0.85,
                  color: "rgba(34,197,94,0.85)",
                  textShadow: "0 0 40px rgba(34,197,94,0.3), 0 0 80px rgba(34,197,94,0.15)",
                }}
                data-testid="text-countdown-time"
              >
                X-TIME
              </div>
              <div
                style={{
                  fontSize: 115,
                  fontFamily: TIMER_FONT,
                  letterSpacing: "0.25em",
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                  color: "rgba(255,255,255,0.2)",
                  marginTop: 22,
                }}
              >
                NO COUNTDOWN
              </div>
            </div>
          ) : showDualTimer ? (
            <div
              className="flex items-center justify-center pointer-events-none"
              style={{
                width: "100%",
                height: "100%",
                transform: `translateY(${TIMER_VISUAL_OFFSET}px)`,
                gap: 0,
              }}
              data-testid="text-countdown-time"
            >
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", opacity: 0.35 }}>
                <div
                  className="transition-colors duration-300"
                  style={{
                    fontSize: 540,
                    fontFamily: TIMER_FONT,
                    letterSpacing: "-0.03em",
                    whiteSpace: "nowrap",
                    lineHeight: 0.85,
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  {status === "idle" ? "00:00" : displayFormattedTime}
                </div>
                <div style={{
                  fontFamily: "Impact, 'Arial Narrow', sans-serif",
                  fontWeight: 900,
                  fontSize: 120,
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.85)",
                  marginTop: -5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "90%",
                  textAlign: "center",
                }}>{songTitle || "---"}</div>
              </div>
              <div style={{
                width: 3,
                alignSelf: "stretch",
                margin: "80px 0",
                background: "linear-gradient(180deg, transparent, rgba(251,146,60,0.4) 30%, rgba(251,146,60,0.4) 70%, transparent)",
              }} />
              <div style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden",
              }}>
                {(subTimerRemaining ?? 0) <= 0 ? (
                  <div
                    style={{
                      fontFamily: TIMER_FONT,
                      fontWeight: 900,
                      fontSize: 330,
                      letterSpacing: "-0.03em",
                      lineHeight: 0.85,
                      color: "rgba(255,255,255,0.95)",
                      textShadow: "0 0 40px rgba(255,255,255,0.3)",
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                    data-testid="text-sub-timer"
                  >
                    MEMBER<br />IN
                  </div>
                ) : (
                  <>
                    <div
                      className="transition-colors duration-300"
                      style={{
                        fontSize: 540,
                        fontFamily: TIMER_FONT,
                        letterSpacing: "-0.03em",
                        whiteSpace: "nowrap",
                        lineHeight: 0.85,
                        color: (subTimerRemaining ?? 0) <= 10 ? "rgba(248,113,113,0.95)"
                          : "rgba(255,255,255,0.95)",
                        animation: status === "running" && (subTimerRemaining ?? 0) > 0 && (subTimerRemaining ?? 0) <= 10 ? "blink-sub 0.25s step-end infinite" : "none",
                      }}
                      data-testid="text-sub-timer"
                    >
                      {subTimerFormatted}
                    </div>
                    <div style={{
                      fontFamily: "Impact, 'Arial Narrow', sans-serif",
                      fontWeight: 900,
                      fontSize: 120,
                      letterSpacing: "-0.02em",
                      color: "rgba(250,204,21,0.95)",
                      marginTop: -5,
                      whiteSpace: "nowrap",
                      textAlign: "center",
                    }}>着替終了まで</div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div
              className={`transition-colors duration-300 ${timerColor} text-center pointer-events-none`}
              style={{
                fontSize: 850,
                fontFamily: TIMER_FONT,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                lineHeight: 0.72,
                transform: `translateY(${TIMER_VISUAL_OFFSET}px)`,
              }}
              data-testid="text-countdown-time"
            >
              {status === "idle" ? "00:00" : displayFormattedTime}
            </div>
          )}
        </div>

        {/* Cyan line with glow */}
        <div
          className="absolute w-full"
          style={{ bottom: LINE_BOT, left: 0, right: 0, height: 2, backgroundColor: isEncore ? "#22c55e" : isMC ? "#38bdf8" : "#06b6d4", boxShadow: lineGlow.cyan }}
        />

        {/* NEXT text - bottom */}
        <div
          className="absolute whitespace-nowrap pointer-events-none"
          style={{
            bottom: 26,
            left: 0,
            right: 0,
            fontFamily: TITLE_FONT,
            fontWeight: 900,
            fontSize: 110,
            lineHeight: 1.4,
            paddingLeft: 40,
            overflow: "visible",
            clipPath: "inset(0 0 0 0)",
            display: "flex",
            alignItems: "center",
            gap: "0.3em",
          }}
          data-testid="next-row"
        >
          <span style={{
            fontFamily: TIMER_FONT,
            fontSize: "0.75em",
            letterSpacing: "0.1em",
            color: "#22d3ee",
            background: "rgba(6,182,212,0.15)",
            borderRadius: 8,
            padding: "0.12em 0.2em 0.08em 0.25em",
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textShadow: "0 0 12px rgba(6,182,212,0.4)",
            flexShrink: 0,
          }}>NEXT</span>
          <span className="text-white" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)", position: "relative", top: -8 }} data-testid="text-next-song">
            {nextSongTitle || "---"}
          </span>
        </div>

      </div>
    </div>
    </>
  );
}
