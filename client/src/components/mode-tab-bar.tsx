import { Zap } from "lucide-react";

interface ModeTabBarProps {
  activeMode: "setlist" | "show";
  outputOpen: boolean;
  outputFullscreen?: boolean;
  onOutputOn?: () => void;
  onOutputOff?: () => void;
}

export type AppMode = "setlist" | "show";

// Claude-style minimal pill bar: flat, warm gray, single subtle accent.
// No neon glows, no rainbow gradients.
export function ModeTabBar({ activeMode, outputOpen, outputFullscreen, onOutputOn, onOutputOff }: ModeTabBarProps) {
  const UI_FONT = "'Noto Sans JP', 'Inter', sans-serif";
  const MONO_FONT = "'JetBrains Mono', monospace";

  return (
    <div
      className="flex items-center gap-1 rounded-full px-1 py-1"
      style={{ background: "transparent" }}
      data-testid="mode-tab-bar"
    >
      {/* SET LIST pill — surface layer (#1e1814) so it pops against #181411 panel strip */}
      <button
        className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold tracking-[0.12em] uppercase transition-colors duration-150"
        style={{
          fontFamily: UI_FONT,
          background: !outputOpen ? "#c186c8" : "#1e1814",
          color:      !outputOpen ? "#0a0a08" : "#a8a8a0",
          border:     !outputOpen ? "1px solid #c186c8" : "1px solid #322a24",
        }}
        onClick={onOutputOff}
        data-testid="tab-setlist"
      >
        SET LIST
      </button>

      {/* SHOW segment — surface layer */}
      <div
        className="flex items-center rounded-full"
        style={{
          background: "#1e1814",
          border: "1px solid #322a24",
        }}
      >
        <div
          className="flex items-center gap-1.5 pl-3 pr-2"
          style={{ color: outputOpen ? "#e8e8e2" : "#76766f" }}
        >
          <Zap className="w-3.5 h-3.5" />
          <span
            style={{
              fontFamily: MONO_FONT,
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.14em",
            }}
          >
            SHOW
          </span>
        </div>

        <div className="flex items-center gap-0.5 pr-1 py-0.5">
          <button
            className="px-3 py-1.5 rounded-full text-[10px] font-bold tracking-[0.14em] uppercase transition-colors duration-150"
            style={{
              fontFamily: MONO_FONT,
              background: outputOpen ? "#c186c8" : "transparent",
              color:      outputOpen ? "#0a0a08" : "#76766f",
            }}
            onClick={onOutputOn}
            data-testid="button-show-on"
          >
            ON
          </button>

          <button
            className="px-3 py-1.5 rounded-full text-[10px] font-bold tracking-[0.14em] uppercase transition-colors duration-150"
            style={{
              fontFamily: MONO_FONT,
              background: !outputOpen ? "#322a24" : "transparent",
              color:      !outputOpen ? "#e8e8e2" : "#76766f",
            }}
            onClick={onOutputOff}
            data-testid="button-show-off"
          >
            OFF
          </button>
        </div>
      </div>
    </div>
  );
}
