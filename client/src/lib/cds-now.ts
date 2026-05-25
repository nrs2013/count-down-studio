// /cds/now writer — broadcasts the active countdown snapshot to Firebase
// Realtime Database so phone-staff (SCHEDULE STUDIO の NOW タブ) can
// mirror the show without holding a copy of CDS itself.
//
// Phase 1 (R388 / CDS commit 後継): /output に出てる主要情報を全部送る:
//   { songTitle, nextSongTitle, remainingMs, totalMs, isRunning, isPaused,
//     isMC, isEvent, isEncore, xTime,
//     activeCueId, activeCueLabel, activeCueColor, activeCueTextColor,
//     sectionLabel, updatedAt }
//
// 受信側 (SCHEDULE STUDIO phone-staff/phone-artist) は category flag で
// "MC" / "SE" / "ENCORE" のラベル切替、nextSongTitle で「NEXT: ...」、
// activeCue* で画面全体に cue overlay を被せる。
//
// 書き込みタイミング: 状態遷移時のみ。受け取り側は updatedAt と
// remainingMs から live remaining を計算する。

import { ref, set, remove, onDisconnect, serverTimestamp } from "firebase/database";
import { realtimeDb } from "./firebase";

export interface CdsNowSnapshot {
  songTitle: string | null;
  nextSongTitle?: string | null;
  remainingMs: number;
  totalMs: number;
  isRunning: boolean;
  isPaused: boolean;
  isMC?: boolean;
  isEvent?: boolean;
  isEncore?: boolean;
  xTime?: boolean;
  activeCueId?: number | null;
  activeCueLabel?: string | null;
  activeCueColor?: string | null;
  activeCueTextColor?: string | null;
  sectionLabel?: string | null;
}

export const NOW_PATH = "cds/now";

function nowRef() {
  return ref(realtimeDb, NOW_PATH);
}

export async function writeCdsNow(snap: CdsNowSnapshot): Promise<void> {
  await set(nowRef(), {
    songTitle: snap.songTitle,
    nextSongTitle: snap.nextSongTitle ?? null,
    remainingMs: snap.remainingMs,
    totalMs: snap.totalMs,
    isRunning: snap.isRunning,
    isPaused: snap.isPaused,
    isMC: snap.isMC ?? false,
    isEvent: snap.isEvent ?? false,
    isEncore: snap.isEncore ?? false,
    xTime: snap.xTime ?? false,
    activeCueId: snap.activeCueId ?? null,
    activeCueLabel: snap.activeCueLabel ?? null,
    activeCueColor: snap.activeCueColor ?? null,
    activeCueTextColor: snap.activeCueTextColor ?? null,
    sectionLabel: snap.sectionLabel ?? null,
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
