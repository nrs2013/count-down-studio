import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Trash2, Copy, Plus } from "lucide-react";
import {
  useSetlists,
  useCreateSetlist,
  useDeleteSetlist,
  useActivateSetlist,
  useDuplicateSetlist,
} from "@/hooks/use-local-data";
import { localDB } from "@/lib/local-db";

// PROMPTER-STUDIO-style setlist picker:
// Deep dark canvas with subtle radial accents, brand topbar, hero title,
// grid of muted setlist cards + a dashed "create new" card.
const FONT = "'Helvetica Neue', 'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif";
const MONO = "'SF Mono', 'Menlo', monospace";
const ACCENT = "#c186c8";           // muted purple (PROMPTER-style)
const ACCENT_2 = "#d8a7df";         // lighter muted purple (hover / gradient)

function useSongCounts(setlistIds: number[]) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result: Record<number, number> = {};
      for (const id of setlistIds) {
        const songs = await localDB.getSongsBySetlist(id);
        result[id] = songs.filter(s => !s.isMC && !s.isEvent && !s.isEncore).length;
      }
      if (!cancelled) setCounts(result);
    }
    if (setlistIds.length > 0) load();
    return () => { cancelled = true; };
  }, [setlistIds.join(",")]);
  return counts;
}

function useTotalDurations(setlistIds: number[]) {
  const [durations, setDurations] = useState<Record<number, number>>({});
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result: Record<number, number> = {};
      for (const id of setlistIds) {
        const songs = await localDB.getSongsBySetlist(id);
        result[id] = songs.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
      }
      if (!cancelled) setDurations(result);
    }
    if (setlistIds.length > 0) load();
    return () => { cancelled = true; };
  }, [setlistIds.join(",")]);
  return durations;
}

