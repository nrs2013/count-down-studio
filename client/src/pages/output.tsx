import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { useLocation } from "wouter";
import { useCountdownReceiver } from "@/hooks/use-countdown-broadcast";
import { CountdownDisplay } from "@/components/countdown-display";
import { EventInfoDisplay } from "@/components/event-info-display";
import { useCues } from "@/hooks/use-local-data";
import { type LocalCue } from "@/lib/local-db";

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

// Convert a raw KeyboardEvent.key value to a short symbol the director
// can recognise at a glance. Arrow names get arrows, space gets a label.
// Anything else (single ASCII chars like "m" or ",") passes through.
export function displayKey(key: string | undefined | null): string {
  if (!key) return "—";
  switch (key) {
    case "ArrowLeft":  return "←";
    case "ArrowRight": return "→";
    case "ArrowUp":    return "↑";
    case "ArrowDown":  return "↓";
    case " ":          return "Space";
    case "Enter":      return "Enter";
    case "Tab":        return "Tab";
    case "Backspace":  return "⌫";
    default:           return key;
  }
}

// ============================================================
// Customisable cue overlay
// ============================================================
// One generic overlay component driven by a LocalCue record. Replaces the
// three hard-coded STAND BY! / HOLD! / GO! components — the user can now
// add, edit, recolor, rekey, and remove cards from the Cue Manager Modal.

// Pick a readable text color (near-black on light fills, off-white on
// dark fills) from a background hex. Keeps the user from having to think
// about contrast when they pick a custom color.
function autoTextColor(bgHex: string): string {
  const hex = (bgHex || "#f5c518").replace("#", "").trim();
  const full = hex.length === 3
    ? hex.split("").map((c) => c + c).join("")
    : hex.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#1a1410";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1a1410" : "#f5f1e0";
}

const BLINK_SECONDS: Record<"slow" | "normal" | "fast", number> = {
  slow: 1.2,
  normal: 0.7,
  fast: 0.35,
};

// Effective character count — Bebas Neue ASCII glyphs sit at ~0.36em wide
// while Noto Sans JP Black CJK glyphs sit at a full ~1em wide, so a
// Japanese character occupies roughly 2.5x the horizontal space of an
// ASCII one. We weight CJK characters at 2.5 so a 5-char Japanese label
// like "平林待て！" gets bucketed as if it were ~13 ASCII chars, which
// the size table below maps to a small-enough font for it to sit cleanly
// INSIDE the yellow border (not touching it).
function effectiveLen(label: string): number {
  let len = 0;
  for (const ch of label || "") {
    const code = ch.codePointAt(0) ?? 0;
    // ASCII range = half-width; everything else (CJK, full-width
    // punctuation, emoji) gets weighted heavier so the resulting bucket
    // accounts for the larger glyph width.
    len += code <= 0x7F ? 1 : 2.5;
  }
  return Math.ceil(len);
}

// Pick a font-size that fills the panel for short labels (GO!) but stays
// inside the border — NOT just inside the screen — for longer ones. The
// director wants the yellow border to remain part of the visual frame, so
// the text must clear it with a small margin. Both cqh and cqw caps are
// tuned per-bucket so that the rendered text width stays under ~92cqw on
// 16:9 canvases (border lives at ~97.75cqw), even for the heaviest CJK
// labels.
//
// `adjust` (default 0) is the user's nudge on top of the auto-picked size.
// Each step is ~8% of both cqh and cqw caps, so the visual change is
// noticeable but a few clicks of fine-tuning still stays inside the
// border. Results are clamped to safe bounds.
function pickFontSize(label: string, adjust: number = 0): string {
  const len = effectiveLen(label);
  let cqh: number;
  let cqw: number;
  if (len <= 3)       { cqh = 95; cqw = 75; }
  else if (len <= 5)  { cqh = 70; cqw = 42; }
  else if (len <= 7)  { cqh = 60; cqw = 32; }
  else if (len <= 9)  { cqh = 50; cqw = 26; }
  else if (len <= 12) { cqh = 45; cqw = 17; }
  else if (len <= 16) { cqh = 40; cqw = 13; }
  else if (len <= 20) { cqh = 35; cqw = 10; }
  else                { cqh = 30; cqw =  8; }
  if (adjust !== 0) {
    const factor = Math.pow(1.08, adjust);
    cqh *= factor;
    cqw *= factor;
    cqh = Math.max(10, Math.min(98, cqh));
    cqw = Math.max(3, Math.min(95, cqw));
  }
  return `min(${cqh.toFixed(1)}cqh, ${cqw.toFixed(1)}cqw)`;
}

