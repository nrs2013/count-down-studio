import { useState, useEffect, useCallback, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AppModeProvider, useAppMode } from "@/hooks/use-app-mode";
import { ModeTabBar } from "@/components/mode-tab-bar";
import { useUndo } from "@/hooks/use-undo";
import Home from "@/pages/home";
import Manage from "@/pages/manage";
import Output from "@/pages/output";
import OutputFirebase from "@/pages/output-firebase";
import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/error-boundary";

const INSTANCE_CHANNEL = "songcountdown-instance";
const INSTANCE_LS_KEY = "songcountdown-instance-active";
const INSTANCE_SS_KEY = "songcountdown-instance-id";

// Same instance id across reloads in the SAME tab — sessionStorage is per-tab,
// so a SW auto-reload or hand-reload re-uses the id and avoids the page
// "seeing itself" as a different instance + showing the duplicate-tab
// warning. A brand new tab gets a brand new id (sessionStorage is empty).
function getOrCreateInstanceId(): string {
  try {
    const existing = sessionStorage.getItem(INSTANCE_SS_KEY);
    if (existing) return existing;
  } catch (_) {}
  const fresh = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try { sessionStorage.setItem(INSTANCE_SS_KEY, fresh); } catch (_) {}
  return fresh;
}

function useDuplicateGuard(enabled: boolean = true) {
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // 他タブが本番進行中で切り替えを拒否された状態（busy 応答を受けた）
  const [blockedByShow, setBlockedByShow] = useState(false);
  const instanceId = useRef(getOrCreateInstanceId());

  // A live show is sacred: while a countdown is in progress on THIS tab
  // (running / paused / between songs), no signal from another tab may
  // replace this screen with the DuplicateWarning — unmounting /manage
  // would wipe the remaining time and freeze the projector output.
  // The NEW tab still sees its own warning via checkExisting().
  // __cdsOverlayActive も含める: END SHOW サマリー / EVENT INFO 表示中は
  // status が idle なので __cdsActive だけでは守れない（客に見えている最中に
  // 別タブ起動で /manage がアンマウントされ、公演集計が全消えする穴があった）。
  const showInProgress = () =>
    !!((window as any).__cdsActive || (window as any).__cdsOverlayActive);

  useEffect(() => {
    if (!enabled) return;
    let bc: BroadcastChannel | null = null;

    const markActive = () => {
      try {
        localStorage.setItem(INSTANCE_LS_KEY, JSON.stringify({ id: instanceId.current, ts: Date.now() }));
      } catch (_) {}
    };

    const checkExisting = () => {
      try {
        const raw = localStorage.getItem(INSTANCE_LS_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          // 4000 ms window: markActive runs every 3s, so a live tab's ts
          // is always <= 3s old. 4s gives a 1s margin without being so
          // wide that a tab closed seconds ago still looks alive.
          if (data.id !== instanceId.current && Date.now() - data.ts < 4000) {
            return true;
          }
        }
      } catch (_) {}
      return false;
    };

    try {
      bc = new BroadcastChannel(INSTANCE_CHANNEL);
      bc.postMessage({ type: "ping", id: instanceId.current });
      bc.addEventListener("message", (e) => {
        const msg = e.data;
        if (!msg || msg.id === instanceId.current) return;

        if (showInProgress()) {
          // ショー進行中はこの画面を絶対に譲らない。ただし黙殺すると相手タブは
          // 「take-over できた」と誤解して同時稼働（＝出力の取り合い）になるため、
          // busy を返して相手を警告画面に留める。
          if (msg.type === "ping" || msg.type === "take-over") {
            try { bc?.postMessage({ type: "busy", id: instanceId.current }); } catch (_) {}
          }
          return;
        }

        if (msg.type === "ping") {
          setIsDuplicate(true);
        }
        // D8: "pong" 受信は送り手が存在しない死にコードだったため削除
        if (msg.type === "take-over") {
          setIsDuplicate(true);
          // C6: 別タブが「こちらで使用する」を明示的に押した＝制御が移った。
          // 過去に自分が take-over していても警告を再表示する（恒久 dismiss は
          // 2画面同時稼働の温床だった）。
          setDismissed(false);
        }
        if (msg.type === "busy") {
          // 相手が本番進行中。こちらは操作できない状態に戻す。
          setIsDuplicate(true);
          setDismissed(false);
          setBlockedByShow(true);
        }
      });
    } catch (_) {}

    if (checkExisting()) {
      setIsDuplicate(true);
    }

    markActive();
    const interval = setInterval(markActive, 3000);

    const handleStorage = (e: StorageEvent) => {
      if (showInProgress()) return;
      if (e.key === INSTANCE_LS_KEY && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.id !== instanceId.current) {
            setIsDuplicate(true);
          }
        } catch (_) {}
      }
    };
    window.addEventListener("storage", handleStorage);

    // Clear our own active marker when the tab closes — otherwise the next
    // tab opened within the 4-second window sees a stale ts and falsely
    // triggers DuplicateWarning. Only clear when WE are the one holding
    // the marker, so concurrent tabs aren't disrupted.
    const handleBeforeUnload = () => {
      try {
        const raw = localStorage.getItem(INSTANCE_LS_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.id === instanceId.current) {
            localStorage.removeItem(INSTANCE_LS_KEY);
          }
        }
      } catch (_) {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      try { bc?.close(); } catch (_) {}
    };
  }, [enabled]);

  const takeOver = useCallback(() => {
    setIsDuplicate(false);
    setDismissed(true);
    try {
      localStorage.setItem(INSTANCE_LS_KEY, JSON.stringify({ id: instanceId.current, ts: Date.now() }));
    } catch (_) {}
    try {
      const bc = new BroadcastChannel(INSTANCE_CHANNEL);
      bc.postMessage({ type: "take-over", id: instanceId.current });
      bc.close();
    } catch (_) {}
  }, []);

  return { isDuplicate: enabled && isDuplicate && !dismissed, takeOver, blockedByShow };
}

