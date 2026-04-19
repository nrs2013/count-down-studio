import { useState, useEffect, useRef } from "react";
import { type MidiMessage } from "@/hooks/use-midi";
import { MONO_FONT } from "@/lib/time-utils";

function noteToName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(note / 12) - 2;
  return `${names[note % 12]}${octave}`;
}

interface MidiLogMonitorProps {
  lastMessage: MidiMessage | null;
}

export function MidiLogMonitor({ lastMessage }: MidiLogMonitorProps) {
  const [currentNote, setCurrentNote] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!lastMessage) return;
    const isNoteOn = lastMessage.command === 0x90 && lastMessage.velocity > 0;
    if (!isNoteOn) return;

    const name = noteToName(lastMessage.note);
    setCurrentNote(name);
    setVisible(true);

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, 3000);

    return () => clearTimeout(timerRef.current);
  }, [lastMessage]);

  return (
    <div
      className="flex items-center h-full px-3"
      style={{ fontFamily: MONO_FONT }}
      data-testid="midi-log-monitor"
    >
      <div className="flex items-center gap-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: visible ? "#06b6d4" : "rgba(6,182,212,0.3)",
            boxShadow: visible ? "0 0 6px rgba(6,182,212,0.6)" : "none",
            transition: "all 0.3s ease",
          }}
        />
        <span
          className="text-[9px] font-bold uppercase tracking-[0.15em]"
          style={{ color: "rgba(6,182,212,0.5)" }}
        >
          MIDI
        </span>
        {visible && currentNote && (
          <span
            className="font-bold"
            style={{
              fontSize: 11,
              color: "rgba(6,182,212,0.8)",
              letterSpacing: "0.05em",
            }}
            data-testid="midi-current-note"
          >
            {currentNote}
          </span>
        )}
      </div>
    </div>
  );
}
