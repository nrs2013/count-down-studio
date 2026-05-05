import { useState, useEffect, useRef, useCallback } from "react";

const TIMER_FONT = "'Bebas Neue', Impact, 'Arial Black', sans-serif";
const TITLE_FONT = "'Oswald', 'Noto Sans JP', 'Inter', sans-serif";

const DESIGN_W = 1920;
const DESIGN_H = 1080;

interface EventInfoDisplayProps {
  concertTitle: string;
  doorOpen: string | null;
  showTime: string | null;
  rehearsal: string | null;
  onClose?: () => void;
  inline?: boolean;
}

export function EventInfoDisplay({ concertTitle, doorOpen, showTime, rehearsal, onClose, inline }: EventInfoDisplayProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const updateScale = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setScale(Math.min(rect.width / DESIGN_W, rect.height / DESIGN_H));
  }, []);

  useEffect(() => {
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  const hours = currentTime.getHours().toString().padStart(2, "0");
  const minutes = currentTime.getMinutes().toString().padStart(2, "0");
  const seconds = currentTime.getSeconds().toString().padStart(2, "0");

  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const dayOfWeek = DAYS[currentTime.getDay()];
  const yearStr = `${currentTime.getFullYear()}`;
  const mdStr = `${currentTime.getMonth() + 1}/${currentTime.getDate()}`;

  const hasDoor = !!doorOpen;
  const hasShow = !!showTime;
  const hasRehearsal = !!rehearsal;
  const hasSchedule = hasDoor || hasShow || hasRehearsal;
  const scheduleItemCount = [hasDoor, hasShow, hasRehearsal].filter(Boolean).length;

  const LINE_COLOR = "rgba(255,255,255,0.12)";
  const LINE_ACCENT = "rgba(212,146,90,0.7)";

  return (
    <div
      className={`${inline ? "absolute inset-0" : "fixed inset-0 z-[9999]"} flex items-center justify-center select-none ${onClose ? "cursor-pointer" : ""}`}
      style={{ background: "#000000" }}
      onClick={onClose || undefined}
      data-testid="event-info-overlay"
    >
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden"
      >
        <div
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
          className="relative flex-shrink-0 overflow-hidden"
        >

          <div
            className="absolute"
            style={{
              top: 50,
              left: 0,
              right: 0,
              textAlign: "center",
              fontFamily: TITLE_FONT,
              fontWeight: 900,
              fontSize: 88,
              color: "#ffffff",
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              padding: "0 80px",
            }}
            data-testid="info-concert-title"
          >
            {concertTitle || "CONCERT"}
          </div>

          <div
            className="absolute"
            style={{ top: 200, left: 80, right: 80, height: 2, background: LINE_ACCENT }}
          />

          <div
            className="absolute flex items-center justify-center"
            style={{
              top: 230,
              left: 0,
              right: 0,
              bottom: 280,
            }}
          >
            <div className="flex items-center justify-center" style={{ maxWidth: DESIGN_W }}>
              <div
                className="flex flex-col items-end justify-center"
                style={{
                  marginRight: 40,
                  alignSelf: "center",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: TIMER_FONT,
                    fontSize: 85,
                    letterSpacing: "0.1em",
                    lineHeight: 1,
                    color: "rgba(255,255,255,0.3)",
                  }}
                >
                  {yearStr}
                </span>
                <span
                  style={{
                    fontFamily: TIMER_FONT,
                    fontSize: 140,
                    letterSpacing: "0.04em",
                    lineHeight: 1,
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  {mdStr}
                </span>
                <span
                  style={{
                    fontFamily: TIMER_FONT,
                    fontSize: 95,
                    letterSpacing: "0.2em",
                    lineHeight: 1,
                    color: "rgba(255,255,255,0.25)",
                  }}
                >
                  {dayOfWeek}
                </span>
              </div>
              <span
                style={{
                  fontFamily: TIMER_FONT,
                  fontSize: 600,
                  letterSpacing: "0.01em",
                  lineHeight: 0.72,
                  color: "#ffffff",
                }}
              >
                {hours}
              </span>
              <span
                style={{
                  fontFamily: TIMER_FONT,
                  fontSize: 480,
                  lineHeight: 0.72,
                  color: "#ffffff",
                  margin: "0 -2px",
                }}
              >
                :
              </span>
              <span
                style={{
                  fontFamily: TIMER_FONT,
                  fontSize: 600,
                  letterSpacing: "0.01em",
                  lineHeight: 0.72,
                  color: "#ffffff",
                }}
              >
                {minutes}
              </span>
              <span
                style={{
                  fontFamily: TIMER_FONT,
                  fontSize: 270,
                  letterSpacing: "0.01em",
                  lineHeight: 0.72,
                  color: "#ffffff",
                  marginLeft: 14,
                  alignSelf: "flex-end",
                  position: "relative",
                  bottom: 14,
                }}
              >
                {seconds}
              </span>
            </div>
          </div>

          {hasSchedule && (
            <>
              <div
                className="absolute"
                style={{ bottom: 310, left: 80, right: 80, height: 2, background: LINE_ACCENT }}
              />

              <div
                className="absolute flex items-center justify-center"
                style={{
                  bottom: 20,
                  left: 40,
                  right: 40,
                  height: 300,
                  gap: scheduleItemCount >= 3 ? 60 : scheduleItemCount >= 2 ? 90 : 0,
                  overflow: "hidden",
                }}
              >
                {hasRehearsal && (
                  <div className="flex flex-col items-center" data-testid="info-rehearsal">
                    <div
                      style={{
                        fontFamily: TIMER_FONT,
                        fontSize: scheduleItemCount >= 3 ? 52 : 64,
                        letterSpacing: scheduleItemCount >= 3 ? "0.18em" : "0.3em",
                        color: "rgba(74,222,128,0.5)",
                        lineHeight: 1,
                        marginBottom: 10,
                      }}
                    >
                      REHEARSAL
                    </div>
                    <div
                      style={{
                        fontFamily: TIMER_FONT,
                        fontSize: scheduleItemCount >= 3 ? 170 : 210,
                        letterSpacing: "0.04em",
                        color: "rgba(74,222,128,0.95)",
                        lineHeight: 0.88,
                      }}
                    >
                      {rehearsal}
                    </div>
                  </div>
                )}

                {hasRehearsal && (hasDoor || hasShow) && (
                  <div
                    style={{
                      width: 1,
                      height: 140,
                      background: LINE_COLOR,
                      alignSelf: "center",
                      flexShrink: 0,
                    }}
                  />
                )}

                {hasDoor && (
                  <div className="flex flex-col items-center" data-testid="info-door-open">
                    <div
                      style={{
                        fontFamily: TIMER_FONT,
                        fontSize: scheduleItemCount >= 3 ? 52 : 64,
                        letterSpacing: scheduleItemCount >= 3 ? "0.18em" : "0.3em",
                        color: "rgba(251,191,36,0.5)",
                        lineHeight: 1,
                        marginBottom: 10,
                      }}
                    >
                      DOOR OPEN
                    </div>
                    <div
                      style={{
                        fontFamily: TIMER_FONT,
                        fontSize: scheduleItemCount >= 3 ? 170 : 210,
                        letterSpacing: "0.04em",
                        color: "rgba(251,191,36,0.95)",
                        lineHeight: 0.88,
                      }}
                    >
                      {doorOpen}
                    </div>
                  </div>
                )}

                {hasDoor && hasShow && (
                  <div
                    style={{
                      width: 1,
                      height: 140,
                      background: LINE_COLOR,
                      alignSelf: "center",
                      flexShrink: 0,
                    }}
                  />
                )}

                {hasShow && (
                  <div className="flex flex-col items-center" data-testid="info-show-time">
                    <div
                      style={{
                        fontFamily: TIMER_FONT,
                        fontSize: scheduleItemCount >= 3 ? 52 : 64,
                        letterSpacing: scheduleItemCount >= 3 ? "0.18em" : "0.3em",
                        color: "rgba(34,211,238,0.5)",
                        lineHeight: 1,
                        marginBottom: 10,
                      }}
                    >
                      SHOW TIME
                    </div>
                    <div
                      style={{
                        fontFamily: TIMER_FONT,
                        fontSize: scheduleItemCount >= 3 ? 170 : 210,
                        letterSpacing: "0.04em",
                        color: "rgba(34,211,238,0.95)",
                        lineHeight: 0.88,
                      }}
                    >
                      {showTime}
                    </div>
                  </div>
                )}
              </div>

              <div
                className="absolute"
                style={{ bottom: 18, left: 80, right: 80, height: 2, background: LINE_COLOR }}
              />
            </>
          )}

          {!hasSchedule && (
            <>
              <div
                className="absolute"
                style={{ bottom: 100, left: 120, right: 120, height: 1, background: LINE_COLOR }}
              />
              <div
                className="absolute flex items-center justify-center"
                style={{
                  bottom: 40,
                  left: 0,
                  right: 0,
                }}
              >
                <div
                  style={{
                    fontFamily: TIMER_FONT,
                    fontSize: 48,
                    letterSpacing: "0.3em",
                    color: "rgba(255,255,255,0.08)",
                  }}
                >
                  NO SCHEDULE SET
                </div>
              </div>
            </>
          )}

          {onClose && (
            <div
              className="absolute"
              style={{
                bottom: 15,
                right: 30,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14,
                color: "rgba(255,255,255,0.12)",
                letterSpacing: "0.1em",
              }}
            >
              CLICK TO CLOSE
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
