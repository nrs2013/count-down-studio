import { useState, useEffect, useMemo } from "react";

// ============================================================
// Excel / CSV Import Modal — flexible enough for real 進行表
// ============================================================
// Director's real working spreadsheets come in many shapes:
//   - A title row, a blank row, a header row, a blank row, then data
//   - One header row only
//   - No header at all
//   - Title columns named "M-Title", "曲名", "Song", "Title", ...
//   - Time columns formatted as 0:04:12 (Excel time-of-day) or 4:12
//   - Category info baked into the title cell itself ("【MC①】",
//     "Overture", "客入れ", "アンコール", ...) rather than a column
//
// Rather than guess all of that upfront, we give the director:
//   1) sheet picker (visible when >1 sheet)
//   2) "skip first N rows" spinner (auto-set, manual override)
//   3) column dropdowns for title / time / category
//   4) "guess category from title" checkbox for when there's no
//      category column
//   5) live preview that updates as they tweak the controls
//   6) per-row category re-tap + delete inside the preview itself,
//      so the director doesn't have to import-then-fix
// All detection is pure if/then logic; no AI involved.

export interface ImportRow {
  title: string;
  durationSeconds: number;
  isEvent: boolean;
  isMC: boolean;
  isEncore: boolean;
  isEnd: boolean;
}

// Tap-to-cycle category labels shown in the preview pane. Order matters:
// SONG → SPECIAL → MC → ENCORE → END → back to SONG.
const CATEGORIES = ["SONG", "SPECIAL", "MC", "ENCORE", "END"] as const;
type Category = typeof CATEGORIES[number];

function flagsToCategory(r: { isEnd: boolean; isEncore: boolean; isMC: boolean; isEvent: boolean }): Category {
  if (r.isEnd) return "END";
  if (r.isEncore) return "ENCORE";
  if (r.isMC) return "MC";
  if (r.isEvent) return "SPECIAL";
  return "SONG";
}

function categoryToFlags(cat: Category): { isEvent: boolean; isMC: boolean; isEncore: boolean; isEnd: boolean } {
  return {
    isEvent: cat === "SPECIAL",
    isMC: cat === "MC",
    isEncore: cat === "ENCORE",
    isEnd: cat === "END",
  };
}

function cycleCategory(cat: Category): Category {
  const idx = CATEGORIES.indexOf(cat);
  return CATEGORIES[(idx + 1) % CATEGORIES.length];
}

interface Sheet {
  name: string;
  rows: any[][];
}

interface ExcelImportModalProps {
  open: boolean;
  sheets: Sheet[];
  defaultSheet?: string;
  onCancel: () => void;
  onConfirm: (rows: ImportRow[]) => Promise<void> | void;
}

const COL_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];

const HEADER_KEYWORDS = [
  "title","name","song","曲名","タイトル","no.","no","#","番号",
  "time","duration","時間","尺",
  "category","type","種類",
  "m-title","m-no","mic","マイク","衣装","演出","stage","ステージ",
  "曲順","セットリスト","setlist","センター","小道具","note","メモ",
];

function isHeaderCell(s: string): boolean {
  const lower = s.trim().toLowerCase();
  if (!lower) return false;
  return HEADER_KEYWORDS.some((k) => lower === k.toLowerCase() || lower.includes(k.toLowerCase()));
}

function isHeaderRow(row: any[] | undefined): boolean {
  if (!row) return false;
  const cells = row
    .map((c) => (c === null || c === undefined ? "" : String(c).trim()))
    .filter((s) => s.length > 0);
  if (cells.length === 0) return false;
  // If a meaningful share of the non-empty cells look like header labels, it's a header row.
  const headerHits = cells.filter(isHeaderCell).length;
  return headerHits / cells.length >= 0.4;
}

function isNumericCell(s: string): boolean {
  return /^\d+(\.\d+)?$/.test(s.trim());
}

function isTimeCell(s: string): boolean {
  const t = s.trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return true;
  // Some sheets emit time as e.g. "1:30 (h)" — accept the leading time portion.
  if (/^\d{1,2}:\d{2}(:\d{2})?\s/.test(t)) return true;
  return false;
}

