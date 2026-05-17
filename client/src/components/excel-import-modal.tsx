import { useState, useEffect, useMemo } from "react";

// ============================================================
// Excel / CSV Import Modal
// ============================================================
// Opens after the director drops an .xlsx / .xls / .csv onto the
// manage page. Lets them pick which sheet to read, which column
// holds the song title, and (optionally) which columns hold the
// duration and category. Rule-based auto-detection picks sensible
// defaults so the common 進行表 layout (#・曲名・時間) just works.
// No external AI is involved — pure if/then logic over the cell
// strings.

export interface ImportRow {
  title: string;
  durationSeconds: number; // 0 when no time column or unparseable
  isEvent: boolean;
  isMC: boolean;
  isEncore: boolean;
  isEnd: boolean;
}

interface Sheet {
  name: string;
  rows: any[][];
}

interface ExcelImportModalProps {
  open: boolean;
  sheets: Sheet[];           // workbook parsed into [{name, rows}, ...]
  defaultSheet?: string;     // optional pre-selected sheet name
  onCancel: () => void;
  onConfirm: (rows: ImportRow[]) => Promise<void> | void;
}

const COL_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];

function looksLikeHeader(row: any[] | undefined): boolean {
  if (!row || row.length === 0) return false;
  const cells = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
  if (cells.length === 0) return false;
  const headerKeywords = ["title", "name", "song", "曲名", "タイトル", "song name", "曲順", "no.", "no", "#", "番号", "time", "duration", "時間", "尺", "category", "type", "種類"];
  const cellsLower = cells.map((c) => String(c).toLowerCase());
  for (const kw of headerKeywords) {
    if (cellsLower.some((c) => c.includes(kw.toLowerCase()))) return true;
  }
  return false;
}

function isNumericCell(s: string): boolean {
  return /^\d+(\.\d+)?$/.test(s.trim());
}

function isTimeCell(s: string): boolean {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s.trim());
}

function parseTimeSeconds(s: string): number {
  const t = s.trim();
  const m = t.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!m) return 0;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const c = m[3] ? parseInt(m[3], 10) : null;
  if (c !== null) return a * 3600 + b * 60 + c;
  return a * 60 + b;
}

function parseCategoryFlags(s: string): { isEvent: boolean; isMC: boolean; isEncore: boolean; isEnd: boolean } {
  const u = s.trim().toLowerCase();
  if (["sp", "special", "se", "opening", "se/opening", "se / opening", "イベント", "スペシャル"].includes(u)) {
    return { isEvent: true, isMC: false, isEncore: false, isEnd: false };
  }
  if (["mc", "talk", "トーク", "ｍｃ"].includes(u)) {
    return { isEvent: false, isMC: true, isEncore: false, isEnd: false };
  }
  if (["en", "encore", "アンコール", "ｱﾝｺｰﾙ", "ｴﾝｺｰﾙ", "ｅｎ"].includes(u)) {
    return { isEvent: false, isMC: false, isEncore: true, isEnd: false };
  }
  if (["end", "end of show", "終了", "公演終了", "終演"].includes(u)) {
    return { isEvent: false, isMC: false, isEncore: false, isEnd: true };
  }
  return { isEvent: false, isMC: false, isEncore: false, isEnd: false };
}

interface ColScore {
  nonEmpty: number;
  numericCount: number;
  timeCount: number;
  categoryCount: number;
  totalLen: number;
}

function scoreColumn(rows: any[][], col: number, startRow: number): ColScore {
  const score: ColScore = { nonEmpty: 0, numericCount: 0, timeCount: 0, categoryCount: 0, totalLen: 0 };
  for (let r = startRow; r < rows.length; r++) {
    const cell = rows[r]?.[col];
    if (cell === null || cell === undefined) continue;
    const s = String(cell).trim();
    if (!s) continue;
    score.nonEmpty++;
    score.totalLen += s.length;
    if (isNumericCell(s)) score.numericCount++;
    if (isTimeCell(s)) score.timeCount++;
    const flags = parseCategoryFlags(s);
    if (flags.isEvent || flags.isMC || flags.isEncore || flags.isEnd) score.categoryCount++;
  }
  return score;
}

