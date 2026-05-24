// /cds/now writer — broadcasts the active countdown snapshot to Firebase
// Realtime Database so phone-staff (SCHEDULE STUDIO の NOW タブ) can
// mirror the show without holding a copy of CDS itself.
//
// Contract (consumed by SCHEDULE STUDIO):
//   {
//     songTitle: string | null,
//     remainingMs: number,
//     totalMs:     number,
//     isRunning:   boolean,
//     isPaused:    boolean,
//     sectionLabel: string | null,   // reserved; CDS does not emit yet
//     updatedAt:   number             // Date.now() at write
//   }
//
// We only write on state TRANSITION (start / pause / resume / song change
// / end), not every tick — the consumer recomputes live remaining as
//   `remainingMs - (Date.now() - updatedAt)`
// using updatedAt, so per-second writes would just burn quota.

import { ref, set, remove } from "firebase/database";
import { realtimeDb } from "./firebase";

export interface CdsNowSnapshot {
  songTitle: string | null;
  remainingMs: number;
  totalMs: number;
  isRunning: boolean;
  isPaused: boolean;
  sectionLabel?: string | null;
}

const NOW_PATH = "cds/now";

export async function writeCdsNow(snap: CdsNowSnapshot): Promise<void> {
  await set(ref(realtimeDb, NOW_PATH), {
    songTitle: snap.songTitle,
    remainingMs: snap.remainingMs,
    totalMs: snap.totalMs,
    isRunning: snap.isRunning,
    isPaused: snap.isPaused,
    sectionLabel: snap.sectionLabel ?? null,
    updatedAt: Date.now(),
  });
}

export async function clearCdsNow(): Promise<void> {
  await remove(ref(realtimeDb, NOW_PATH));
}
