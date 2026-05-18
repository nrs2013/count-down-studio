import { useState, useCallback, useRef, useEffect } from "react";

export type CountdownStatus = "idle" | "running" | "paused" | "finished";

interface UseCountdownReturn {
  remainingSeconds: number;
  elapsedSeconds: number;
  totalSeconds: number;
  status: CountdownStatus;
  progress: number;
  isCountUp: boolean;
  start: (durationSeconds: number) => void;
  startCountUp: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  formattedTime: string;
}

export function useCountdown(): UseCountdownReturn {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [status, setStatus] = useState<CountdownStatus>("idle");
  const [isCountUp, setIsCountUp] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const remainingAtPauseRef = useRef<number>(0);
  const elapsedAtPauseRef = useRef<number>(0);
  const isCountUpRef = useRef(false);
  // Mirror status into a ref so pause/resume see the latest value even if the
  // callback hasn't re-created yet (fast foot-pedal taps in production).
  const statusRef = useRef<CountdownStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Expose "is the show actively counting down" as a window flag + event,
  // so main.tsx's SW auto-reload can hold off mid-show. The director must
  // never see the page reload while a song's timer is running.
  useEffect(() => {
    (window as any).__cdsActive = status === "running";
    if (status !== "running") {
      window.dispatchEvent(new Event("cds-countdown-idle"));
    }
  }, [status]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback((durationSeconds: number) => {
    clearTimer();
    setTotalSeconds(durationSeconds);
    setRemainingSeconds(durationSeconds);
    setElapsedSeconds(0);
    setStatus("running");
    setIsCountUp(false);
    isCountUpRef.current = false;
    startTimeRef.current = Date.now();
    remainingAtPauseRef.current = durationSeconds;
    elapsedAtPauseRef.current = 0;

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const remaining = Math.max(0, remainingAtPauseRef.current - elapsed);
      setRemainingSeconds(remaining);
      setElapsedSeconds(elapsedAtPauseRef.current + elapsed);

      if (remaining <= 0) {
        clearTimer();
        setStatus("finished");
      }
    }, 200);
  }, [clearTimer]);

  const startCountUp = useCallback(() => {
    clearTimer();
    setTotalSeconds(0);
    setRemainingSeconds(0);
    setElapsedSeconds(0);
    setStatus("running");
    setIsCountUp(true);
    isCountUpRef.current = true;
    startTimeRef.current = Date.now();
    remainingAtPauseRef.current = 0;
    elapsedAtPauseRef.current = 0;

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const total = elapsedAtPauseRef.current + elapsed;
      setElapsedSeconds(total);
      setRemainingSeconds(total);
    }, 200);
  }, [clearTimer]);

  const pause = useCallback(() => {
    if (statusRef.current !== "running") return;
    clearTimer();
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    if (isCountUpRef.current) {
      elapsedAtPauseRef.current = elapsedAtPauseRef.current + elapsed;
      setElapsedSeconds(elapsedAtPauseRef.current);
      setRemainingSeconds(elapsedAtPauseRef.current);
    } else {
      remainingAtPauseRef.current = Math.max(0, remainingAtPauseRef.current - elapsed);
      setRemainingSeconds(remainingAtPauseRef.current);
      elapsedAtPauseRef.current = elapsedAtPauseRef.current + elapsed;
      setElapsedSeconds(elapsedAtPauseRef.current);
    }
    statusRef.current = "paused";
    setStatus("paused");
  }, [clearTimer]);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    statusRef.current = "running";
    setStatus("running");
    startTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      if (isCountUpRef.current) {
        const total = elapsedAtPauseRef.current + elapsed;
        setElapsedSeconds(total);
        setRemainingSeconds(total);
      } else {
        const remaining = Math.max(0, remainingAtPauseRef.current - elapsed);
        setRemainingSeconds(remaining);
        setElapsedSeconds(elapsedAtPauseRef.current + elapsed);
        if (remaining <= 0) {
          clearTimer();
          statusRef.current = "finished";
          setStatus("finished");
        }
      }
    }, 200);
  }, [clearTimer]);

  const stop = useCallback(() => {
    clearTimer();
    setRemainingSeconds(0);
    setElapsedSeconds(0);
    setTotalSeconds(0);
    setStatus("idle");
    setIsCountUp(false);
    isCountUpRef.current = false;
  }, [clearTimer]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  const progress = totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;

  const displaySeconds = isCountUp ? Math.floor(elapsedSeconds) : Math.ceil(remainingSeconds);
  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;
  const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  return {
    remainingSeconds,
    elapsedSeconds,
    totalSeconds,
    status,
    progress,
    isCountUp,
    start,
    startCountUp,
    pause,
    resume,
    stop,
    formattedTime,
  };
}
