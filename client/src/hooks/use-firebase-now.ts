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
import { writeCdsNow, clearCdsNow, registerCdsNowDisconnect } from "@/lib/cds-now";
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

  // Register onDisconnect ONCE on mount. Browser tab close / Wi-Fi loss /
  // PC sleep all clear /cds/now via this hook — React unmount cleanup
  // does NOT cover tab close.
  useEffect(() => {
    registerCdsNowDisconnect();
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
    if (status === "idle") {
      if (prevStatus === "running" || prevStatus === "paused" || prevStatus === "finished") {
        const op = clearCdsNow().catch((e) => reportError("clear", e));
        inFlightRef.current = inFlightRef.current.then(() => op);
      }
      return;
    }

    if (status === "finished" && !songChanged && !titleChanged && !cueChanged && !categoryChanged) {
      return;
    }

    const cue = activeCueRef.current;
    const snapshot = {
      songTitle: songTitleRef.current,
      nextSongTitle: nextSongTitleRef.current,
      remainingMs: Math.max(0, Math.round(remainingRef.current * 1000)),
      totalMs: Math.max(0, Math.round(totalRef.current * 1000)),
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
    const op = writeCdsNow(snapshot).catch((e) => reportError("write", e));
    inFlightRef.current = inFlightRef.current.then(() => op);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, activeSongId, songTitle, nextSongTitle, category, activeCueId]);
}