export default function Home() {
  const [, navigate] = useLocation();
  const { data: setlists = [], isLoading } = useSetlists();
  const createSetlist = useCreateSetlist();
  const deleteSetlist = useDeleteSetlist();
  const activateSetlist = useActivateSetlist();
  const duplicateSetlist = useDuplicateSetlist();
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const setlistIds = setlists.map(s => s.id);
  const songCounts = useSongCounts(setlistIds);
  const totalDurations = useTotalDurations(setlistIds);

  const handleOpen = async (id: number) => {
    await activateSetlist.mutateAsync(id);
    navigate("/manage");
  };

  const handleCreate = async () => {
    await createSetlist.mutateAsync({
      name: "New Concert",
      isActive: true,
    });
    navigate("/manage");
  };

  const handleDelete = (id: number) => {
    if (deleteConfirm === id) {
      deleteSetlist.mutate(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const handleDuplicate = (id: number) => {
    duplicateSetlist.mutate(id);
  };

  const formatTotal = (sec: number) => {
    if (!sec) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="min-h-screen w-full overflow-y-auto flex flex-col items-center"
      style={{
        fontFamily: FONT,
        padding: "56px 48px 100px",
        background: `
          radial-gradient(circle at 20% 0%, rgba(193,134,200,0.08) 0%, transparent 40%),
          radial-gradient(circle at 80% 100%, rgba(193,134,200,0.05) 0%, transparent 40%),
          linear-gradient(180deg, #161614 0%, #1e1814 50%, #121211 100%)
        `,
      }}
      data-testid="home-page"
    >
      {/* ===== TOPBAR ===== */}
      <div
        className="w-full flex items-center justify-between"
        style={{ maxWidth: 1240, marginBottom: 80 }}
      >
        <div className="flex items-center" style={{ gap: 12 }}>
          {/* Solid muted-purple logo square */}
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 6,
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 18, fontFamily: FONT, fontWeight: 900, color: "#0a0a08", lineHeight: 1, letterSpacing: "-0.03em" }}>
              CD
            </span>
          </div>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontSize: 18, fontFamily: FONT, letterSpacing: "0.03em", color: "#e8e8e2" }}>
              <b style={{ fontWeight: 800, color: ACCENT }}>COUNT DOWN</b>
              <span style={{ fontWeight: 300, marginLeft: 6 }}>STUDIO</span>
            </div>
            <div style={{ fontSize: 9, color: "#76766f", letterSpacing: "0.22em", marginTop: 4, fontWeight: 700, textTransform: "uppercase" }}>
              Concert Countdown Timer
            </div>
          </div>
        </div>
      </div>

      {/* ===== HERO ===== */}
      <div
        className="w-full flex items-end justify-between"
        style={{
          maxWidth: 1240,
          marginBottom: 36,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          paddingBottom: 24,
        }}
      >
        <div className="flex flex-col" style={{ gap: 12 }}>
          <div style={{ fontSize: 11, color: ACCENT, letterSpacing: "0.4em", textTransform: "uppercase", fontWeight: 700 }}>
            Workspace
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 200,
              color: "#e8e8e2",
              letterSpacing: "-0.02em",
              lineHeight: 1,
              fontFamily: FONT,
            }}
          >
            <b style={{ fontWeight: 700, color: ACCENT }}>Setlists</b>
          </div>
        </div>
        <div
          className="flex items-center"
          style={{
            gap: 14,
            color: "#76766f",
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          <span>{setlists.length} Total</span>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: ACCENT }} />
          <span>Select to open</span>
        </div>
      </div>

      {/* ===== GRID ===== */}
      <div
        className="w-full"
        style={{
          maxWidth: 1240,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 20,
        }}
      >
        {isLoading ? (
          <div style={{ color: "#76766f", textAlign: "center", padding: "32px", fontSize: 13, gridColumn: "1 / -1" }}>
            Loading...
          </div>
        ) : (
          <>
            {setlists.map((setlist, idx) => {
              const count = songCounts[setlist.id] ?? 0;
              const totalSec = totalDurations[setlist.id] ?? 0;
              const isDeleting = deleteConfirm === setlist.id;

              return (
                <div
                  key={setlist.id}
                  className="group relative"
                  data-testid={`card-setlist-${setlist.id}`}
                  onClick={() => handleOpen(setlist.id)}
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 14,
                    padding: "24px 24px 18px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 200,
                    transition: "transform 0.18s ease, border-color 0.18s, background 0.18s",
                    overflow: "hidden",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(193,134,200,0.4)";
                    e.currentTarget.style.transform = "translateY(-3px)";
                    e.currentTarget.style.background = "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.background = "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)";
                  }}
                >
                  {/* Card number (top right) */}
                  <div
                    style={{
                      position: "absolute",
                      top: 18,
                      right: 22,
                      fontFamily: MONO,
                      fontSize: 10,
                      color: "#76766f",
                      letterSpacing: "0.1em",
                      fontWeight: 700,
                    }}
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </div>

                  {/* Name */}
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 700,
                      color: "#e8e8e2",
                      marginBottom: 12,
                      lineHeight: 1.25,
                      wordBreak: "break-word",
                      paddingRight: 40,
                    }}
                    data-testid={`text-setlist-name-${setlist.id}`}
                  >
                    {setlist.name || "Untitled"}
                  </div>

                  {/* Meta */}
                  <div
                    className="flex items-center"
                    style={{
                      gap: 10,
                      fontSize: 10,
                      color: "#76766f",
                      letterSpacing: "0.18em",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      marginBottom: "auto",
                    }}
                  >
                    <span style={{ color: "#e8e8e2", fontSize: 13, letterSpacing: 0 }} data-testid={`text-song-count-${setlist.id}`}>
                      {count}
                    </span>
                    <span>songs</span>
                    <span style={{ width: 3, height: 3, background: "#76766f", borderRadius: "50%", opacity: 0.5 }} />
                    <span style={{ color: "#e8e8e2", fontSize: 13, letterSpacing: 0 }}>
                      {formatTotal(totalSec)}
                    </span>
                    <span>total</span>
                  </div>

                  {/* Footer */}
                  <div
                    className="flex items-center justify-between"
                    style={{
                      marginTop: 20,
                      paddingTop: 14,
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      fontSize: 10,
                      color: "#76766f",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                    }}
                  >
                    <span>
                      {setlist.showTime ? `SHOW ${setlist.showTime}` : setlist.doorOpen ? `DOOR ${setlist.doorOpen}` : "—"}
                    </span>
                    <div
                      className="flex opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ gap: 4 }}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(setlist.id); }}
                        title="複製"
                        data-testid={`button-duplicate-setlist-${setlist.id}`}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "#76766f",
                          cursor: "pointer",
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = ACCENT;
                          e.currentTarget.style.borderColor = ACCENT;
                          e.currentTarget.style.background = "rgba(193,134,200,0.08)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "#76766f";
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(setlist.id); }}
                        title={isDeleting ? "もう一度クリックで削除" : "削除"}
                        data-testid={`button-delete-setlist-${setlist.id}`}
                        style={{
                          background: isDeleting ? "rgba(239,83,80,0.08)" : "transparent",
                          border: isDeleting ? "1px solid #ef5350" : "1px solid rgba(255,255,255,0.08)",
                          color: isDeleting ? "#ef5350" : "#76766f",
                          cursor: "pointer",
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.12s",
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Create new card */}
            <div
              onClick={handleCreate}
              data-testid="button-create-setlist"
              style={{
                border: "1px dashed rgba(255,255,255,0.1)",
                borderRadius: 14,
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                color: "#76766f",
                minHeight: 200,
                gap: 8,
                cursor: "pointer",
                transition: "border-color 0.18s, color 0.18s, background 0.18s, transform 0.18s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(193,134,200,0.5)";
                e.currentTarget.style.color = ACCENT;
                e.currentTarget.style.background = "rgba(193,134,200,0.03)";
                e.currentTarget.style.transform = "translateY(-3px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                e.currentTarget.style.color = "#76766f";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <Plus size={32} strokeWidth={1} />
              <span style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", fontWeight: 700 }}>
                New Setlist
              </span>
            </div>
          </>
        )}
      </div>

      <p
        className="text-center"
        style={{
          color: "#76766f",
          fontSize: 11,
          fontFamily: FONT,
          letterSpacing: "0.1em",
          marginTop: 48,
        }}
        data-testid="text-footer-note"
      >
        データはブラウザに自動保存されます
      </p>
    </div>
  );
}