function parseTimeSeconds(s: string): number {
  const t = String(s).trim();
  const m = t.match(/^(\d+):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const c = m[3] ? parseInt(m[3], 10) : null;
  if (c !== null) return a * 3600 + b * 60 + c;
  return a * 60 + b;
}

function parseExplicitCategory(s: string): { isEvent: boolean; isMC: boolean; isEncore: boolean; isEnd: boolean } | null {
  const u = s.trim().toLowerCase();
  if (!u) return null;
  if (["sp","special","se","opening","se/opening","se / opening","イベント","スペシャル"].includes(u)) {
    return { isEvent: true, isMC: false, isEncore: false, isEnd: false };
  }
  if (["mc","talk","トーク","ｍｃ"].includes(u)) {
    return { isEvent: false, isMC: true, isEncore: false, isEnd: false };
  }
  if (["en","encore","アンコール","ｱﾝｺｰﾙ","ｴﾝｺｰﾙ","ｅｎ"].includes(u)) {
    return { isEvent: false, isMC: false, isEncore: true, isEnd: false };
  }
  if (["end","end of show","終了","公演終了","終演"].includes(u)) {
    return { isEvent: false, isMC: false, isEncore: false, isEnd: true };
  }
  return null;
}

// Looser pattern matching for title-based category inference. Used when
// there is no dedicated category column but the title itself encodes the
// role (e.g. "Overture", "【MC①】", "アンコール").
function guessCategoryFromTitle(title: string): { isEvent: boolean; isMC: boolean; isEncore: boolean; isEnd: boolean } {
  const t = title.trim();
  const lower = t.toLowerCase();
  // MC markers — explicit string, brackets, numbered (MC①)
  if (/^(\[|【)?\s*mc\b/i.test(t) || /^(\[|【)?\s*ｍｃ/i.test(t) || /talk\s*[\d①②③④⑤⑥⑦⑧⑨]?/i.test(t) || /トーク/.test(t)) {
    return { isEvent: false, isMC: true, isEncore: false, isEnd: false };
  }
  // End / curtain call
  if (/(end of show|終演|公演終了|終了|カーテンコール)/i.test(t)) {
    return { isEvent: false, isMC: false, isEncore: false, isEnd: true };
  }
  // Encore
  if (/(encore|アンコール|ｱﾝｺｰﾙ)/i.test(t) || /^en[\.\s]/i.test(lower)) {
    return { isEvent: false, isMC: false, isEncore: true, isEnd: false };
  }
  // Special / opening / SE / 客入れ / overture
  if (/(^se(\b|[\.\s/])|overture|opening|オープニング|オーバーチュア|客入れ|開演前|開演まで|入場|序曲)/i.test(t)) {
    return { isEvent: true, isMC: false, isEncore: false, isEnd: false };
  }
  return { isEvent: false, isMC: false, isEncore: false, isEnd: false };
}

interface ColScore { nonEmpty: number; numeric: number; time: number; categoryLike: number; totalLen: number; }

function scoreColumn(rows: any[][], col: number, startRow: number): ColScore {
  const score: ColScore = { nonEmpty: 0, numeric: 0, time: 0, categoryLike: 0, totalLen: 0 };
  for (let r = startRow; r < rows.length; r++) {
    const cell = rows[r]?.[col];
    if (cell === null || cell === undefined) continue;
    const s = String(cell).trim();
    if (!s) continue;
    score.nonEmpty++;
    score.totalLen += s.length;
    if (isNumericCell(s)) score.numeric++;
    if (isTimeCell(s)) score.time++;
    if (parseExplicitCategory(s) !== null) score.categoryLike++;
  }
  return score;
}

// Find the first row where the picked-or-guessed title column has a
// meaningful string. Skips blank rows AND rows that look like header
// labels ("M-Title", "曲名", etc).
function detectDataStartRow(rows: any[][], titleCol: number): number {
  for (let r = 0; r < rows.length; r++) {
    const cell = rows[r]?.[titleCol];
    if (cell === null || cell === undefined) continue;
    const s = String(cell).trim();
    if (!s) continue;
    if (isHeaderCell(s)) continue;
    if (s.length < 2) continue;
    if (isNumericCell(s)) continue;
    return r;
  }
  return 0;
}

function detectColumns(rows: any[][]): { titleCol: number; timeCol: number | null; categoryCol: number | null; skipRows: number } {
  if (rows.length === 0) return { titleCol: 0, timeCol: null, categoryCol: null, skipRows: 0 };
  const maxCols = Math.max(0, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  if (maxCols === 0) return { titleCol: 0, timeCol: null, categoryCol: null, skipRows: 0 };
  // Score columns assuming we don't yet know where data starts. Use the
  // whole sheet — header noise tends to be drowned out by the data rows
  // for any column with real content.
  const scores: ColScore[] = [];
  for (let c = 0; c < maxCols; c++) scores.push(scoreColumn(rows, c, 0));
  let timeCol: number | null = null;
  let categoryCol: number | null = null;
  for (let c = 0; c < maxCols; c++) {
    if (scores[c].nonEmpty === 0) continue;
    if (timeCol === null && scores[c].time / scores[c].nonEmpty >= 0.5) timeCol = c;
    if (categoryCol === null && scores[c].categoryLike / scores[c].nonEmpty >= 0.4) categoryCol = c;
  }
  let titleCol = 0;
  let bestLen = -1;
  for (let c = 0; c < maxCols; c++) {
    if (c === timeCol || c === categoryCol) continue;
    if (scores[c].nonEmpty === 0) continue;
    if (scores[c].numeric / scores[c].nonEmpty >= 0.8) continue;
    const avg = scores[c].totalLen / scores[c].nonEmpty;
    if (avg > bestLen) {
      bestLen = avg;
      titleCol = c;
    }
  }
  const skipRows = detectDataStartRow(rows, titleCol);
  return { titleCol, timeCol, categoryCol, skipRows };
}

export function ExcelImportModal({ open, sheets, defaultSheet, onCancel, onConfirm }: ExcelImportModalProps) {
  const [sheetName, setSheetName] = useState<string>("");
  const [skipRows, setSkipRows] = useState<number>(0);
  const [titleCol, setTitleCol] = useState<number>(0);
  const [timeCol, setTimeCol] = useState<number | null>(null);
  const [categoryCol, setCategoryCol] = useState<number | null>(null);
  const [inferFromTitle, setInferFromTitle] = useState<boolean>(true);
  const [importing, setImporting] = useState(false);

  // Per-row overrides made in the preview pane (tap pill to cycle
  // category, × button to drop the row). Keyed by the row's index in
  // importRows. Reset whenever any upstream control changes since those
  // changes can shift indexes — we don't try to track identity across
  // re-detections.
  type RowOverride = { category?: Category; deleted?: boolean };
  const [overrides, setOverrides] = useState<Record<number, RowOverride>>({});

  const currentSheet = useMemo(() => sheets.find((s) => s.name === sheetName) || sheets[0], [sheets, sheetName]);

  // First open: pick the sheet + auto-detect everything for it.
  useEffect(() => {
    if (!open || sheets.length === 0) return;
    const initialName = defaultSheet && sheets.some((s) => s.name === defaultSheet) ? defaultSheet : sheets[0].name;
    setSheetName(initialName);
  }, [open, sheets, defaultSheet]);

  // Sheet change (manual): re-run detection.
  useEffect(() => {
    if (!currentSheet) return;
    const det = detectColumns(currentSheet.rows);
    setTitleCol(det.titleCol);
    setTimeCol(det.timeCol);
    setCategoryCol(det.categoryCol);
    setSkipRows(det.skipRows);
  }, [sheetName]);

  // Drop preview-pane overrides whenever the upstream parse settings
  // change. The row indexes that the overrides reference would otherwise
  // point at different rows than the director picked.
  useEffect(() => {
    setOverrides({});
  }, [sheetName, titleCol, timeCol, categoryCol, inferFromTitle, skipRows]);

  const maxCols = useMemo(() => {
    if (!currentSheet) return 0;
    return Math.max(0, ...currentSheet.rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  }, [currentSheet]);

  const importRows: ImportRow[] = useMemo(() => {
    if (!currentSheet) return [];
    const rows = currentSheet.rows;
    const out: ImportRow[] = [];
    for (let r = skipRows; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const titleRaw = row[titleCol];
      if (titleRaw === null || titleRaw === undefined) continue;
      const title = String(titleRaw).trim();
      if (!title) continue;
      // Resolve category: column wins; otherwise optionally infer from the title.
      let flags = { isEvent: false, isMC: false, isEncore: false, isEnd: false };
      if (categoryCol !== null) {
        const explicit = parseExplicitCategory(String(row[categoryCol] ?? ""));
        if (explicit) flags = explicit;
        else if (inferFromTitle) flags = guessCategoryFromTitle(title);
      } else if (inferFromTitle) {
        flags = guessCategoryFromTitle(title);
      }
      const secs = timeCol !== null ? parseTimeSeconds(String(row[timeCol] ?? "")) : 0;
      out.push({ title, durationSeconds: secs, ...flags });
    }
    return out;
  }, [currentSheet, skipRows, titleCol, timeCol, categoryCol, inferFromTitle]);

  // Apply preview-pane overrides (category retap + soft delete) to
  // produce the actual rows that will get imported when Confirm is hit.
  const finalImportRows: ImportRow[] = useMemo(() => {
    return importRows
      .map((r, i) => {
        const o = overrides[i];
        if (o?.category) {
          return { ...r, ...categoryToFlags(o.category) };
        }
        return r;
      })
      .filter((_, i) => !overrides[i]?.deleted);
  }, [importRows, overrides]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (importing) return;
    setImporting(true);
    try { await onConfirm(finalImportRows); } finally { setImporting(false); }
  };

  const handleCategoryClick = (i: number) => {
    const base = flagsToCategory(importRows[i]);
    const current = overrides[i]?.category ?? base;
    const next = cycleCategory(current);
    setOverrides((prev) => ({ ...prev, [i]: { ...prev[i], category: next } }));
  };

  const handleDelete = (i: number) => {
    setOverrides((prev) => ({ ...prev, [i]: { ...prev[i], deleted: true } }));
  };

  const colLabel = (idx: number): string => idx < COL_LETTERS.length ? COL_LETTERS[idx] : `Col ${idx + 1}`;
  const totalRows = currentSheet ? currentSheet.rows.length : 0;

  // Rows that survive the preview-pane edits. Each entry remembers its
  // index in the original importRows so the tap/delete handlers stay
  // aligned with the override map.
  const visiblePreview = importRows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .filter(({ originalIndex }) => !overrides[originalIndex]?.deleted);

  const deletedCount = Object.values(overrides).filter((o) => o?.deleted).length;

  return (
    <div
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      data-testid="excel-import-modal"
    >
      <div style={{ width: "min(760px, 92vw)", maxHeight: "90vh", overflow: "auto", background: "#0a0a0a", border: "0.5px solid #2c2a27", borderRadius: 8, padding: 20, color: "#e8e5dc", fontFamily: "Inter, sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "0.5px solid #2c2a27", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.04em" }}>IMPORT FROM EXCEL</div>
            <div style={{ fontSize: 11, color: "#888780", marginTop: 1 }}>シート・列・スキップ行を調整 — プレビューでカテゴリ変更 / 行削除も可能</div>
          </div>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", color: "#a8a8a0", fontSize: 20, cursor: "pointer", padding: 4 }}>×</button>
        </div>

        {sheets.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>SHEET <span style={{ color: "#5a5a55", fontWeight: 400, letterSpacing: 0 }}>({sheets.length} 枚)</span></label>
            <select
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              style={{ width: "100%", background: "#141312", border: "0.5px solid #2c2a27", color: "#e8e5dc", padding: "7px 10px", borderRadius: 4, fontSize: 13 }}
              data-testid="import-sheet-select"
            >
              {sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.rows.length} 行)</option>)}
            </select>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>曲名の列</label>
            <select value={titleCol} onChange={(e) => setTitleCol(parseInt(e.target.value, 10))} style={{ width: "100%", background: "#141312", border: "0.5px solid #c186c8", color: "#d4a5db", padding: "7px 10px", borderRadius: 4, fontSize: 13 }} data-testid="import-title-col">
              {Array.from({ length: maxCols }).map((_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>時間の列(任意)</label>
            <select value={timeCol === null ? -1 : timeCol} onChange={(e) => { const v = parseInt(e.target.value, 10); setTimeCol(v < 0 ? null : v); }} style={{ width: "100%", background: "#141312", border: "0.5px solid #2c2a27", color: "#f5c878", padding: "7px 10px", borderRadius: 4, fontSize: 13 }} data-testid="import-time-col">
              <option value={-1}>なし</option>
              {Array.from({ length: maxCols }).map((_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>カテゴリの列(任意)</label>
            <select value={categoryCol === null ? -1 : categoryCol} onChange={(e) => { const v = parseInt(e.target.value, 10); setCategoryCol(v < 0 ? null : v); }} style={{ width: "100%", background: "#141312", border: "0.5px solid #2c2a27", color: "#5be0ca", padding: "7px 10px", borderRadius: 4, fontSize: 13 }} data-testid="import-category-col">
              <option value={-1}>なし</option>
              {Array.from({ length: maxCols }).map((_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>先頭スキップ行数</label>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button onClick={() => setSkipRows(Math.max(0, skipRows - 1))} style={{ width: 28, height: 30, background: "#141312", border: "0.5px solid #2c2a27", color: "#e8e5dc", borderRadius: 4, fontSize: 14, cursor: "pointer", fontFamily: "JetBrains Mono, monospace" }}>−</button>
              <input type="number" min={0} max={Math.max(0, totalRows - 1)} value={skipRows} onChange={(e) => setSkipRows(Math.max(0, Math.min(totalRows, parseInt(e.target.value, 10) || 0)))} style={{ width: 56, background: "#141312", border: "0.5px solid #2c2a27", color: "#e8e5dc", padding: "5px 8px", borderRadius: 4, fontSize: 13, fontFamily: "JetBrains Mono, monospace", textAlign: "center" }} data-testid="import-skip-rows" />
              <button onClick={() => setSkipRows(Math.min(totalRows, skipRows + 1))} style={{ width: 28, height: 30, background: "#141312", border: "0.5px solid #2c2a27", color: "#e8e5dc", borderRadius: 4, fontSize: 14, cursor: "pointer", fontFamily: "JetBrains Mono, monospace" }}>+</button>
              <span style={{ marginLeft: 8, fontSize: 10, color: "#5a5a55" }}>{totalRows} 行中</span>
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#a8a8a0", cursor: "pointer", paddingTop: 18 }}>
            <input type="checkbox" checked={inferFromTitle} onChange={(e) => setInferFromTitle(e.target.checked)} data-testid="import-infer-category" />
            <span>曲名から MC / SP / ENCORE / END を自動判定（「Overture / 【MC①】 / アンコール / 終演」など）</span>
          </label>
        </div>

        <div style={{ borderTop: "0.5px solid #2c2a27", paddingTop: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#888780", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 500, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span>PREVIEW — {finalImportRows.length} 曲（タップでカテゴリ変更 / × で削除）</span>
            {deletedCount > 0 && (
              <span style={{ color: "#888780", fontSize: 10, letterSpacing: 0, fontWeight: 400 }}>
                {deletedCount} 行を取り込み対象から外しています
              </span>
            )}
          </div>
          {visiblePreview.length === 0 ? (
            <div style={{ padding: 16, color: "#5a5a55", fontSize: 12, textAlign: "center", background: "#0d0c0b", borderRadius: 4 }}>該当する曲がありません — 列の選択 / スキップ行数を確認してください</div>
          ) : (
            <div style={{ background: "#0d0c0b", borderRadius: 4, padding: 4, maxHeight: "44vh", overflowY: "auto", overscrollBehavior: "contain" }}>
              {visiblePreview.map(({ row: r, originalIndex }, displayIndex) => {
                const effectiveCat = overrides[originalIndex]?.category ?? flagsToCategory(r);
                const cfg: Record<string, { color: string; bg: string }> = {
                  SONG: { color: "#d4a5db", bg: "rgba(193,134,200,0.15)" },
                  SPECIAL: { color: "#f5c878", bg: "rgba(245,168,40,0.15)" },
                  MC: { color: "#7bc5e8", bg: "rgba(58,160,224,0.15)" },
                  ENCORE: { color: "#a8e878", bg: "rgba(126,216,72,0.15)" },
                  END: { color: "#ffe57a", bg: "rgba(255,212,68,0.15)" },
                };
                const isOverridden = overrides[originalIndex]?.category != null;
                return (
                  <div key={originalIndex} style={{ display: "grid", gridTemplateColumns: "24px 78px 1fr 60px 26px", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 3, fontSize: 12 }}>
                    <span style={{ color: "#5a5a55", fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>{displayIndex + 1}</span>
                    <button
                      onClick={() => handleCategoryClick(originalIndex)}
                      title="タップでカテゴリを変更（SONG → SPECIAL → MC → ENCORE → END）"
                      style={{
                        background: cfg[effectiveCat].bg,
                        border: `0.5px solid ${cfg[effectiveCat].color}${isOverridden ? "" : "55"}`,
                        color: cfg[effectiveCat].color,
                        padding: "3px 6px",
                        borderRadius: 2,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        textAlign: "center",
                        fontFamily: "JetBrains Mono, monospace",
                        cursor: "pointer",
                        boxShadow: isOverridden ? `inset 0 0 0 0.5px ${cfg[effectiveCat].color}55` : "none",
                      }}
                      data-testid={`import-preview-category-${originalIndex}`}
                    >
                      {effectiveCat}
                    </button>
                    <span style={{ color: "#fafaf8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                    <span style={{ color: r.durationSeconds > 0 ? "#f5c878" : "#3a3a35", fontFamily: "JetBrains Mono, monospace", fontSize: 11, textAlign: "right" }}>{r.durationSeconds > 0 ? `${Math.floor(r.durationSeconds / 60)}:${String(r.durationSeconds % 60).padStart(2, "0")}` : "—"}</span>
                    <button
                      onClick={() => handleDelete(originalIndex)}
                      title="この行を取り込み対象から外す"
                      aria-label="削除"
                      style={{
                        background: "transparent",
                        border: "0.5px solid #3a3a35",
                        color: "#5a5a55",
                        width: 22,
                        height: 22,
                        borderRadius: 2,
                        fontSize: 13,
                        cursor: "pointer",
                        padding: 0,
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "color 0.12s, border-color 0.12s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#e24b4a"; e.currentTarget.style.borderColor = "#e24b4a55"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#5a5a55"; e.currentTarget.style.borderColor = "#3a3a35"; }}
                      data-testid={`import-preview-delete-${originalIndex}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, paddingTop: 12, borderTop: "0.5px solid #2c2a27" }}>
          <button onClick={onCancel} style={{ background: "transparent", border: "0.5px solid #2c2a27", color: "#a8a8a0", padding: "8px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleConfirm} disabled={finalImportRows.length === 0 || importing} style={{ background: finalImportRows.length > 0 && !importing ? "#c186c8" : "#3a3530", color: "#2a1530", border: "none", padding: "8px 18px", borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: finalImportRows.length > 0 && !importing ? "pointer" : "not-allowed" }}>
            {importing ? "Importing..." : `Import ${finalImportRows.length} songs`}
          </button>
        </div>
      </div>
    </div>
  );
}
