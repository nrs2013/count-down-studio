import { useState, useEffect, useRef } from "react";
import { type LocalCue } from "@/lib/local-db";
import { useCues, useCreateCue, useUpdateCue, useDeleteCue } from "@/hooks/use-local-data";
import { CueOverlay } from "@/pages/output";

// Cue Manager Modal — full edit UI for the customisable cue cards.
// Mounted from PerformanceEditor's cue bar (cog button). Lets the
// director add, edit, recolor, rekey, blink-tune, and remove cues.
// All edits write through to IndexedDB via React Query mutations.

const COLOR_PRESETS: { label: string; hex: string }[] = [
  { label: "Yellow", hex: "#f5c518" },
  { label: "Green",  hex: "#2dba4e" },
  { label: "Red",    hex: "#e24b4a" },
  { label: "Blue",   hex: "#378add" },
  { label: "Purple", hex: "#c186c8" },
  { label: "Cyan",   hex: "#5be0ca" },
  { label: "Orange", hex: "#ef9f27" },
  { label: "Pink",   hex: "#ed93b1" },
  { label: "White",  hex: "#f0ece0" },
];

type DraftCue = Omit<LocalCue, "id"> & { id?: number };

const blankDraft = (orderIndex: number): DraftCue => ({
  label: "",
  color: "#f5c518",
  shortcutKey: "",
  blink: true,
  blinkSpeed: "normal",
  orderIndex,
});

