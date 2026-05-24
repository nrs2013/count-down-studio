import { useState, useEffect, useRef } from "react";
import { type LocalCue } from "@/lib/local-db";
import { useCues, useCreateCue, useUpdateCue, useDeleteCue } from "@/hooks/use-local-data";
import { CueOverlay, displayKey } from "@/pages/output";

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

// Quick text-color presets the director can pick with one click. AUTO
// (handled separately as a button) plus four common values.
const TEXT_COLOR_PRESETS: { label: string; hex: string }[] = [
  { label: "Black",       hex: "#1a1410" },
  { label: "White",       hex: "#f5f1e0" },
  { label: "Dark Gray",   hex: "#444441" },
  { label: "Light Gray",  hex: "#a8a8a0" },
];

type DraftCue = Omit<LocalCue, "id"> & { id?: number };

const blankDraft = (orderIndex: number): DraftCue => ({
  label: "",
  color: "#f5c518",
  shortcutKey: "",
  blink: true,
  blinkSpeed: "normal",
  fontSizeAdjust: 0,
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
  const [textHexInput, setTextHexInput] = useState("");
  const [saving, setSaving] = useState(false);

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

  // Sync draft to selectedId. We DON'T re-run when cues changes — a
  // refetch (focus return, sibling tab cue edit) would otherwise clobber
  // the director's in-progress edits with the last-saved values. We read
  // cues through a ref so the selectedId change always sees the latest.
  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  useEffect(() => {
    if (selectedId == null) return;
    const cue = cuesRef.current.find((c) => c.id === selectedId);
    if (cue) {
      setDraft({ ...cue });
      setHexInput(cue.color.replace("#", ""));
      setTextHexInput((cue.textColor || "").replace("#", ""));
    }
  }, [selectedId]);

  // Key capture mode: next key press becomes the cue's shortcut.
  // Accepts single ASCII characters AND any KeyboardEvent whose key
  // string is a useful name (arrow keys, space, etc) so the director
  // can map cues to the left/right arrow keys for the default
  // HOLD! / GO! layout.
  useEffect(() => {
    if (!capturingKey) return;
    // Skip keys whose normal action would clash with cue triggering:
    // Tab moves focus (would shift focus AND fire the cue on every Tab
    // press), Enter submits forms / activates buttons (would double-fire).
    // Both are easy to assign by accident — explicitly blocked.
    const SKIP = new Set(["Escape", "Tab", "Enter", "Shift", "Control", "Meta", "Alt", "CapsLock", "Fn", "Hyper", "Super", "OS", "Dead"]);
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCapturingKey(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (SKIP.has(e.key)) return;
      e.preventDefault();
      setDraft((d) => d ? { ...d, shortcutKey: e.key } : d);
      setCapturingKey(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [capturingKey]);

  if (!open) return null;

  const isNew = draft != null && draft.id == null;

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.label.trim()) return;
    if (saving) return;
    setSaving(true);
    try {
      if (draft.id != null) {
        await updateCue.mutateAsync({ id: draft.id, data: draft });
      } else {
        const orderIndex = cues.length;
        const created = await createCue.mutateAsync({ ...draft, orderIndex });
        setSelectedId(created.id);
      }
      // Close the modal so the director gets immediate visual feedback
      // that the save succeeded — without this the dialog just stays
      // open and the click feels like it did nothing.
      onClose();
    } catch (e) {
      // Keep the modal open if the write failed so the director can
      // retry without losing their edits. (IndexedDB rarely fails on
      // a single small put, but we surface it in the console for the
      // patrol pass.)
      // eslint-disable-next-line no-console
      console.error("Failed to save cue:", e);
    } finally {
      setSaving(false);
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
    setTextHexInput("");
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
          background: "#0a0a0a",
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
                  background: editing ? "#2a2622" : "#141312",
                  border: editing ? "0.5px solid #c186c8" : "0.5px solid #2c2a27",
                  borderRadius: 6,
                  padding: 10,
                  cursor: "pointer",
                  boxShadow: editing ? "0 0 0 1px rgba(193,134,200,0.2)" : "none",
                }}
              >
                <div style={{ background: cue.color, color: autoTextColor(cue.color), padding: "8px 6px", borderRadius: 3, textAlign: "center", fontWeight: 900, fontSize: 11, letterSpacing: "0.03em", fontFamily: "'Bebas Neue', 'Noto Sans JP', Impact, sans-serif" }}>
                  {cue.label}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10 }}>
                  <span style={{ color: "#888780" }}>key</span>
                  <span style={{ background: "#0a0a0a", border: "0.5px solid #2c2a27", padding: "1px 6px", borderRadius: 3, fontFamily: "JetBrains Mono, monospace", color: "#e8e5dc" }}>{displayKey(cue.shortcutKey)}</span>
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
                  style={{ width: "100%", background: "#0a0a0a", border: "0.5px solid #2c2a27", color: "#e8e5dc", padding: "7px 10px", borderRadius: 4, fontSize: 14, fontFamily: "'Bebas Neue', 'Noto Sans JP', Impact, sans-serif", letterSpacing: "0.02em", boxSizing: "border-box" }}
                />
                <div style={{ fontSize: 10, color: "#5f5e5a", marginTop: 4 }}>max 20 chars · Bebas Neue auto-applied</div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>SHORTCUT KEY</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ flex: 1, background: "#0a0a0a", border: "0.5px solid #2c2a27", color: "#e8e5dc", padding: "7px 10px", borderRadius: 4, fontSize: 13 }}>
                    <span style={{ color: "#888780" }}>currently: </span>
                    <span style={{ background: "#2a2622", padding: "1px 7px", borderRadius: 3, fontFamily: "JetBrains Mono, monospace", fontWeight: 500, color: "#c186c8" }}>{displayKey(draft.shortcutKey)}</span>
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
              <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>BACKGROUND COLOR</label>
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
                    style={{ width: 80, background: "#0a0a0a", border: "0.5px solid #2c2a27", color: "#e8e5dc", padding: "4px 8px", borderRadius: 4, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>TEXT COLOR</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {/* Auto = let the overlay pick black or off-white from the background's luminance */}
                <button
                  title="Auto (from background)"
                  onClick={() => { setDraft({ ...draft, textColor: undefined }); setTextHexInput(""); }}
                  style={{
                    height: 28, padding: "0 10px", borderRadius: 4,
                    background: !draft.textColor ? "#c186c8" : "#0a0a0a",
                    color: !draft.textColor ? "#2a1530" : "#a8a8a0",
                    border: !draft.textColor ? "none" : "0.5px solid #2c2a27",
                    cursor: "pointer", fontSize: 11, fontWeight: !draft.textColor ? 500 : 400,
                  }}
                >AUTO</button>
                {TEXT_COLOR_PRESETS.map((p) => (
                  <button
                    key={p.hex}
                    title={p.label}
                    onClick={() => { setDraft({ ...draft, textColor: p.hex }); setTextHexInput(p.hex.replace("#", "")); }}
                    style={{
                      width: 28, height: 28, borderRadius: 4, background: p.hex,
                      border: draft.textColor === p.hex ? "2px solid #c186c8" : "0.5px solid #2c2a27",
                      cursor: "pointer", padding: 0,
                    }}
                  />
                ))}
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
                  <span style={{ fontSize: 10, color: "#888780", fontFamily: "JetBrains Mono, monospace" }}>#</span>
                  <input
                    type="text"
                    value={textHexInput}
                    placeholder="auto"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                      setTextHexInput(v);
                      if (v.length === 6) setDraft({ ...draft, textColor: `#${v}` });
                      else if (v.length === 0) setDraft({ ...draft, textColor: undefined });
                    }}
                    style={{ width: 80, background: "#0a0a0a", border: "0.5px solid #2c2a27", color: "#e8e5dc", padding: "4px 8px", borderRadius: 4, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
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

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>FONT SIZE <span style={{ color: "#5f5e5a", fontWeight: 400, letterSpacing: 0 }}>— starts auto-fitted; nudge with ± buttons</span></label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setDraft({ ...draft, fontSizeAdjust: Math.max(-8, (draft.fontSizeAdjust ?? 0) - 1) })}
                  title="Smaller"
                  style={{ width: 38, height: 32, background: "#0a0a0a", border: "0.5px solid #2c2a27", color: "#e8e5dc", borderRadius: 4, fontSize: 16, cursor: "pointer", fontFamily: "JetBrains Mono, monospace" }}
                >−</button>
                <div style={{ flex: 1, background: "#0a0a0a", border: "0.5px solid #2c2a27", borderRadius: 4, padding: "7px 12px", fontSize: 12, color: "#e8e5dc", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>
                  {(() => {
                    const a = draft.fontSizeAdjust ?? 0;
                    if (a === 0) return "Auto";
                    return `Auto ${a > 0 ? "+" : ""}${a}`;
                  })()}
                </div>
                <button
                  onClick={() => setDraft({ ...draft, fontSizeAdjust: Math.min(8, (draft.fontSizeAdjust ?? 0) + 1) })}
                  title="Larger"
                  style={{ width: 38, height: 32, background: "#0a0a0a", border: "0.5px solid #2c2a27", color: "#e8e5dc", borderRadius: 4, fontSize: 16, cursor: "pointer", fontFamily: "JetBrains Mono, monospace" }}
                >+</button>
                <button
                  onClick={() => setDraft({ ...draft, fontSizeAdjust: 0 })}
                  title="Reset to auto"
                  disabled={(draft.fontSizeAdjust ?? 0) === 0}
                  style={{ height: 32, padding: "0 12px", background: "transparent", border: "0.5px solid #2c2a27", color: "#a8a8a0", borderRadius: 4, fontSize: 11, cursor: (draft.fontSizeAdjust ?? 0) === 0 ? "not-allowed" : "pointer", opacity: (draft.fontSizeAdjust ?? 0) === 0 ? 0.4 : 1 }}
                >Reset</button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>LIVE PREVIEW <span style={{ color: "#5f5e5a", fontWeight: 400, letterSpacing: 0 }}>— 16:9, same render as the sub-display</span></label>
              <div style={{ background: "#000", aspectRatio: "16 / 9", borderRadius: 4, position: "relative", overflow: "hidden", margin: "0 auto", maxWidth: 560 }}>
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
                <button onClick={handleSave} disabled={!draft.label.trim() || saving} style={{ background: draft.label.trim() && !saving ? "#c186c8" : "#3a3530", color: "#2a1530", border: "none", padding: "8px 18px", borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: draft.label.trim() && !saving ? "pointer" : "not-allowed" }}>
                  {saving ? "Saving..." : (isNew ? "Create cue" : "Save changes")}
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
    background: active ? "#c186c8" : "#0a0a0a",
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
