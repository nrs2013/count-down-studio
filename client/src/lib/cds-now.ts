// /cds/now writer — broadcasts the active countdown snapshot to Firebase
// Realtime Database so phone-staff (SCHEDULE STUDIO の NOW タブ) can
// mirror the show without holding a copy of CDS itself.
//
// Contract (consumed by SCHEDULE STUDIO):
//   {
//     songTitle:   string | null,
//     remainingMs: number,
//     totalMs:     number,
//     isRunning:   boolean,
//     isPaused:    boolean,
//     sectionLabel: string | null,   // reserved; CDS does not emit yet
//     updatedAt:   number             // Firebase serverTimestamp ms
//   }
//
// We only write on state TRANSITION (start / pause / resume / song change
// / end), not every tick — the consumer recomputes live remaining from
// updatedAt + server-time offset, so per-second writes would just burn
// quota.
//
// `updatedAt` uses Firebase serverTimestamp() instead of Date.now() so the
// receiver doesn't trust a director machine that might be off NTP. The
// receiver should subtract `database.getServerTimeOffset` from Date.now()
// when computing live remaining.

import { ref, set, remove, onDisconnect, serverTimestamp } from "firebase/database";
import { realtimeDb } from "./firebase";

export interface CdsNowSnapshot {
  songTitle: string | null;
  remainingMs: number;
  totalMs: number;
  isRunning: boolean;
  isPaused: boolean;
  sectionLabel?: string | null;
}

export const NOW_PATH = "cds/now";

function nowRef() {
  return ref(realtimeDb, NOW_PATH);
}

export async function writeCdsNow(snap: CdsNowSnapshot): Promise<void> {
  await set(nowRef(), {
    songTitle: snap.songTitle,
    remainingMs: snap.remainingMs,
    totalMs: snap.totalMs,
    isRunning: snap.isRunning,
    isPaused: snap.isPaused,
    sectionLabel: snap.sectionLabel ?? null,
    // serverTimestamp resolves to the Firebase server's wall-clock ms,
    // not the director machine's clock. Receiver adds getServerTimeOffset
    // to its own Date.now() when computing the live remaining.
    updatedAt: serverTimestamp(),
  });
}

export async function clearCdsNow(): Promise<void> {
  await remove(nowRef());
}

// Register an automatic remove() that fires the moment the Firebase server
// notices our connection has dropped — tab close, Wi-Fi loss, PC sleep,
// process kill, all of them. This is the only way to guarantee
// phone-staff stops seeing a ghost countdown after the director leaves;
// React's unmount cleanup does NOT run on browser tab close.
//
// Call once on mount; the registration sticks until disconnection.
export function registerCdsNowDisconnect(): void {
  try {
    onDisconnect(nowRef()).remove();
  } catch {
    // Best-effort; if Firebase isn't ready yet we accept the worst case
    // (a stale node if the tab closes before any state arrives).
  }
}
