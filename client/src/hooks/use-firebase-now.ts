// useFirebaseNow — pushes the live countdown state to Firebase whenever
// a meaningful TRANSITION happens. Phase 1 拡張 (R388 / 後継):
// /output に表示してる主要情報を全部スマホ側に届ける:
//   - 現在曲・次曲
//   - 残り時間・総尺
//   - running/paused
//   - カテゴリ flag (isMC / isEvent / isEncore / xTime)
//   - cue overlay (HOLD! / GO! 等、activeCueId + label + color)
//
// 受け側 (SCHEDULE STUDIO phone-staff/phone-artist) はこれを使って
// NOW タブで director と同じ情報量を表示。
//
// 書き込みは状態遷移時のみ。tick 毎の remainingSeconds 変化では書かない。
// 連続書き込みは inFlightRef で直列化、失敗時は throttled toast。

import { useEffect, useRef } from "react";
import { writeCdsNow, clearCdsNow, registerCdsNowDisconnect, onCdsNowConnected, type CdsNowSnapshot } from "@/lib/cds-now";
import { toast } from "@/hooks/use-toast";

type CountdownStatus = "idle" | "running" | "paused" | "finished";
type Prev<T> = T | "__init__";

interface CueInfo {
  label: string;
  color: string;
  textColor?: string | null;
  blink?: boolean;
  blinkSpeed?: string;
}

interface UseFirebaseNowArgs {
  status: CountdownStatus;
  remainingSeconds: number;
  totalSeconds: number;
  isCountUp?: boolean;
  elapsedSeconds?: number;
  mcTargetSeconds?: number;
  activeSongId: number | null;
  songTitle: string | null;
  nextSongTitle?: string | null;
  isMC?: boolean;
  isEvent?: boolean;
  isEncore?: boolean;
  xTime?: boolean;
  activeCueId?: number | null;
  activeCue?: CueInfo | null;
}

const ERROR_TOAST_THROTTLE_MS = 5000;

