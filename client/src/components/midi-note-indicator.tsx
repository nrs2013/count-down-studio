import { useState, useEffect, useRef } from "react";
import { type MidiMessage } from "@/hooks/use-midi";
import { MONO_FONT } from "@/lib/time-utils";

interface MidiNoteIndicatorProps {
  lastMessage: MidiMessage | null;
}

function noteToName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(note / 12) - 2;
  return `${names[note % 12]}${octave}`;
}

export function MidiNoteIndicator({ lastMessage }: MidiNoteIndicatorProps) {
  const [display, setDisplay] = useState<{ note: number; velocity: number; channel: number; noteName: string } | null>(null);
  const [flash, setFlash] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!lastMessage) return;
    const isNoteOn = lastMessage.command === 0x90 && lastMessage.velocity > 0;
    if (!isNoteOn) return;

    setDisplay({
      note: lastMessage.note,
      velocity: lastMessage.velocity,
      channel: lastMessage.channel,
      noteName: noteToName(lastMessage.note),
    });
    setFlash(true);

    clearTimeout(fadeTimerRef.current);
    const t1 = setTimeout(() => setFlash(false), 200);
    fadeTimerRef.current = setTimeout(() => setDisplay(null), 4000);

    return () => {
      clearTimeout(t1);
    };
  }, [lastMessage]);

  if (!display) return null;

  const intensity = Math.min(display.velocity / 127, 1);

  return (
    <div
      className="flex items-center gap-2 select-none pointer-events-none"
      style={{
        opacity: flash ? 1 : 0.6,
        transition: "opacity 0.2s ease",
      }}
      data-testid="midi-note-indicator"
    >
      <div
        className="relative flex items-center"
        style={{
          fontFamily: MONO_FONT,
        }}
      >
        <div
          className="flex items-baseline gap-1"
          style={{
            filter: flash ? `drop-shadow(0 0 8px rgba(6,182,212,${0.4 + intensity * 0.4}))` : "none",
            transition: "filter 0.15s ease",
          }}
        >
          <span
            className="font-black tabular-nums"
            style={{
              fontSize: 28,
              lineHeight: 1,
              color: flash ? "#22d3ee" : "rgba(6,182,212,0.7)",
              transition: "color 0.15s ease",
              letterSpacing: "0.02em",
            }}
            data-testid="text-midi-note-number"
          >
            {display.note}
          </span>
          <span
            className="font-bold uppercase"
            style={{
              fontSize: 11,
              lineHeight: 1,
              color: flash ? "rgba(232,121,249,0.9)" : "rgba(232,121,249,0.5)",
              transition: "color 0.15s ease",
              letterSpacing: "0.05em",
            }}
            data-testid="text-midi-note-name"
          >
            {display.noteName}
          </span>
        </div>

        <div
          className="ml-2 flex flex-col items-start gap-0"
          style={{
            opacity: flash ? 0.8 : 0.4,
            transition: "opacity 0.15s ease",
          }}
        >
          <span
            style={{
              fontSize: 8,
              lineHeight: 1.2,
              color: "rgba(255,255,255,0.4)",
              fontFamily: MONO_FONT,
              letterSpacing: "0.1em",
            }}
          >
            CH{display.channel + 1}
          </span>
          <div
            className="rounded-full overflow-hidden"
            style={{
              width: 28,
              height: 3,
              background: "rgba(255,255,255,0.08)",
            }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${intensity * 100}%`,
                background: flash
                  ? "linear-gradient(90deg, #06b6d4, #e879f9)"
                  : "rgba(6,182,212,0.4)",
                transition: "background 0.15s ease",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
