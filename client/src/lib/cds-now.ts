// /cds/now writer — broadcasts the active countdown snapshot to Firebase
// Realtime Database so phone-staff (SCHEDULE STUDIO の NOW タブ) can
// mirror the show without holding a copy of CDS itself.
//
// Phase 1 (R388 / CDS commit 後継): /output に出てる主要情報を全部送る:
//   { songTitle, nextSongTitle, remainingMs, totalMs, isRunning, isPaused,
//     isMC, isEvent, isEncore, xTime,
//     activeCueId, activeCueLabel, activeCueColor, activeCueTextColor,
//     updatedAt 
//
// 受信側 (SCHEDULE STUDIO phone-staff/phone-artist) は category flag で
// "MC" / "SE" / "ENCORE" のラベル切替、nextSongTitle で「NEXT: ...」、
// activeCue* で画面全体に cue overlay を被せる。
//
// 書き込みタイミング: 状態遷移時のみ。受け取り側は updatedAt と
// remainingMs から live remaining を計算する。

import { ref, set, remove, onDisconnect, onValue, serverTimestamp } from "firebase/database";
import { realtimeDb } from "./firebase";

export interface CdsNowSnapshot {
  songTitle: string | null;
  nextSongTitle?: string | null;
  remainingMs: number;
  totalMs: number;
  // Count-up (MC / ENCORE / X-TIME): the phone reconstructs the live
  // elapsed as elapsedMs + (serverNow - updatedAt) while isRunning.
  isCountUp?: boolean;
  elapsedMs?: number;
  mcTargetMs?: number;
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
  activeCueBlink?: boolean | null;
  activeCueBlinkSpeed?: string | null;
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
    isCountUp: snap.isCountUp ?? false,
    elapsedMs: snap.elapsedMs ?? 0,
    mcTargetMs: snap.mcTargetMs ?? 0,
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
    activeCueBlink: snap.activeCueBlink ?? null,
    activeCueBlinkSpeed: snap.activeCueBlinkSpeed ?? null,
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

// Fires the callback every time the Firebase connection (re)establishes.
// Needed because onDisconnect registrations are CONSUMED when they fire:
// after a Wi-Fi blip the server has wiped /cds/now and forgotten the
// registration, so the writer must re-register AND re-push its state —
// otherwise every phone shows "CDS WAITING…" until the next transition.
// Returns the unsubscribe function.
export function onCdsNowConnected(cb: () => void): () => void {
  try {
    const connRef = ref(realtimeDb, ".info/connected");
    return onValue(connRef, (s) => {
      if (s.val() === true) cb();
    });
  } catch {
    return () => {};
  }
}