export function CueManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: cues = [] } = useCues();
  const createCue = useCreateCue();
  const updateCue = useUpdateCue();
  const deleteCue = useDeleteCue();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftCue | null>(null);
  const [capturingKey, setCapturingKey] = useState(false);
  const [hexInput, setHexInput] = useState("");

  // When the modal opens, default to the first cue or "new" mode.
  useEffect(() => {
    if (!open) return;
    if (cues.length > 0) {
      setSelectedId(cues[0].id);
    } else {
      setSelectedId(null);
      setDraft(blankDraft(0));
    }
  }, [open, cues.length]);

  // Sync draft to selectedId.
  useEffect(() => {
    if (selectedId == null) return;
    const cue = cues.find((c) => c.id === selectedId);
    if (cue) {
      setDraft({ ...cue });
      setHexInput(cue.color.replace("#", ""));
    }
  }, [selectedId, cues]);

  // Key capture mode: next key press becomes the cue's shortcut.
  useEffect(() => {
    if (!capturingKey) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCapturingKey(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1) {
        e.preventDefault();
        setDraft((d) => d ? { ...d, shortcutKey: e.key } : d);
        setCapturingKey(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [capturingKey]);

  if (!open) return null;

  const isNew = draft != null && draft.id == null;

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.label.trim()) return;
    if (draft.id != null) {
      await updateCue.mutateAsync({ id: draft.id, data: draft });
    } else {
      const orderIndex = cues.length;
      const created = await createCue.mutateAsync({ ...draft, orderIndex });
      setSelectedId(created.id);
    }
  };

  const handleDelete = async () => {
    if (!draft || draft.id == null) return;
    if (!confirm(`「${draft.label}」を削除しますか？`)) return;
    await deleteCue.mutateAsync(draft.id);
    setSelectedId(null);
    setDraft(null);
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(blankDraft(cues.length));
    setHexInput("f5c518");
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="cue-manager-modal"
    >
      <div
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#1a1918",
          border: "0.5px solid #2c2a27",
          borderRadius: 8,
          padding: 20,
          color: "#e8e5dc",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "0.5px solid #2c2a27", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.04em" }}>CUE LIBRARY</div>
            <div style={{ fontSize: 11, color: "#888780", marginTop: 1 }}>press-and-hold cues for the sub-display</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#a8a8a0", fontSize: 20, cursor: "pointer", padding: 4 }}>×</button>
        </div>

        {/* Existing cue list */}
        <div style={{ fontSize: 11, color: "#a8a8a0", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 500 }}>EXISTING CUES</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 20 }}>
          {cues.map((cue) => {
            const editing = draft?.id === cue.id;
            return (
              <div
                key={cue.id}
                onClick={() => setSelectedId(cue.id)}
                style={{
                  background: editing ? "#2a2622" : "#242320",
                  border: editing ? "0.5px solid #c186c8" : "0.5px solid #2c2a27",
                  borderRadius: 6,
                  padding: 10,
                  cursor: "pointer",
                  boxShadow: editing ? "0 0 0 1px rgba(193,134,200,0.2)" : "none",
                }}
              >
                <div style={{ background: cue.color, color: autoTextColor(cue.color), padding: "8px 6px", borderRadius: 3, textAlign: "center", fontWeight: 500, fontSize: 11, letterSpacing: "0.03em", fontFamily: "'Bebas Neue', Impact, sans-serif" }}>
                  {cue.label}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10 }}>
                  <span style={{ color: "#888780" }}>key</span>
                  <span style={{ background: "#1d1b19", border: "0.5px solid #2c2a27", padding: "1px 6px", borderRadius: 3, fontFamily: "JetBrains Mono, monospace", color: "#e8e5dc" }}>{cue.shortcutKey || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10 }}>
                  <span style={{ color: "#888780" }}>blink</span>
                  <span style={{ color: cue.blink ? "#2dba4e" : "#888780" }}>{cue.blink ? "on" : "off"}</span>
                </div>
                {editing && <div style={{ marginTop: 6, fontSize: 9, color: "#c186c8", textAlign: "center", letterSpacing: "0.05em" }}>EDITING</div>}
              </div>
            );
          })}
          <div
            onClick={startNew}
            style={{ background: "transparent", border: "0.5px dashed #5f5e5a", borderRadius: 6, padding: 10, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 78, color: "#a8a8a0" }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 11, marginTop: 4 }}>Add Cue</span>
          </div>
        </div>

        {/* Edit form */}
        {draft && (
          <div style={{ borderTop: "0.5px solid #2c2a27", paddingTop: 16 }}>
            <div style={{ fontSize: 11, color: "#a8a8a0", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 500 }}>
              {isNew ? "NEW CUE" : `EDIT CUE — ${draft.label || "(unnamed)"}`}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>LABEL</label>
                <input
                  type="text"
                  value={draft.label}
                  maxLength={20}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  style={{ width: "100%", background: "#1d1b19", border: "0.5px solid #2c2a27", color: "#e8e5dc", padding: "7px 10px", borderRadius: 4, fontSize: 14, fontFamily: "'Bebas Neue', Impact, sans-serif", letterSpacing: "0.02em", boxSizing: "border-box" }}
                />
                <div style={{ fontSize: 10, color: "#5f5e5a", marginTop: 4 }}>max 20 chars · Bebas Neue auto-applied</div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>SHORTCUT KEY</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ flex: 1, background: "#1d1b19", border: "0.5px solid #2c2a27", color: "#e8e5dc", padding: "7px 10px", borderRadius: 4, fontSize: 13 }}>
                    <span style={{ color: "#888780" }}>currently: </span>
                    <span style={{ background: "#2a2622", padding: "1px 7px", borderRadius: 3, fontFamily: "JetBrains Mono, monospace", fontWeight: 500, color: "#c186c8" }}>{draft.shortcutKey || "—"}</span>
                  </div>
                  <button
                    onClick={() => setCapturingKey(true)}
                    style={{ background: capturingKey ? "#c186c8" : "transparent", border: "0.5px solid #2c2a27", color: capturingKey ? "#2a1530" : "#a8a8a0", padding: "7px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {capturingKey ? "Press a key…" : "Press a key"}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: "#5f5e5a", marginTop: 4 }}>click "Press a key" then tap the key</div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>COLOR</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.hex}
                    title={p.label}
                    onClick={() => { setDraft({ ...draft, color: p.hex }); setHexInput(p.hex.replace("#", "")); }}
                    style={{ width: 28, height: 28, borderRadius: 4, background: p.hex, border: draft.color === p.hex ? "2px solid #c186c8" : "0.5px solid #2c2a27", cursor: "pointer", padding: 0 }}
                  />
                ))}
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
                  <span style={{ fontSize: 10, color: "#888780", fontFamily: "JetBrains Mono, monospace" }}>#</span>
                  <input
                    type="text"
                    value={hexInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                      setHexInput(v);
                      if (v.length === 6) setDraft({ ...draft, color: `#${v}` });
                    }}
                    style={{ width: 80, background: "#1d1b19", border: "0.5px solid #2c2a27", color: "#e8e5dc", padding: "4px 8px", borderRadius: 4, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>BLINK</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setDraft({ ...draft, blink: true })} style={blinkBtnStyle(draft.blink === true)}>ON</button>
                  <button onClick={() => setDraft({ ...draft, blink: false })} style={blinkBtnStyle(draft.blink === false)}>OFF</button>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>BLINK SPEED</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setDraft({ ...draft, blinkSpeed: "slow" })} style={blinkBtnStyle(draft.blinkSpeed === "slow")}>SLOW</button>
                  <button onClick={() => setDraft({ ...draft, blinkSpeed: "normal" })} style={blinkBtnStyle(draft.blinkSpeed === "normal")}>NORMAL</button>
                  <button onClick={() => setDraft({ ...draft, blinkSpeed: "fast" })} style={blinkBtnStyle(draft.blinkSpeed === "fast")}>FAST</button>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>LIVE PREVIEW</label>
              <div style={{ background: "#000", aspectRatio: "16 / 4.5", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                {draft.label ? (
                  <CueOverlay cue={{ id: -1, ...draft, orderIndex: 0 } as LocalCue} />
                ) : (
                  <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#5f5e5a", fontSize: 11 }}>
                    enter a label to preview
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "0.5px solid #2c2a27" }}>
              <div>
                {!isNew && (
                  <button onClick={handleDelete} style={{ background: "transparent", border: "0.5px solid #5f2424", color: "#e24b4a", padding: "8px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>
                    Delete cue
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={onClose} style={{ background: "transparent", border: "0.5px solid #2c2a27", color: "#a8a8a0", padding: "8px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                <button onClick={handleSave} disabled={!draft.label.trim()} style={{ background: draft.label.trim() ? "#c186c8" : "#3a3530", color: "#2a1530", border: "none", padding: "8px 18px", borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: draft.label.trim() ? "pointer" : "not-allowed" }}>
                  {isNew ? "Create cue" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function blinkBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    background: active ? "#c186c8" : "#1d1b19",
    color: active ? "#2a1530" : "#a8a8a0",
    border: active ? "none" : "0.5px solid #2c2a27",
    padding: "6px 10px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: active ? 500 : 400,
    cursor: "pointer",
  };
}

function autoTextColor(bgHex: string): string {
  const hex = (bgHex || "#f5c518").replace("#", "").trim();
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#1a1410";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1a1410" : "#f5f1e0";
}
