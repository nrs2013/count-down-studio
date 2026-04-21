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

// Warm gray surface (Claude-style) - matches index.css --cds-surface
export const INPUT_STYLES = {
  border: "1px solid rgba(70,70,63,0.65)",        // var(--cds-border) #46463f
  background: "rgba(50,50,48,0.55)",              // var(--cds-surface) #323230
  glowFocused: (accent: string) => {
    const match = accent.match(/rgba\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(",");
      if (parts.length === 4) {
        const opacity = parseFloat(parts[3]) * 0.5;
        return `0 0 10px rgba(${parts[0].trim()},${parts[1].trim()},${parts[2].trim()},${opacity.toFixed(2)})`;
      }
    }
    return `0 0 10px ${accent}`;
  },
  borderBlur: "rgba(70,70,63,0.45)",
} as const;

export const ACCENT_COLORS = {
  fuchsia: "rgba(232,121,249,0.35)",
  cyan: "rgba(6,182,212,0.35)",
  amber: "rgba(250,204,21,0.5)",
  default: "rgba(232,121,249,0.35)",
} as const;

export const HEADER_FONT = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif";
export const TABLE_HEADER_STYLE = {
  color: "rgba(168,168,160,0.85)",              // var(--cds-text-2) #a8a8a0
  borderBottom: "1px solid rgba(70,70,63,0.55)",// var(--cds-border) #46463f
  fontFamily: HEADER_FONT,
  background: "rgba(50,50,48,0.45)",            // var(--cds-surface) #323230
  letterSpacing: "0.12em",
  borderLeft: "3px solid transparent",
};
