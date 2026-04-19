import { Zap } from "lucide-react";

interface ModeTabBarProps {
  activeMode: "setlist" | "show";
  outputOpen: boolean;
  outputFullscreen?: boolean;
  onOutputOn?: () => void;
  onOutputOff?: () => void;
}

export type AppMode = "setlist" | "show";

export function ModeTabBar({ activeMode, outputOpen, outputFullscreen, onOutputOn, onOutputOff }: ModeTabBarProps) {
  return (
    <div
      className="flex items-center gap-2 rounded-full px-1.5 py-1.5"
      style={{
        background: outputOpen
          ? "linear-gradient(135deg, rgba(250,204,21,0.08), rgba(251,146,60,0.05))"
          : "rgba(255,255,255,0.04)",
        border: outputOpen
          ? "1px solid rgba(250,204,21,0.15)"
          : "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)",
        transition: "all 0.4s ease",
      }}
      data-testid="mode-tab-bar"
    >
      <button
        className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold tracking-wider uppercase transition-all duration-300"
        style={{
          fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
          ...(!outputOpen
            ? {
                background: "linear-gradient(135deg, rgba(232,121,249,0.9), rgba(192,80,220,0.85))",
                color: "#ffffff",
                border: "1px solid rgba(232,121,249,0.9)",
                boxShadow: "0 0 16px rgba(232,121,249,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
              }
            : {
                background: "rgba(232,121,249,0.1)",
                color: "rgba(232,121,249,0.6)",
                border: "1px solid rgba(232,121,249,0.15)",
              }),
        }}
        onClick={onOutputOff}
        data-testid="tab-setlist"
      >
        SET LIST
      </button>

      <div
        className="flex items-center rounded-full"
        style={{
          background: outputOpen
            ? "linear-gradient(135deg, rgba(250,204,21,0.12), rgba(251,146,60,0.08))"
            : "rgba(255,255,255,0.02)",
          border: outputOpen
            ? "1px solid rgba(250,204,21,0.2)"
            : "1px solid rgba(255,255,255,0.06)",
          transition: "all 0.4s ease",
        }}
      >
        <div
          className="flex items-center gap-1.5 pl-3.5 pr-2"
          style={{
            color: outputOpen ? "rgba(250,204,21,0.95)" : "rgba(255,255,255,0.25)",
            transition: "color 0.3s ease",
          }}
        >
          <Zap
            className="w-4 h-4"
            style={{
              filter: outputOpen ? "drop-shadow(0 0 4px rgba(250,204,21,0.6))" : "none",
              transition: "all 0.3s ease",
            }}
          />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.15em",
            }}
          >
            SHOW
          </span>
        </div>

        <div className="flex items-center gap-0.5 pr-1.5">
          <button
            className="px-3.5 py-2 rounded-full text-[11px] font-extrabold tracking-widest uppercase transition-all duration-300"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              ...(outputOpen
                ? {
                    background: "linear-gradient(135deg, rgba(250,204,21,0.9), rgba(251,191,36,0.85))",
                    color: "#1a1a1a",
                    boxShadow: "0 0 12px rgba(250,204,21,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
                    textShadow: "0 1px 0 rgba(255,255,255,0.15)",
                  }
                : {
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.2)",
                  }),
            }}
            onClick={onOutputOn}
            data-testid="button-show-on"
          >
            ON
          </button>

          <button
            className="px-3.5 py-2 rounded-full text-[11px] font-extrabold tracking-widest uppercase transition-all duration-300"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              ...(!outputOpen
                ? {
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.35)",
                  }
                : {
                    background: "rgba(255,255,255,0.03)",
                    color: "rgba(255,255,255,0.15)",
                  }),
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
