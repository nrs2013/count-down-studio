export const UI_FONT = "'Noto Sans JP', 'Inter', sans-serif";
export const MONO_FONT = "'JetBrains Mono', 'Menlo', monospace";

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function toHalfWidth(str: string): string {
  return str
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[：〜～]/g, (ch) => ch === "〜" || ch === "～" ? "~" : ":");
}

export function filterTimeInput(str: string): string {
  return toHalfWidth(str).replace(/[^0-9:]/g, "");
}

export function parseDuration(input: string): number | null {
  const trimmed = toHalfWidth(input).trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length !== 2) return null;
    const mStr = parts[0], sStr = parts[1];
    if (mStr === "" || sStr === "") return null;
    const m = parseInt(mStr, 10);
    const s = parseInt(sStr, 10);
    if (isNaN(m) || isNaN(s) || m < 0 || s < 0 || s >= 60) return null;
    return m * 60 + s;
  }
  const num = parseInt(trimmed, 10);
  if (isNaN(num) || num < 0) return null;
  if (num < 60) return num;
  if (num < 100) return null;
  const s = num % 100;
  const m = Math.floor(num / 100);
  if (s >= 60) return null;
  return m * 60 + s;
}

export function parseStartEndFromRange(tr: string | null): { start: string; end: string } {
  if (!tr) return { start: "", end: "" };
  const normalized = toHalfWidth(tr);
  const sep = normalized.includes("~") ? "~" : null;
  if (!sep) return { start: "", end: "" };
  const parts = normalized.split(sep);
  return { start: parts[0] || "", end: parts[1] || "" };
}

export const MIDI_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const MIDI_NOTES = Array.from({ length: 128 }, (_, i) => {
  const octave = Math.floor(i / 12) - 2;
  const name = MIDI_NOTE_NAMES[i % 12];
  return { value: i, label: `${i} (${name}${octave})` };
});

export const MIDI_NOTES_BY_NAME: { noteName: string; notes: { value: number; label: string }[] }[] =
  MIDI_NOTE_NAMES.map((noteName) => {
    const notes: { value: number; label: string }[] = [];
    for (let i = 0; i < 128; i++) {
      if (MIDI_NOTE_NAMES[i % 12] === noteName) {
        const octave = Math.floor(i / 12) - 2;
        if (octave < 0) continue;
        notes.push({ value: i, label: `${noteName}${octave}` });
      }
    }
    return { noteName, notes };
  }).filter((g) => g.notes.length > 0);

// Claude-style: inputs are "pressed into" the card surface (darker than card).
// Gives clear visual hierarchy: card raised, input sunken.
export const INPUT_STYLES = {
  border: "1px solid #2a231e",
  background: "#0e0a08",                // darker than card — reads as inset
  glowFocused: (accent: string) => {
    const match = accent.match(/rgba\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(",");
      if (parts.length === 4) {
        const opacity = Math.min(parseFloat(parts[3]) * 0.8, 0.5);
        return `0 0 0 2px rgba(${parts[0].trim()},${parts[1].trim()},${parts[2].trim()},${opacity.toFixed(2)}), inset 0 1px 2px rgba(0,0,0,0.4)`;
      }
    }
    return `0 0 0 2px ${accent}`;
  },
  borderBlur: "#2a231e",
} as const;

export const ACCENT_COLORS = {
  fuchsia: "rgba(193,134,200,0.35)",
  cyan: "rgba(6,182,212,0.35)",
  amber: "rgba(250,204,21,0.5)",
  default: "rgba(193,134,200,0.35)",
} as const;

export const HEADER_FONT = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif";
export const TABLE_HEADER_STYLE = {
  color: "#a8a8a0",                  // --cds-text-2
  borderBottom: "1px solid rgba(193,134,200,0.25)", // subtle purple-tinted divider only
  fontFamily: HEADER_FONT,
  background: "#181411",             // match canvas — no band effect
  letterSpacing: "0.12em",
  borderLeft: "3px solid transparent",
};