function detectColumns(rows: any[][], headerRow: boolean): { titleCol: number; timeCol: number | null; categoryCol: number | null } {
  if (rows.length === 0) return { titleCol: 0, timeCol: null, categoryCol: null };
  const startRow = headerRow ? 1 : 0;
  const maxCols = Math.max(0, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  if (maxCols === 0) return { titleCol: 0, timeCol: null, categoryCol: null };
  const scores: ColScore[] = [];
  for (let c = 0; c < maxCols; c++) scores.push(scoreColumn(rows, c, startRow));
  let timeCol: number | null = null;
  let categoryCol: number | null = null;
  for (let c = 0; c < maxCols; c++) {
    if (scores[c].nonEmpty === 0) continue;
    if (timeCol === null && scores[c].timeCount / scores[c].nonEmpty >= 0.6) timeCol = c;
    if (categoryCol === null && scores[c].categoryCount / scores[c].nonEmpty >= 0.4) categoryCol = c;
  }
  let titleCol = 0;
  let bestLen = -1;
  for (let c = 0; c < maxCols; c++) {
    if (c === timeCol || c === categoryCol) continue;
    if (scores[c].nonEmpty === 0) continue;
    if (scores[c].numericCount / scores[c].nonEmpty >= 0.8) continue;
    const avg = scores[c].totalLen / scores[c].nonEmpty;
    if (avg > bestLen) {
      bestLen = avg;
      titleCol = c;
    }
  }
  return { titleCol, timeCol, categoryCol };
}

export function ExcelImportModal({ open, sheets, defaultSheet, onCancel, onConfirm }: ExcelImportModalProps) {
  const [sheetName, setSheetName] = useState<string>("");
  const [headerRow, setHeaderRow] = useState<boolean>(true);
  const [titleCol, setTitleCol] = useState<number>(0);
  const [timeCol, setTimeCol] = useState<number | null>(null);
  const [categoryCol, setCategoryCol] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  const currentSheet = useMemo(() => sheets.find((s) => s.name === sheetName) || sheets[0], [sheets, sheetName]);

  useEffect(() => {
    if (!open || sheets.length === 0) return;
    const initialName = defaultSheet && sheets.some((s) => s.name === defaultSheet) ? defaultSheet : sheets[0].name;
    setSheetName(initialName);
    const sheet = sheets.find((s) => s.name === initialName) || sheets[0];
    const hr = looksLikeHeader(sheet.rows[0]);
    setHeaderRow(hr);
    const detected = detectColumns(sheet.rows, hr);
    setTitleCol(detected.titleCol);
    setTimeCol(detected.timeCol);
    setCategoryCol(detected.categoryCol);
  }, [open, sheets, defaultSheet]);

  useEffect(() => {
    if (!currentSheet) return;
    const hr = looksLikeHeader(currentSheet.rows[0]);
    setHeaderRow(hr);
    const detected = detectColumns(currentSheet.rows, hr);
    setTitleCol(detected.titleCol);
    setTimeCol(detected.timeCol);
    setCategoryCol(detected.categoryCol);
  }, [sheetName]);

  const maxCols = useMemo(() => {
    if (!currentSheet) return 0;
    return Math.max(0, ...currentSheet.rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  }, [currentSheet]);

  const importRows: ImportRow[] = useMemo(() => {
    if (!currentSheet) return [];
    const rows = currentSheet.rows;
    const startRow = headerRow ? 1 : 0;
    const out: ImportRow[] = [];
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const titleRaw = row[titleCol];
      if (titleRaw === null || titleRaw === undefined) continue;
      const title = String(titleRaw).trim();
      if (!title) continue;
      const flags = categoryCol !== null
        ? parseCategoryFlags(String(row[categoryCol] ?? ""))
        : { isEvent: false, isMC: false, isEncore: false, isEnd: false };
      const secs = timeCol !== null ? parseTimeSeconds(String(row[timeCol] ?? "")) : 0;
      out.push({ title, durationSeconds: secs, ...flags });
    }
    return out;
  }, [currentSheet, headerRow, titleCol, timeCol, categoryCol]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (importing) return;
    setImporting(true);
    try {
      await onConfirm(importRows);
    } finally {
      setImporting(false);
    }
  };

  const colLabel = (idx: number): string => idx < COL_LETTERS.length ? COL_LETTERS[idx] : `Col ${idx + 1}`;

  // Preview: render the first ~6 rows after the header (if any).
  const previewRows = importRows.slice(0, 6);

  return (
    <div
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      data-testid="excel-import-modal"
    >
      <div style={{ width: "min(720px, 92vw)", maxHeight: "90vh", overflow: "auto", background: "#0a0a0a", border: "0.5px solid #2c2a27", borderRadius: 8, padding: 20, color: "#e8e5dc", fontFamily: "Inter, sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "0.5px solid #2c2a27", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.04em" }}>IMPORT FROM EXCEL</div>
            <div style={{ fontSize: 11, color: "#888780", marginTop: 1 }}>列を選んでセットリストに追加 — 自動検出済み（必要に応じて変更）</div>
          </div>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", color: "#a8a8a0", fontSize: 20, cursor: "pointer", padding: 4 }}>×</button>
        </div>

        {sheets.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>SHEET</label>
            <select
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              style={{ width: "100%", background: "#141312", border: "0.5px solid #2c2a27", color: "#e8e5dc", padding: "7px 10px", borderRadius: 4, fontSize: 13 }}
              data-testid="import-sheet-select"
            >
              {sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
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
            <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>時間の列（任意）</label>
            <select value={timeCol === null ? -1 : timeCol} onChange={(e) => { const v = parseInt(e.target.value, 10); setTimeCol(v < 0 ? null : v); }} style={{ width: "100%", background: "#141312", border: "0.5px solid #2c2a27", color: "#f5c878", padding: "7px 10px", borderRadius: 4, fontSize: 13 }} data-testid="import-time-col">
              <option value={-1}>なし</option>
              {Array.from({ length: maxCols }).map((_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#888780", marginBottom: 6, letterSpacing: "0.04em" }}>カテゴリの列（任意）</label>
            <select value={categoryCol === null ? -1 : categoryCol} onChange={(e) => { const v = parseInt(e.target.value, 10); setCategoryCol(v < 0 ? null : v); }} style={{ width: "100%", background: "#141312", border: "0.5px solid #2c2a27", color: "#5be0ca", padding: "7px 10px", borderRadius: 4, fontSize: 13 }} data-testid="import-category-col">
              <option value={-1}>なし</option>
              {Array.from({ length: maxCols }).map((_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#a8a8a0", cursor: "pointer" }}>
            <input type="checkbox" checked={headerRow} onChange={(e) => setHeaderRow(e.target.checked)} data-testid="import-skip-header" />
            <span>1 行目はヘッダー（読み飛ばす）</span>
          </label>
        </div>

        <div style={{ borderTop: "0.5px solid #2c2a27", paddingTop: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#888780", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 500 }}>PREVIEW — {importRows.length} 曲（最初の {previewRows.length} 件）</div>
          {previewRows.length === 0 ? (
            <div style={{ padding: 16, color: "#5a5a55", fontSize: 12, textAlign: "center", background: "#0d0c0b", borderRadius: 4 }}>該当する曲がありません — 列の選択を確認してください</div>
          ) : (
            <div style={{ background: "#0d0c0b", borderRadius: 4, padding: 4 }}>
              {previewRows.map((r, i) => {
                const cat = r.isEnd ? "END" : r.isEncore ? "ENCORE" : r.isMC ? "MC" : r.isEvent ? "SPECIAL" : "SONG";
                const cfg: Record<string, { color: string; bg: string }> = {
                  SONG:    { color: "#d4a5db", bg: "rgba(193,134,200,0.15)" },
                  SPECIAL: { color: "#f5c878", bg: "rgba(245,168,40,0.15)" },
                  MC:      { color: "#7bc5e8", bg: "rgba(58,160,224,0.15)" },
                  ENCORE:  { color: "#a8e878", bg: "rgba(126,216,72,0.15)" },
                  END:     { color: "#ffe57a", bg: "rgba(255,212,68,0.15)" },
                };
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 60px 1fr 60px", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 3, fontSize: 12 }}>
                    <span style={{ color: "#5a5a55", fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>{i + 1}</span>
                    <span style={{ background: cfg[cat].bg, border: `0.5px solid ${cfg[cat].color}55`, color: cfg[cat].color, padding: "2px 6px", borderRadius: 2, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>{cat}</span>
                    <span style={{ color: "#fafaf8" }}>{r.title}</span>
                    <span style={{ color: r.durationSeconds > 0 ? "#f5c878" : "#3a3a35", fontFamily: "JetBrains Mono, monospace", fontSize: 11, textAlign: "right" }}>{r.durationSeconds > 0 ? `${Math.floor(r.durationSeconds / 60)}:${String(r.durationSeconds % 60).padStart(2, "0")}` : "—"}</span>
                  </div>
                );
              })}
              {importRows.length > previewRows.length && (
                <div style={{ padding: "6px 8px", color: "#5a5a55", fontSize: 11, textAlign: "center" }}>… 残り {importRows.length - previewRows.length} 曲</div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, paddingTop: 12, borderTop: "0.5px solid #2c2a27" }}>
          <button onClick={onCancel} style={{ background: "transparent", border: "0.5px solid #2c2a27", color: "#a8a8a0", padding: "8px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleConfirm} disabled={importRows.length === 0 || importing} style={{ background: importRows.length > 0 && !importing ? "#c186c8" : "#3a3530", color: "#2a1530", border: "none", padding: "8px 18px", borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: importRows.length > 0 && !importing ? "pointer" : "not-allowed" }}>
            {importing ? "Importing..." : `Import ${importRows.length} songs`}
          </button>
        </div>
      </div>
    </div>
  );
}
