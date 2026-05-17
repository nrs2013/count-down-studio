// Single source of truth for the Song <-> .scd file round-trip.
//
// Before this module existed the transform was duplicated in 6 places across
// manage.tsx / performance-editor.tsx / local-db.ts. Forgetting one field in
// one place (notably isEnd) was the main source of round-trip bugs.
//
// If you add a new LocalSong field that should round-trip through .scd files
// or replaceSetlistSongs(), add it here ONLY.

import type { LocalSong } from "./local-db";

// Shape written to .scd JSON files. Same set of fields as LocalSong minus
// id/setlistId/orderIndex (those are implicit / regenerated on re-import).
export type ExportedSong = Omit<LocalSong, "id" | "setlistId" | "orderIndex"> & { isEnd: boolean };

// Shape ready for replaceSetlistSongs / importData. Caller adds orderIndex
// (and setlistId where needed) on top via spread.
export type NormalizedSong = Omit<LocalSong, "id" | "setlistId" | "orderIndex">;

// LocalSong → .scd export shape.
export function serializeSongForExport(s: LocalSong): ExportedSong {
  return {
    title: s.title,
    nextTitle: s.nextTitle,
    artist: s.artist,
    durationSeconds: s.durationSeconds,
    midiNote: s.midiNote,
    midiChannel: s.midiChannel,
    timeRange: s.timeRange,
    isEvent: s.isEvent ?? false,
    isMC: s.isMC ?? false,
    xTime: s.xTime ?? false,
    isEncore: s.isEncore ?? false,
    isEnd: s.isEnd ?? false,
    subTimerSeconds: s.subTimerSeconds ?? 0,
    subTimerTimeRange: s.subTimerTimeRange ?? null,
  };
}

// Untrusted JSON or partial LocalSong → normalized song fields.
// orderIndex is excluded — caller supplies it.
export function normalizeSongForImport(s: any): NormalizedSong {
  return {
    title: s.title ?? "",
    nextTitle: s.nextTitle ?? null,
    artist: s.artist ?? null,
    durationSeconds: typeof s.durationSeconds === "number" ? s.durationSeconds : 0,
    midiNote: typeof s.midiNote === "number" ? s.midiNote : null,
    midiChannel: typeof s.midiChannel === "number" ? s.midiChannel : null,
    timeRange: s.timeRange ?? null,
    isEvent: s.isEvent === true,
    isMC: s.isMC === true,
    xTime: s.xTime === true,
    isEncore: s.isEncore === true,
    isEnd: s.isEnd === true,
    subTimerSeconds: typeof s.subTimerSeconds === "number" ? s.subTimerSeconds : 0,
    subTimerTimeRange: s.subTimerTimeRange ?? null,
  };
}
