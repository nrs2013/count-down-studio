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
      {/* SET LIST pill — surface layer (#232323) so it pops against #1a1a1a panel strip */}
      <button
        className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-bold tracking-[0.12em] uppercase transition-colors duration-150"
        style={{
          fontFamily: UI_FONT,
          background: !outputOpen ? "#d4925a" : "#232323",
          color:      !outputOpen ? "#0a0a08" : "#999999",
          border:     !outputOpen ? "1px solid #d4925a" : "1px solid #353535",
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
          background: "#232323",
          border: "1px solid #353535",
        }}
      >
        <div
          className="flex items-center gap-1.5 pl-3 pr-2"
          style={{ color: outputOpen ? "#d8d8d8" : "#6e6e6e" }}
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
              background: outputOpen ? "#d4925a" : "transparent",
              color:      outputOpen ? "#0a0a08" : "#6e6e6e",
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
              background: !outputOpen ? "#353535" : "transparent",
              color:      !outputOpen ? "#d8d8d8" : "#6e6e6e",
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
