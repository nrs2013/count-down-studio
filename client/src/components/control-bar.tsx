import { type CountdownStatus } from "@/hooks/use-countdown";
import { Pause, Play, Square, SkipForward } from "lucide-react";

interface ControlBarProps {
  status: CountdownStatus;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onNext: () => void;
  hasNextSong: boolean;
}

export function ControlBar({
  status,
  onPause,
  onResume,
  onStop,
  onNext,
  hasNextSong,
}: ControlBarProps) {
  if (status === "idle" && !hasNextSong) return null;

  return (
    <div
      className="flex items-center justify-center gap-3 absolute bottom-5 left-1/2 -translate-x-1/2 z-50 opacity-20 hover:opacity-100 transition-opacity duration-500"
      data-testid="control-bar"
    >
      <div
        className="flex items-center gap-1 rounded-full px-2 py-1"
        style={{
          background: "#1e1814",
          border: "1px solid #322a24",
        }}
      >
        {status === "running" && (
          <button
            onClick={onPause}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium tracking-wider uppercase transition-colors duration-200"
            style={{ background: "#322a24", color: "#a8a8a0" }}
            data-testid="button-pause"
          >
            <Pause className="w-3.5 h-3.5" />
            Pause
          </button>
        )}

        {status === "paused" && (
          <button
            onClick={onResume}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium tracking-wider uppercase transition-colors duration-200"
            style={{ background: "#322a24", color: "#a8a8a0" }}
            data-testid="button-resume"
          >
            <Play className="w-3.5 h-3.5" />
            Resume
          </button>
        )}

        {(status === "running" || status === "paused") && (
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium tracking-wider uppercase transition-colors duration-200"
            style={{ color: "#76766f" }}
            data-testid="button-stop"
          >
            <Square className="w-3.5 h-3.5" />
            Stop
          </button>
        )}

        {hasNextSong && (
          <button
            onClick={onNext}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium tracking-wider uppercase transition-colors duration-200"
            style={{ background: "#322a24", color: "#a8a8a0" }}
            data-testid="button-next"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Next
          </button>
        )}
      </div>
    </div>
  );
}
