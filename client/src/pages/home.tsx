import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Trash2, Copy, ChevronRight } from "lucide-react";
import {
  useSetlists,
  useCreateSetlist,
  useDeleteSetlist,
  useActivateSetlist,
  useDuplicateSetlist,
} from "@/hooks/use-local-data";
import { localDB } from "@/lib/local-db";

const FONT = "'Inter', 'Helvetica Neue', 'Noto Sans JP', sans-serif";
const PURPLE = "rgba(168,85,247,0.95)";
const PURPLE_BG = "linear-gradient(160deg, #b06ae6 0%, #8b3fd4 50%, #7232b8 100%)";

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

function CDLogo({ size = 56 }: { size?: number }) {
  const innerSize = size * 0.42;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.16,
        background: PURPLE_BG,
        border: "1px solid rgba(168,85,247,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 12px rgba(168,85,247,0.25)",
      }}
      data-testid="logo-cd"
    >
      <span
        style={{
          fontSize: innerSize,
          fontFamily: FONT,
          fontWeight: 700,
          color: "#1a1a1a",
          letterSpacing: "0.02em",
          lineHeight: 1,
        }}
      >
        CD
      </span>
    </div>
  );
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

  return (
    <div
      className="h-screen w-full overflow-auto flex flex-col items-center justify-center"
      style={{ background: "#262624", fontFamily: FONT }}
      data-testid="home-page"
    >
      <div className="w-full max-w-md px-6">
        <div className="flex flex-col items-center mb-8">
          <CDLogo size={60} />
          <h1
            className="mt-5 font-bold uppercase"
            style={{
              fontFamily: FONT,
              color: PURPLE,
              letterSpacing: "0.06em",
              fontSize: 28,
              fontWeight: 800,
            }}
            data-testid="text-home-title"
          >
            COUNT DOWN STUDIO
          </h1>
          <p
            className="mt-1 uppercase"
            style={{
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.2em",
              fontSize: 11,
              fontFamily: FONT,
              fontWeight: 400,
            }}
            data-testid="text-home-subtitle"
          >
            CONCERT COUNTDOWN TIMER
          </p>
        </div>

        <div
          className="rounded-xl"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "24px",
          }}
        >
          <div
            className="uppercase"
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.15em",
              fontFamily: FONT,
              marginBottom: 12,
            }}
          >
            SET LIST
          </div>

          {isLoading ? (
            <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "32px 0", fontSize: 13 }}>
              Loading...
            </div>
          ) : setlists.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginBottom: 16 }} data-testid="text-empty-state">
                セットリストがありません
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2" data-testid="setlist-list">
              {setlists.map((setlist) => {
                const count = songCounts[setlist.id] ?? 0;
                const totalSec = totalDurations[setlist.id] ?? 0;
                const isDeleting = deleteConfirm === setlist.id;

                return (
                  <div
                    key={setlist.id}
                    className="group relative"
                    data-testid={`card-setlist-${setlist.id}`}
                  >
                    <button
                      className="w-full text-left flex items-center gap-3 rounded-lg"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        padding: "12px 14px",
                      }}
                      onClick={() => handleOpen(setlist.id)}
                      data-testid={`button-open-setlist-${setlist.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-bold truncate"
                          style={{
                            color: "rgba(255,255,255,0.85)",
                            fontSize: 14,
                            fontFamily: FONT,
                            fontWeight: 600,
                          }}
                          data-testid={`text-setlist-name-${setlist.id}`}
                        >
                          {setlist.name || "Untitled"}
                        </div>
                        <div
                          className="flex items-center gap-3 mt-1"
                          style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: FONT }}
                        >
                          <span data-testid={`text-song-count-${setlist.id}`}>{count} songs</span>
                          {totalSec > 0 && <span>{Math.floor(totalSec / 60)}min</span>}
                          {setlist.showTime && <span>SHOW {setlist.showTime}</span>}
                          {setlist.doorOpen && <span>DOOR {setlist.doorOpen}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <span
                          className="p-1.5 rounded transition-all"
                          style={{ color: "rgba(255,255,255,0.3)" }}
                          title="複製"
                          data-testid={`button-duplicate-setlist-${setlist.id}`}
                          onClick={(e) => { e.stopPropagation(); handleDuplicate(setlist.id); }}
                          role="button"
                        >
                          <Copy size={13} />
                        </span>
                        <span
                          className="p-1.5 rounded transition-all"
                          style={{ color: isDeleting ? "rgba(239,68,68,0.9)" : "rgba(255,255,255,0.3)" }}
                          title={isDeleting ? "もう一度クリックで削除" : "削除"}
                          data-testid={`button-delete-setlist-${setlist.id}`}
                          onClick={(e) => { e.stopPropagation(); handleDelete(setlist.id); }}
                          role="button"
                        >
                          <Trash2 size={13} />
                        </span>
                      </div>

                      <ChevronRight
                        size={16}
                        style={{ color: "rgba(255,255,255,0.15)" }}
                        className="flex-shrink-0"
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={handleCreate}
            className="w-full mt-4 uppercase font-bold tracking-wider transition-all"
            style={{
              background: PURPLE_BG,
              color: "#262624",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.1em",
              fontFamily: FONT,
              padding: "12px",
              borderRadius: 8,
              border: "none",
            }}
            data-testid="button-create-setlist"
          >
            NEW SET LIST
          </button>
        </div>

        <p
          className="text-center mt-6"
          style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, fontFamily: FONT }}
          data-testid="text-footer-note"
        >
          データはブラウザに自動保存されます
        </p>
      </div>
    </div>
  );
}