export function useFirebaseNow({
  status,
  remainingSeconds,
  totalSeconds,
  isCountUp = false,
  elapsedSeconds = 0,
  mcTargetSeconds = 0,
  activeSongId,
  songTitle,
  nextSongTitle = null,
  isMC = false,
  isEvent = false,
  isEncore = false,
  xTime = false,
  activeCueId = null,
  activeCue = null,
}: UseFirebaseNowArgs) {
  // Refs for values that change every tick — read inside the transition
  // effect without forcing a re-run.
  const remainingRef = useRef(remainingSeconds);
  remainingRef.current = remainingSeconds;
  const totalRef = useRef(totalSeconds);
  totalRef.current = totalSeconds;
  const isCountUpRef = useRef(isCountUp);
  isCountUpRef.current = isCountUp;
  const elapsedRef = useRef(elapsedSeconds);
  elapsedRef.current = elapsedSeconds;
  const mcTargetRef = useRef(mcTargetSeconds);
  mcTargetRef.current = mcTargetSeconds;
  const songTitleRef = useRef(songTitle);
  songTitleRef.current = songTitle;
  const nextSongTitleRef = useRef(nextSongTitle);
  nextSongTitleRef.current = nextSongTitle;
  const isMCRef = useRef(isMC);
  isMCRef.current = isMC;
  const isEventRef = useRef(isEvent);
  isEventRef.current = isEvent;
  const isEncoreRef = useRef(isEncore);
  isEncoreRef.current = isEncore;
  const xTimeRef = useRef(xTime);
  xTimeRef.current = xTime;
  const activeCueRef = useRef(activeCue);
  activeCueRef.current = activeCue;

  // Prev sentinels — first effect run is detected via "__init__".
  const prevStatusRef = useRef<Prev<CountdownStatus>>("__init__");
  const prevSongIdRef = useRef<Prev<number | null>>("__init__");
  const prevTitleRef = useRef<Prev<string | null>>("__init__");
  const prevNextTitleRef = useRef<Prev<string | null>>("__init__");
  const prevCategoryRef = useRef<Prev<string>>("__init__");
  const prevCueIdRef = useRef<Prev<number | null>>("__init__");

  // Serialize writes so rapid transitions (start→pause→resume, cue
  // press→release) can't land out of order.
  const inFlightRef = useRef<Promise<unknown>>(Promise.resolve());

  // Throttle destructive error toasts so a network outage doesn't spam.
  const lastErrorToastAtRef = useRef(0);
  const reportError = (where: string, e: unknown) => {
    const now = Date.now();
    if (now - lastErrorToastAtRef.current < ERROR_TOAST_THROTTLE_MS) return;
    lastErrorToastAtRef.current = now;
    toast({
      title: "NOW 同期失敗",
      description: `phone-staff への送信が失敗しています（${where}）。ネットワーク確認を。`,
      variant: "destructive",
    });
    // eslint-disable-next-line no-console
    console.warn("[CDS NOW]", where, e);
  };

  // Last snapshot actually written (null = cleared / nothing yet). Used to
  // re-push after a reconnect, because the server wipes /cds/now via
  // onDisconnect on any Wi-Fi blip and nothing else would rewrite it
  // until the NEXT transition — phones would sit on "CDS WAITING…".
  const lastSnapshotRef = useRef<CdsNowSnapshot | null>(null);

  // (Re)register the server-side auto-clear on EVERY (re)connect —
  // onDisconnect registrations are consumed when they fire — and re-push
  // the state the server just wiped. Covers tab close / Wi-Fi loss /
  // PC sleep; React unmount cleanup does NOT cover tab close.
  useEffect(() => {
    const off = onCdsNowConnected(() => {
      registerCdsNowDisconnect();
      const snap = lastSnapshotRef.current;
      if (snap) {
        // 凍結スナップショットをそのまま再送すると updatedAt だけ今の時刻になり、
        // スマホの残り時間が「最後の遷移時点の値」まで巻き戻って見える。
        // 時間系フィールドだけ毎 tick 更新済みの ref から現在値で組み直して送る。
        const fresh: CdsNowSnapshot = {
          ...snap,
          remainingMs: Math.max(0, Math.round(remainingRef.current * 1000)),
          elapsedMs: Math.max(0, Math.round(elapsedRef.current * 1000)),
        };
        const op = writeCdsNow(fresh).catch((e) => reportError("reconnect", e));
        inFlightRef.current = inFlightRef.current.then(() => op);
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Encode flags into a single string so we can detect category changes
  // without comparing 4 booleans.
  const category =
    isMC ? "mc" :
    isEvent ? "event" :
    isEncore ? "encore" :
    xTime ? "xtime" : "song";

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const prevSongId = prevSongIdRef.current;
    const prevTitle = prevTitleRef.current;
    const prevNextTitle = prevNextTitleRef.current;
    const prevCategory = prevCategoryRef.current;
    const prevCueId = prevCueIdRef.current;

    prevStatusRef.current = status;
    prevSongIdRef.current = activeSongId;
    prevTitleRef.current = songTitle;
    prevNextTitleRef.current = nextSongTitle;
    prevCategoryRef.current = category;
    prevCueIdRef.current = activeCueId;

    const isInit = prevStatus === "__init__";
    const statusChanged = !isInit && prevStatus !== status;
    const songChanged = prevSongId !== "__init__" && prevSongId !== activeSongId;
    const titleChanged = prevTitle !== "__init__" && prevTitle !== songTitle;
    const nextTitleChanged = prevNextTitle !== "__init__" && prevNextTitle !== nextSongTitle;
    const categoryChanged = prevCategory !== "__init__" && prevCategory !== category;
    const cueChanged = prevCueId !== "__init__" && prevCueId !== activeCueId;

    const fireFromInit = isInit && (status === "running" || status === "paused");

    if (!fireFromInit && !statusChanged && !songChanged && !titleChanged &&
        !nextTitleChanged && !categoryChanged && !cueChanged) {
      return;
    }

    // End / reset — clear ONLY when status hits idle. finished は last
    // snapshot を残す (自動 next song でブランクにならないように)。
    // 例外: 開演前 (idle) に cue を押した場合は cue だけのスナップショットを
    // 送る — STAND BY! はタイマーが走る前にこそ出したいもの。離したら clear。
    if (status === "idle") {
      const idleCue = activeCueRef.current;
      if (activeCueId != null && idleCue) {
        const snapshot: CdsNowSnapshot = {
          songTitle: null,
          nextSongTitle: null,
          remainingMs: 0,
          totalMs: 0,
          isCountUp: false,
          elapsedMs: 0,
          mcTargetMs: 0,
          isRunning: false,
          isPaused: false,
          isMC: false,
          isEvent: false,
          isEncore: false,
          xTime: false,
          activeCueId: activeCueId,
          activeCueLabel: idleCue.label,
          activeCueColor: idleCue.color,
          activeCueTextColor: idleCue.textColor ?? null,
          activeCueBlink: idleCue.blink ?? null,
          activeCueBlinkSpeed: idleCue.blinkSpeed ?? null,
          sectionLabel: null,
        };
        lastSnapshotRef.current = snapshot;
        const op = writeCdsNow(snapshot).catch((e) => reportError("write", e));
        inFlightRef.current = inFlightRef.current.then(() => op);
      } else if (prevStatus === "running" || prevStatus === "paused" || prevStatus === "finished" || cueChanged) {
        lastSnapshotRef.current = null;
        const op = clearCdsNow().catch((e) => reportError("clear", e));
        inFlightRef.current = inFlightRef.current.then(() => op);
      }
      return;
    }

    if (status === "finished" && !songChanged && !titleChanged && !cueChanged && !categoryChanged) {
      return;
    }

    const cue = activeCueRef.current;
    const snapshot: CdsNowSnapshot = {
      songTitle: songTitleRef.current,
      nextSongTitle: nextSongTitleRef.current,
      remainingMs: Math.max(0, Math.round(remainingRef.current * 1000)),
      totalMs: Math.max(0, Math.round(totalRef.current * 1000)),
      isCountUp: isCountUpRef.current,
      elapsedMs: Math.max(0, Math.round(elapsedRef.current * 1000)),
      mcTargetMs: Math.max(0, Math.round(mcTargetRef.current * 1000)),
      isRunning: status === "running",
      isPaused: status === "paused",
      isMC: isMCRef.current,
      isEvent: isEventRef.current,
      isEncore: isEncoreRef.current,
      xTime: xTimeRef.current,
      activeCueId: activeCueId,
      activeCueLabel: cue?.label ?? null,
      activeCueColor: cue?.color ?? null,
      activeCueTextColor: cue?.textColor ?? null,
      activeCueBlink: cue?.blink ?? null,
      activeCueBlinkSpeed: cue?.blinkSpeed ?? null,
      sectionLabel: null,
    };
    lastSnapshotRef.current = snapshot;
    const op = writeCdsNow(snapshot).catch((e) => reportError("write", e));
    inFlightRef.current = inFlightRef.current.then(() => op);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, activeSongId, songTitle, nextSongTitle, category, activeCueId]);
}
