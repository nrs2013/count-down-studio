// useFirebaseNow — pushes the live countdown state to Firebase whenever
// a meaningful TRANSITION happens (start / pause / resume / song change
// / end). The receiver (SCHEDULE STUDIO phone-staff NOW tab) reconstructs
// the live remaining time using updatedAt, so we deliberately do NOT
// re-write per-second tick changes.
//
// Read latest values via refs so the transition effect always picks up
// the freshest snapshot without having to re-run every second.

import { useEffect, useRef } from "react";
import { writeCdsNow, clearCdsNow } from "@/lib/cds-now";

type CountdownStatus = "idle" | "running" | "paused" | "finished";

interface UseFirebaseNowArgs {
  status: CountdownStatus;
  remainingSeconds: number;
  totalSeconds: number;
  activeSongId: number | null;
  songTitle: string | null;
}

export function useFirebaseNow({
  status,
  remainingSeconds,
  totalSeconds,
  activeSongId,
  songTitle,
}: UseFirebaseNowArgs) {
  const remainingRef = useRef(remainingSeconds);
  remainingRef.current = remainingSeconds;
  const totalRef = useRef(totalSeconds);
  totalRef.current = totalSeconds;
  const songTitleRef = useRef(songTitle);
  songTitleRef.current = songTitle;

  const prevStatusRef = useRef<CountdownStatus>(status);
  const prevSongIdRef = useRef<number | null>(activeSongId);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const prevSongId = prevSongIdRef.current;
    prevStatusRef.current = status;
    prevSongIdRef.current = activeSongId;

    // First render with no real transition — skip.
    if (prevStatus === status && prevSongId === activeSongId) return;

    // End / reset — clear the node so phone-staff doesn't show a ghost.
    // Only fire if we had something live to clear.
    if (status === "idle" || status === "finished") {
      if (prevStatus === "running" || prevStatus === "paused") {
        clearCdsNow().catch((e) => {
          // eslint-disable-next-line no-console
          console.warn("[CDS NOW] clear failed:", e);
        });
      }
      return;
    }

    // running / paused — write current snapshot.
    writeCdsNow({
      songTitle: songTitleRef.current,
      remainingMs: Math.max(0, Math.round(remainingRef.current * 1000)),
      totalMs: Math.max(0, Math.round(totalRef.current * 1000)),
      isRunning: status === "running",
      isPaused: status === "paused",
      sectionLabel: null,
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn("[CDS NOW] write failed:", e);
    });
  }, [status, activeSongId]);

  // On unmount (tab close / route change) wipe the node so phone-staff
  // doesn't keep displaying a frozen countdown from a dead session.
  useEffect(() => {
    return () => {
      clearCdsNow().catch(() => {});
    };
  }, []);
}