export function CueOverlay({ cue }: { cue: LocalCue }) {
  // Honor an explicit textColor when the director set one; otherwise fall
  // back to the luminance-based auto pick so legacy cues (no textColor in
  // their DB record) still look right.
  const fg = cue.textColor || autoTextColor(cue.color);
  const blinkDur = BLINK_SECONDS[cue.blinkSpeed] || 0.7;
  const animName = `cdsBlink_${cue.id}`;
  // Per-cue keyframes so each cue can have its own color pair without
  // colliding with other CueOverlay instances on the same document.
  const blinkCSS = cue.blink
    ? `@keyframes ${animName} {
        0%, 49% { background: ${cue.color}; color: ${fg}; }
        50%, 100% { background: ${fg}; color: ${cue.color}; }
      }`
    : "";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: cue.color,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        animation: cue.blink ? `${animName} ${blinkDur}s steps(2, jump-none) infinite` : "none",
        containerType: "size",
      } as any}
      data-testid={`overlay-cue-${cue.id}`}
    >
      <div
        style={{
          position: "absolute",
          inset: "1.5cqh",
          border: "0.5cqh solid currentColor",
          borderRadius: "0.5cqh",
          pointerEvents: "none",
        } as any}
      />
      <div
        style={{
          // Half-width characters resolve to Bebas Neue (tall narrow English).
          // Full-width / CJK characters fall through to Noto Sans JP at its
          // Black (900) weight — a heavy gothic that reads as the JP twin of
          // Bebas Neue's visual mass. font-weight: 900 makes the browser pick
          // Noto's Black glyphs and applies a synthetic bold to Bebas Neue;
          // since Bebas is already a black display face, the synthetic bump
          // is barely visible and the two read as the same family.
          fontFamily: "'Bebas Neue', 'Noto Sans JP', Impact, 'Arial Narrow', sans-serif",
          fontWeight: 900,
          fontSize: pickFontSize(cue.label, cue.fontSizeAdjust),
          lineHeight: 1,
          letterSpacing: "-0.02em",
          textAlign: "center",
          whiteSpace: "nowrap",
          transform: "translateY(8%)",
        } as any}
      >
        {cue.label}
      </div>
      {cue.blink && <style>{blinkCSS}</style>}
    </div>
  );
}

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
          color: "#e8e8e2",
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
          "radial-gradient(ellipse 55% 40% at 50% 22%, rgba(232,176,74,0.12), transparent 65%), radial-gradient(ellipse 85% 60% at 50% 100%, rgba(193,134,200,0.07), transparent 65%)",
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

  // Mirror "show in progress" into the same window flag /manage uses, so
  // main.tsx's SW auto-reload defers on THIS window too — without it a
  // deploy mid-show reloads the projector and flashes the LED black.
  // Overlays (event info / end summary) count: they're audience-visible.
  useEffect(() => {
    const active = state.status !== "idle" || !!state.showEventInfo || !!state.showConcertSummary;
    (window as any).__cdsActive = active;
    if (!active) window.dispatchEvent(new Event("cds-countdown-idle"));
  }, [state.status, state.showEventInfo, state.showConcertSummary]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const secondaryRef = useRef<any>(null);
  // Press-and-hold key cue overlays — same UX as on /manage but driven from
  // /output's own keyboard handler. The director may have focus on either
  // window; both should respond. /output keeps a separate local state so it
  // doesn't need to broadcast back to /manage just for visual feedback.
  const [localCueId, setLocalCueId] = useState<number | null>(null);
  const { data: cues = [] } = useCues();

  useEffect(() => {
    document.title = "Output - COUNT DOWN STUDIO";
  }, []);

  // Local press-and-hold cue handler (mirrors /manage's dynamic version).
  // Listens for each registered cue's shortcutKey. Skipped while focus is
  // in an input / textarea / contenteditable so typing into a field never
  // fires the overlay. Handles its own state — does not broadcast back to
  // /manage; /output renders whichever of (broadcast state.activeCueId)
  // OR (localCueId) is currently set.
  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || el.isContentEditable;
    };
    const norm = (k: string) => (k || "").toLowerCase();
    const matchCue = (k: string) => cues.find((c) => norm(c.shortcutKey) === norm(k));
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const cue = matchCue(e.key);
      if (cue) {
        e.preventDefault();
        setLocalCueId(cue.id);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const cue = matchCue(e.key);
      if (cue) {
        setLocalCueId((cur) => (cur === cue.id ? null : cur));
      }
    };
    const clearOnBlur = () => setLocalCueId(null);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearOnBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearOnBlur);
    };
  }, [cues]);

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
    // Skip while focus is in any input — even though /output has no
    // visible inputs day-to-day, a tab forwarded modal or third-party
    // overlay (devtools, browser autofill) could trap the F key.
    const isInputFocused = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const handler = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
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
    let lastTouch = 0;
    const registerTap = () => {
      const now = Date.now();
      if (now - lastClick < 400) {
        toggleFullscreen();
        lastClick = 0; // consume the double-click so the next click is fresh
      } else {
        lastClick = now;
      }
    };
    const handleClick = () => {
      // Touch devices fire touchend AND a synthetic click for the same tap;
      // counting both made a SINGLE tap register as a double-click and
      // toggle fullscreen — the one thing a stray touch must never do.
      if (Date.now() - lastTouch < 700) return;
      registerTap();
    };
    const handleTouchEnd = () => {
      lastTouch = Date.now();
      registerTap();
    };
    window.addEventListener("click", handleClick);
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("touchend", handleTouchEnd);
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

      {/* Press-and-hold key cue overlays — z-index above all other content. */}
      {/* Driven by EITHER the broadcast (key pressed on /manage) OR the local */}
      {/* keyboard handler above (key pressed on /output). Same UX from both. */}
      {(() => {
        // v73: /manage から cue 実体が送られてきていれば、それをそのまま描画する
        // （id 逆引きに依存しない＝この窓の IndexedDB ロード timing / id 不一致で
        //   cue が出ない事故を防ぐ）。実体が無ければ従来通り id 逆引きで描画し、
        //   /output 自身のローカルキー入力（localCueId）にも対応する。
        if (state.activeCueId != null && state.activeCue) {
          return <CueOverlay cue={state.activeCue} />;
        }
        const id = state.activeCueId ?? localCueId;
        if (id == null) return null;
        const cue = cues.find((c) => c.id === id);
        return cue ? <CueOverlay cue={cue} /> : null;
      })()}

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