// Chrome の「ウィンドウ管理」許可の状態。これが granted でないと 2 枚目の画面の
// 場所が分からず、出力窓をセカンダリへ運べない。
type WmState = "granted" | "prompt" | "denied" | "unsupported";

function useWindowManagementState(): [WmState, (s: WmState) => void] {
  const [state, setState] = useState<WmState>("unsupported");
  useEffect(() => {
    if (!("getScreenDetails" in window)) return;
    let status: PermissionStatus | null = null;
    const onChange = () => { if (status) setState(status.state as WmState); };
    navigator.permissions
      .query({ name: "window-management" as PermissionName })
      .then((s) => { status = s; setState(s.state as WmState); s.addEventListener("change", onChange); })
      .catch(() => setState("prompt"));
    return () => { status?.removeEventListener("change", onChange); };
  }, []);
  return [state, setState];
}

// 許可を CDS の画面上で、出力窓より先にはっきり求める。
// 以前は出力窓を開いた直後に Chrome の許可の吹き出しが出ていたため、
// 窓の陰に隠れて「許可ボタンが出ない」状態になっていた。
function SecondaryPermissionPanel({
  wmState, screenCount, onRequest, onOpenAnyway, onCancel, requesting,
}: {
  wmState: WmState;
  screenCount: number | null;
  onRequest: () => void;
  onOpenAnyway: () => void;
  onCancel: () => void;
  requesting: boolean;
}) {
  const btn = {
    border: "0.5px solid rgba(250,250,248,0.45)",
    background: "rgba(250,250,248,0.06)",
    color: "#fafaf8",
    fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
  } as const;
  const primary = {
    border: "0.5px solid #c186c8",
    background: "rgba(193,134,200,0.18)",
    color: "#fafaf8",
    fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
  } as const;
  let title = "セカンダリ画面を使う許可が必要です";
  let body = "出力をセカンダリ（LED / プロジェクター）に出すには、Chrome の「ウィンドウ管理」を許可してください。下のボタンを押すと Chrome が許可を求めるので「許可」を押してください。";
  if (wmState === "denied") {
    title = "セカンダリ画面の使用がブロックされています";
    body = "アドレスバー左のアイコン →「サイトの設定」→「ウィンドウ管理」を「許可」に変えて、このページを再読み込み（Cmd+R）してください。";
  } else if (wmState === "granted" && screenCount !== null && screenCount < 2) {
    title = "2 枚目の画面が見つかりません";
    body = "許可は済んでいますが、Mac が画面を 1 枚しか認識していません。ケーブル・変換アダプタと、システム設定 → ディスプレイで「拡張」（ミラーではない）になっているか確認してください。";
  } else if (wmState === "granted") {
    title = "許可されました";
    body = "「出力する」を押すと、セカンダリに出力の窓を開きます。";
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(10,10,10,0.72)" }} data-testid="secondary-permission-panel">
      <div className="max-w-md w-[92%] p-6 rounded" style={{ background: "#141312", border: "0.5px solid #2c2a27" }}>
        <h2 className="text-base font-bold mb-3" style={{ color: "#fafaf8", fontFamily: "'Noto Sans JP', 'Inter', sans-serif" }}>{title}</h2>
        <p className="text-sm mb-5" style={{ color: "#a8a8a0", lineHeight: 1.7, fontFamily: "'Noto Sans JP', 'Inter', sans-serif" }}>{body}</p>
        <div className="flex flex-wrap gap-2 justify-end">
          <button className="px-4 py-2 rounded text-sm" style={btn} onClick={onCancel} data-testid="button-secondary-cancel">やめる</button>
          <button className="px-4 py-2 rounded text-sm" style={btn} onClick={onOpenAnyway} data-testid="button-secondary-open-anyway">
            {wmState === "granted" && (screenCount ?? 0) >= 2 ? "出力する" : "この画面に出力する"}
          </button>
          {wmState === "prompt" && (
            <button className="px-4 py-2 rounded text-sm font-bold" style={primary} onClick={onRequest} disabled={requesting} data-testid="button-secondary-allow">
              {requesting ? "Chrome の確認待ち…" : "セカンダリの使用を許可する"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AppHeader() {
  const [location] = useLocation();
  const { outputOpen, outputFullscreen, openOutputWindow, closeOutputWindow, showOutputOnDisplay } = useAppMode();
  const [wmState, setWmState] = useWindowManagementState();
  const [panelOpen, setPanelOpen] = useState(false);
  const [screenCount, setScreenCount] = useState<number | null>(null);
  const [requesting, setRequesting] = useState(false);
  // DISPLAY ボタンなど、ヘッダー以外の場所からも許可の案内を出せるようにする
  useEffect(() => {
    const open = () => setPanelOpen(true);
    window.addEventListener("cds-need-secondary-permission", open);
    return () => window.removeEventListener("cds-need-secondary-permission", open);
  }, []);
  if (location === "/output" || location === "/") return null;

  const currentMode = outputOpen ? "show" as const : "setlist" as const;

  const handleOutputOn = () => {
    // 許可が未回答・拒否の時だけ、窓を開く前に CDS の画面で案内する。
    // 許可済み / 非対応ブラウザは従来どおりすぐ開く（本番の操作を増やさない）。
    if (wmState === "prompt" || wmState === "denied") {
      setPanelOpen(true);
      return;
    }
    if (outputOpen) {
      // 既に開いている時は開き直さず（LED が瞬くため）、前に出してセカンダリへ運ぶ
      showOutputOnDisplay({ skipPermissionCheck: true });
      return;
    }
    openOutputWindow();
  };

  const handleRequest = async () => {
    setRequesting(true);
    try {
      const sd = await (window as any).getScreenDetails();
      setScreenCount(sd?.screens?.length ?? null);
      setWmState("granted");
    } catch (_) {
      try {
        const s = await navigator.permissions.query({ name: "window-management" as PermissionName });
        setWmState(s.state as WmState);
      } catch (_) {
        setWmState("denied");
      }
    }
    setRequesting(false);
  };

  // ModeTabBar sits inside the fixed topbar strip (56px) on the right side.
  return (
    <>
    {panelOpen && (
      <SecondaryPermissionPanel
        wmState={wmState}
        screenCount={screenCount}
        requesting={requesting}
        onRequest={handleRequest}
        onCancel={() => setPanelOpen(false)}
        onOpenAnyway={() => {
          setPanelOpen(false);
          if (outputOpen) showOutputOnDisplay({ skipPermissionCheck: true });
          else openOutputWindow();
        }}
      />
    )}
    <div
      className="fixed top-0 right-4 z-50 flex items-center h-[56px]"
      style={{ background: "transparent" }}
      data-testid="app-header"
    >
      <span
        className="mr-2 select-none"
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#5a5a54" }}
        title="いま動いている CDS の版"
        data-testid="build-label"
      >
        {String((window as any).__cdsBuild ?? "").replace("songcountdown-", "")}
      </span>
      <ModeTabBar
        outputOpen={outputOpen}
        onOutputOn={handleOutputOn}
        onOutputOff={() => {
          // SET LIST / OFF は隣接ボタン。本番中の誤タップで客前の LED が
          // 消えるので、ショー進行中だけ一度だけ確認する。
          if ((window as any).__cdsActive || (window as any).__cdsOverlayActive) {
            if (!confirm("ショー進行中です。サブディスプレイ（LED / プロジェクター）を消しますか？")) return;
          }
          closeOutputWindow();
        }}
      />
    </div>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/manage" component={Manage} />
      <Route path="/output" component={Output} />
      <Route path="/output-firebase" component={OutputFirebase} />
      <Route component={NotFound} />
    </Switch>
  );
}

function UndoListener() {
  useUndo();
  return null;
}

function DuplicateWarning({ onTakeOver, blockedByShow }: { onTakeOver: () => void; blockedByShow?: boolean }) {
  return (
    <div className="h-screen w-full flex items-center justify-center" style={{ background: "#262624" }}>
      <div
        className="max-w-md mx-auto p-8 rounded-lg text-center"
        style={{
          background: "rgba(193,134,200,0.05)",
          border: "1px solid rgba(193,134,200,0.2)",
        }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{
            background: "rgba(250,204,21,0.1)",
            border: "1px solid rgba(250,204,21,0.3)",
          }}
        >
          <span style={{ fontSize: 28 }}>!</span>
        </div>
        <h2
          className="text-lg font-bold mb-3"
          style={{ color: "rgba(250,204,21,0.9)", fontFamily: "'Noto Sans JP', 'Inter', sans-serif" }}
        >
          {blockedByShow ? "本番進行中です" : "既に起動中です"}
        </h2>
        <p
          className="text-sm mb-6"
          style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Noto Sans JP', 'Inter', sans-serif", lineHeight: 1.6 }}
        >
          {blockedByShow
            ? "別のウィンドウでショーが進行中のため、こちらには切り替えられません。進行中の画面を操作してください（このタブは閉じて大丈夫です）。"
            : "COUNT DOWN STUDIO は別のタブまたはウィンドウで既に開かれています。複数同時に起動すると競合が発生する可能性があります。"}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            className="px-5 py-2 rounded-full text-xs font-bold tracking-wider uppercase transition-all"
            style={{
              background: blockedByShow ? "rgba(120,120,112,0.35)" : "rgba(193,134,200,0.8)",
              color: blockedByShow ? "rgba(255,255,255,0.45)" : "#fff",
              border: blockedByShow ? "1px solid rgba(120,120,112,0.5)" : "1px solid rgba(193,134,200,0.9)",
              fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
              cursor: blockedByShow ? "not-allowed" : "pointer",
            }}
            onClick={onTakeOver}
            disabled={blockedByShow}
            data-testid="button-take-over"
          >
            こちらで使用する
          </button>
        </div>
      </div>
    </div>
  );
}

function AppLayout() {
  const [location] = useLocation();
  // /output-firebase も chrome なし (phone-staff の iframe 埋め込みで director の
  // AppHeader = SET LIST / SHOW ON-OFF ボタンが出ると邪魔なので)
  const isOutput = location === "/output" || location === "/output-firebase";
  const isHome = location === "/";
  const { isDuplicate, takeOver, blockedByShow } = useDuplicateGuard(!isOutput && !isHome);

  if (isOutput || isHome) {
    return <Router />;
  }

  if (isDuplicate) {
    return <DuplicateWarning onTakeOver={takeOver} blockedByShow={blockedByShow} />;
  }

  return (
    <div className="h-screen w-full overflow-hidden relative">
      <UndoListener />
      <AppHeader />
      <div className="h-full overflow-hidden">
        <Router />
      </div>
    </div>
  );
}

// GitHub Pages base path (stripped of trailing slash for wouter's base convention)
const ROUTER_BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={ROUTER_BASE}>
          <AppModeProvider>
            <Toaster />
            <AppLayout />
          </AppModeProvider>
        </WouterRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
