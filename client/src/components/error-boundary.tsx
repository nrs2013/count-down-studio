import { Component, type ErrorInfo, type ReactNode } from "react";

// Wraps the whole app so a single thrown render error doesn't take the
// page to a white screen mid-show. The director gets a clear fallback
// with a reload button instead of nothing.
//
// Error Boundaries can ONLY be implemented as class components — there is
// no hooks equivalent. Keep this file minimal and React-only.

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[CDS ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 32,
            color: "#fafaf8",
            background: "#0a0a0a",
            minHeight: "100vh",
            fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
          }}
        >
          <div style={{ maxWidth: 520, margin: "0 auto" }}>
            <h1
              style={{
                color: "#c186c8",
                fontSize: 22,
                marginBottom: 16,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              CDS で問題が起きました
            </h1>
            <p
              style={{
                fontSize: 14,
                marginBottom: 24,
                opacity: 0.85,
                lineHeight: 1.7,
              }}
            >
              画面の再読み込みで復帰できます。
              セットリスト・曲のデータはブラウザの IndexedDB に保存されているので失われていません。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 22px",
                background: "transparent",
                border: "0.5px solid #c186c8",
                color: "#fafaf8",
                cursor: "pointer",
                fontSize: 13,
                letterSpacing: "0.12em",
                borderRadius: 2,
                fontFamily: "inherit",
              }}
            >
              再読み込み
            </button>
            <details style={{ marginTop: 32, fontSize: 11, opacity: 0.55 }}>
              <summary style={{ cursor: "pointer", marginBottom: 8 }}>
                技術的な詳細
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  whiteSpace: "pre-wrap",
                  padding: 12,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 2,
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  overflow: "auto",
                  maxHeight: 400,
                }}
              >
                {this.state.error.stack || this.state.error.message}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
