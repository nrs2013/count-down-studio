// useFirebaseNow — pushes the live countdown state to Firebase whenever
// a meaningful TRANSITION happens (start / pause / resume / song change
// / title edit / end). Receiver (SCHEDULE STUDIO phone-staff NOW tab)
// reconstructs the live remaining using Firebase serverTimestamp +
// getServerTimeOffset, so we deliberately do NOT re-write per-second
// tick changes.
//
// Design notes (informed by patrol#5 / Firebase review #46b6af1):
//   - sentinel ("__init__") prevents StrictMode double-mount from skipping
//     the first real transition
//   - finished is NOT treated as "clear" — auto-next-song would race the
//     remove and leave phone-staff blank for a frame. Only idle clears.
//   - songTitle change (title edit, liveTitleOverrides) is its own
//     transition — without this, the director renaming a song never reaches
//     phone-staff
//   - writes are serialized through a single in-flight promise so a
//     rapid start→pause→resume can't land out of order
//   - failures surface as a (throttled) destructive toast instead of a
//     console.warn the director never sees
//   - unmount does NOT clear /cds/now anymore — onDisconnect().remove()
//     registered on mount covers tab close / Wi-Fi loss / PC sleep
//     cleanly. The previous unmount-clear was being triggered by HMR,
//     StrictMode and route-changes and was wiping live shows.

import { useEffect, useRef } from "react";
import { writeCdsNow, clearCdsNow, registerCdsNowDisconnect } from "@/lib/cds-now";
import { toast } from "@/hooks/use-toast";

type CountdownStatus = "idle" | "running" | "paused" | "finished";
type Prev = CountdownStatus | "__init__";

interface UseFirebaseNowArgs {
  status: CountdownStatus;
  remainingSeconds: number;
  totalSeconds: number;
  activeSongId: number | null;
  songTitle: string | null;
}

const ERROR_TOAST_THROTTLE_MS = 5000;

export function useFirebaseNow({
  status,
  remainingSeconds,
  totalSeconds,
  activeSongId,
  songTitle,
}: UseFirebaseNowArgs) {
  // Latest values held in refs so the transition effect always picks up
  // the freshest snapshot without re-running every second.
  const remainingRef = useRef(remainingSeconds);
  remainingRef.current = remainingSeconds;
  const totalRef = useRef(totalSeconds);
  totalRef.current = totalSeconds;
  const songTitleRef = useRef(songTitle);
  songTitleRef.current = songTitle;

  // sentinel start so first real transition fires even if status happens
  // to equal the initial mount value.
  const prevStatusRef = useRef<Prev>("__init__");
  const prevSongIdRef = useRef<number | null | "__init__">("__init__");
  const prevTitleRef = useRef<string | null | "__init__">("__init__");

  // Serialize writes so rapid start→pause→resume can't land out of order.
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

  // Register the on-disconnect remove ONCE on mount. This is the only
  // path that reliably clears /cds/now when the director closes the tab,
  // loses Wi-Fi, or puts the laptop to sleep.
  useEffect(() => {
    registerCdsNowDisconnect();
    // No cleanup: we want the registration to outlive HMR / StrictMode.
  }, []);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const prevSongId = prevSongIdRef.current;
    const prevTitle = prevTitleRef.current;
    prevStatusRef.current = status;
    prevSongIdRef.current = activeSongId;
    prevTitleRef.current = songTitle;

    // Determine if this is a real transition we care about.
    const isInit = prevStatus === "__init__";
    const statusChanged = !isInit && prevStatus !== status;
    const songChanged = prevSongId !== "__init__" && prevSongId !== activeSongId;
    const titleChanged = prevTitle !== "__init__" && prevTitle !== songTitle;

    // On first mount, fire only if we're already running/paused (e.g. a
    // hot reload during a live show). Otherwise wait for the first real
    // transition.
    const fireFromInit = isInit && (status === "running" || status === "paused");

    if (!fireFromInit && !statusChanged && !songChanged && !titleChanged) return;

    // End / reset — clear ONLY when status hits idle. Do NOT clear on
    // finished: the auto-next-song path goes finished → running and we
    // don't want phone-staff to blink blank in between.
    if (status === "idle") {
      if (prevStatus === "running" || prevStatus === "paused" || prevStatus === "finished") {
        const op = clearCdsNow().catch((e) => reportError("clear", e));
        inFlightRef.current = inFlightRef.current.then(() => op);
      }
      return;
    }

    // For finished without a song change, leave the last snapshot in place
    // (matches "曲が終わった瞬間でも残り時間と曲名は表示し続けたい" UX).
    if (status === "finished" && !songChanged && !titleChanged) {
      return;
    }

    // Running, paused, finished-with-song-change, or title edit → write
    // current snapshot. Chain through the in-flight queue to preserve order.
    const snapshot = {
      songTitle: songTitleRef.current,
      remainingMs: Math.max(0, Math.round(remainingRef.current * 1000)),
      totalMs: Math.max(0, Math.round(totalRef.current * 1000)),
      isRunning: status === "running",
      isPaused: status === "paused",
      sectionLabel: null,
    };
    const op = writeCdsNow(snapshot).catch((e) => reportError("write", e));
    inFlightRef.current = inFlightRef.current.then(() => op);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, activeSongId, songTitle]);
}
