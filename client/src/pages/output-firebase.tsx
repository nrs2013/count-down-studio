// /output-firebase — Firebase /cds/now から状態を受け取って、
// CDS の既存 CountdownDisplay + CueOverlay をそのまま描画するページ。
//
// 用途:
//   SCHEDULE STUDIO の phone-staff.html / phone-artist.html の NOW タブから
//   <iframe src="https://nrs2013.github.io/count-down-studio/output-firebase">
//   で埋め込まれ、CDS と完全同形のカウントダウン表示をスマホで再現する。
//
// 設計上のポイント:
//   - データソースは broadcastChannel / postMessage ではなく Firebase Realtime DB
//     (manage.tsx 側で useFirebaseNow が状態遷移時に /cds/now に書く)
//   - serverTimestamp 補正で live remaining を計算 (NTP ズレ対策)
//   - 100ms ごとに再レンダーして CDS の /output と同じ滑らかさを再現
//   - データ未着時は黒画面に "CDS WAITING..." と表示 (offline placeholder)
//   - cue overlay は activeCueId から cues 配列を引いて CueOverlay にそのまま渡す
//     (= cue label / color / blink / size 全部 CDS と同一)

import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import { CountdownDisplay } from "@/components/countdown-display";
import { type LocalCue } from "@/lib/local-db";
import { CueOverlay } from "@/pages/output";

interface CdsNowSnapshot {
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
  activeCueBlink?: boolean | null;
  activeCueBlinkSpeed?: string | null;
  updatedAt?: number;
}

export default function OutputFirebase() {
  const [snap, setSnap] = useState<CdsNowSnapshot | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [, setTick] = useState(0);

  // /cds/now を購読
  useEffect(() => {
    const r = ref(realtimeDb, "cds/now");
    return onValue(r, (s) => setSnap(s.val() as CdsNowSnapshot | null));
  }, []);

  // serverTimestamp 補正用オフセット
  useEffect(() => {
    const r = ref(realtimeDb, ".info/serverTimeOffset");
    return onValue(r, (s) => setServerOffset((s.val() as number | null) ?? 0));
  }, []);

  // 100ms 毎に再レンダー (タイマー滑らかに動かす)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 100);
    return () => clearInterval(id);
  }, []);

  // ライブ残り時間 (serverTimestamp 補正)
  const liveRemainingMs = (() => {
    if (!snap) return 0;
    if (!snap.isRunning) return Math.max(0, snap.remainingMs ?? 0);
    const nowServer = Date.now() + serverOffset;
    const elapsed = nowServer - (snap.updatedAt ?? nowServer);
    return Math.max(0, (snap.remainingMs ?? 0) - elapsed);
  })();

  const totalSeconds = (snap?.totalMs ?? 0) / 1000;
  const remainingSeconds = liveRemainingMs / 1000;
  const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
  const progress = totalSeconds > 0 ? Math.min(100, (elapsedSeconds / totalSeconds) * 100) : 0;

  const totalSecondsCeil = Math.ceil(remainingSeconds);
  const mm = Math.floor(totalSecondsCeil / 60);
  const ss = totalSecondsCeil - mm * 60;
  const formattedTime = `${mm}:${ss.toString().padStart(2, "0")}`;

  const status: "idle" | "running" | "paused" | "finished" =
    !snap ? "idle"
    : remainingSeconds <= 0 && (snap.isRunning || snap.isPaused) ? "finished"
    : snap.isPaused ? "paused"
    : snap.isRunning ? "running"
    : "idle";

  // Firebase から来た cue 情報を「そのまま」使う。
  // 以前は cues.find(c => c.id === activeCueId) でローカル IndexedDB の cue を
  // 引いていたが、director の Mac とスマホ（このページを iframe で開く端末）で
  // cue の id が一致せず、左矢印 HOLD! を押しても スマホ側で別 id の GO! が出る
  // バグがあった。activeCueLabel / Color / Blink を Firebase の値から直接組み立てる。
  const activeCue: LocalCue | null = (snap && snap.activeCueId != null && snap.activeCueLabel)
    ? {
        id: snap.activeCueId,
        label: snap.activeCueLabel,
        color: snap.activeCueColor ?? "#f5c518",
        textColor: snap.activeCueTextColor ?? undefined,
        shortcutKey: "",
        blink: snap.activeCueBlink ?? true,
        blinkSpeed: (snap.activeCueBlinkSpeed ?? "normal") as "slow" | "normal" | "fast",
        orderIndex: 0,
      }
    : null;

  if (!snap) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#3a3a3a",
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          fontSize: "clamp(24px, 5vw, 48px)",
          letterSpacing: "0.2em",
        }}
        data-testid="output-firebase-waiting"
      >
        CDS WAITING…
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        position: "relative",
        overflow: "hidden",
      }}
      data-testid="output-firebase"
    >
      <CountdownDisplay
        formattedTime={formattedTime}
        status={status}
        progress={progress}
        songTitle={snap.songTitle ?? undefined}
        nextSongTitle={snap.nextSongTitle ?? undefined}
        remainingSeconds={remainingSeconds}
        isEvent={snap.isEvent}
        xTime={snap.xTime}
        isMC={snap.isMC}
        isEncore={snap.isEncore}
        fillWidth
      />
      {activeCue && <CueOverlay cue={activeCue} />}
    </div>
  );
}
