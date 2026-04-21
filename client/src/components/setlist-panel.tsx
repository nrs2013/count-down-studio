import { useState, useCallback, useRef, useEffect } from "react";
import { type LocalSong as Song, type LocalSetlist as Setlist, localDB } from "@/lib/local-db";
import {
  useUpdateSetlist,
  useUpdateSong,
  useReorderSongs,
  useCreateSong,
  useDeleteSong,
} from "@/hooks/use-local-data";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Music, Play, Plus, Trash2, GripVertical, Download, Upload, Info } from "lucide-react";
import { EventInfoDisplay } from "@/components/event-info-display";
import { InsertionRow } from "@/components/song-row";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  UI_FONT,
  MONO_FONT,
  MIDI_NOTES_BY_NAME,
  formatDuration,
  parseDuration,
  filterTimeInput,
  INPUT_STYLES,
  ACCENT_COLORS,
} from "@/lib/time-utils";
import { TimeInput } from "@/components/styled-input";

interface SetlistPanelProps {
  songs: Song[];
  currentSongIndex: number;
  selectedSongIndex: number;
  setlist: Setlist | null;
  onSongSelect: (index: number) => void;
  onManualStart: (index: number) => void;
  countdownStatus: string;
}

function InlineSongCard({
  song,
  index,
  songs,
  songNumber,
  isCurrent,
  isSelected,
  isPast,
  countdownStatus,
  setlistId,
  onSelect,
  onManualStart,
  autoEditTitle,
}: {
  song: Song;
  index: number;
  songNumber?: number;
  songs: Song[];
  isCurrent: boolean;
  isSelected: boolean;
  isPast: boolean;
  countdownStatus: string;
  setlistId: number;
  onSelect: (index: number) => void;
  onManualStart: (index: number) => void;
  autoEditTitle: boolean;
}) {
  const imeRef = useRef(false);
  const imeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const updateSongMutation = useUpdateSong();
  const deleteSongMutation = useDeleteSong();

  const [editingField, setEditingField] = useState<string | null>(autoEditTitle ? "title" : null);
  const [editValue, setEditValue] = useState(autoEditTitle ? song.title : "");
  const [durationValue, setDurationValue] = useState(formatDuration(song.durationSeconds));
  const durationFocusedRef = useRef(false);

  useEffect(() => {
    if (!durationFocusedRef.current) {
      setDurationValue(formatDuration(song.durationSeconds));
    }
  }, [song.durationSeconds]);

  const commitDuration = () => {
    durationFocusedRef.current = false;
    const trimmed = durationValue.trim();
    if (!trimmed) {
      setDurationValue(formatDuration(song.durationSeconds));
      return;
    }
    const parsed = parseDuration(trimmed);
    if (parsed === null) {
      setDurationValue(formatDuration(song.durationSeconds));
      return;
    }
    setDurationValue(formatDuration(parsed));
    if (parsed !== song.durationSeconds) {
      updateSongMutation.mutate({ id: song.id, data: { durationSeconds: parsed }, setlistId });
    }
  };

  const startEditing = (field: string, value: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setEditingField(field);
    setEditValue(value);
  };

  const commitEdit = () => {
    if (!editingField) return;

    if (editingField === "title") {
      const trimmed = editValue.trim();
      if (trimmed !== song.title) {
        updateSongMutation.mutate({ id: song.id, data: { title: trimmed }, setlistId });
      }
    } else if (editingField === "nextTitle") {
      const trimmed = editValue.trim();
      const newVal = trimmed || null;
      if (newVal !== (song.nextTitle || null)) {
        updateSongMutation.mutate({ id: song.id, data: { nextTitle: newVal }, setlistId });
        if (newVal) {
          const nextSong = songs[index + 1];
          if (nextSong) {
            updateSongMutation.mutate({ id: nextSong.id, data: { title: newVal }, setlistId });
          }
        }
      }
    }

    setEditingField(null);
  };

  const onCompStart = useCallback(() => { imeRef.current = true; clearTimeout(imeTimerRef.current); }, []);
  const onCompEnd = useCallback(() => { clearTimeout(imeTimerRef.current); imeTimerRef.current = setTimeout(() => { imeRef.current = false; }, 50); }, []);
  const isIME = useCallback((e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229 || imeRef.current, []);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.7 : undefined,
  };

  const defaultNext = index < songs.length - 1 ? songs[index + 1].title : "";
  const nextDisplay = song.nextTitle || defaultNext || "---";

  const handleMidiChange = (value: string) => {
    const midiNote = value === "none" ? null : parseInt(value, 10);
    updateSongMutation.mutate({ id: song.id, data: { midiNote }, setlistId });
  };

  const handleCardClick = () => {
    if (!editingField) {
      onSelect(index);
    }
  };

  const isEvent = song.isEvent === true;
  const isMC = song.isMC === true;

  const cardBg = isMC
    ? (isCurrent
      ? "rgba(56,189,248,0.15)"
      : isSelected
        ? "rgba(56,189,248,0.1)"
        : isPast
          ? "rgba(56,189,248,0.02)"
          : "rgba(56,189,248,0.05)")
    : isEvent
    ? (isCurrent
      ? "linear-gradient(135deg, rgba(234,179,8,0.2), rgba(250,204,21,0.1))"
      : isSelected
        ? "linear-gradient(135deg, rgba(234,179,8,0.12), rgba(250,204,21,0.06))"
        : isPast
          ? "rgba(234,179,8,0.03)"
          : "rgba(234,179,8,0.06)")
    : (isCurrent
      ? "linear-gradient(135deg, rgba(192,38,211,0.15), rgba(232,121,249,0.08))"
      : isSelected
        ? "linear-gradient(135deg, rgba(6,182,212,0.12), rgba(34,211,238,0.06))"
        : isPast
          ? "rgba(255,255,255,0.02)"
          : "rgba(255,255,255,0.04)");

  const cardBorderColor = isMC
    ? (isCurrent
      ? "rgba(56,189,248,0.4)"
      : isSelected
        ? "rgba(56,189,248,0.25)"
        : "transparent")
    : isEvent
    ? (isCurrent
      ? "rgba(250,204,21,0.5)"
      : isSelected
        ? "rgba(250,204,21,0.35)"
        : isPast
          ? "rgba(250,204,21,0.08)"
          : "rgba(250,204,21,0.15)")
    : (isCurrent
      ? "rgba(232,121,249,0.4)"
      : isSelected
        ? "rgba(34,211,238,0.4)"
        : isPast
          ? "rgba(255,255,255,0.05)"
          : "rgba(255,255,255,0.08)");

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: cardBg,
        borderColor: cardBorderColor,
      }}
      className={`${isMC ? "rounded px-2 py-0.5" : "rounded-lg px-2.5 py-2"} transition-all duration-200 border cursor-pointer relative ${
        isPast ? "opacity-40" : ""
      }`}
      onClick={handleCardClick}
      data-testid={`card-song-${song.id}`}
    >
      {/* Active indicator line */}
      {isCurrent && (
        <div
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
          style={isMC
            ? { background: "linear-gradient(180deg, #7dd3fc, #38bdf8)", boxShadow: "0 0 8px rgba(56,189,248,0.4)" }
            : isEvent
            ? { background: "linear-gradient(180deg, #facc15, #eab308)", boxShadow: "0 0 8px rgba(250,204,21,0.4)" }
            : { background: "linear-gradient(180deg, #e879f9, #c026d3)", boxShadow: "0 0 8px rgba(232,121,249,0.4)" }
          }
        />
      )}
      {isSelected && !isCurrent && (
        <div
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
          style={isMC
            ? { background: "linear-gradient(180deg, #7dd3fc, #0ea5e9)", boxShadow: "0 0 8px rgba(56,189,248,0.3)" }
            : isEvent
            ? { background: "linear-gradient(180deg, #facc15, #ca8a04)", boxShadow: "0 0 8px rgba(250,204,21,0.3)" }
            : { background: "linear-gradient(180deg, #22d3ee, #06b6d4)", boxShadow: "0 0 8px rgba(34,211,238,0.3)" }
          }
        />
      )}

      <div className="flex items-center gap-1.5">
        <div
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-white/20 hover:text-white/50 touch-none self-stretch flex items-center"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <div className="flex-shrink-0 w-5 flex items-center justify-center">
          {isCurrent && countdownStatus === "running" ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isMC ? "bg-sky-400" : isEvent ? "bg-yellow-400" : "bg-fuchsia-400"} opacity-75`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isMC ? "bg-sky-500" : isEvent ? "bg-yellow-500" : "bg-fuchsia-500"}`} />
            </span>
          ) : (
            <span
              className="text-[11px] font-medium"
              style={{
                fontFamily: UI_FONT,
                color: isMC ? "#38bdf8" : isEvent ? "#facc15" : isCurrent ? "#e879f9" : isSelected ? "#22d3ee" : "rgba(255,255,255,0.5)",
              }}
            >
              {isMC ? "MC" : isEvent ? "SP" : (songNumber ?? index + 1)}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isMC ? (
            <div />
          ) : (
            <>
              <div className="flex items-baseline gap-0 overflow-hidden">
                <span className="text-fuchsia-400 text-[10px] mr-1 font-bold flex-shrink-0" style={{ textShadow: "0 0 8px rgba(232,121,249,0.3)" }}>NOW:</span>
                {editingField === "title" ? (
                  <input
                    type="text"
                    className="h-7 text-sm text-white px-2 flex-1 rounded-md focus:outline-none transition-all duration-200"
                    style={{
                      border: `1px solid ${ACCENT_COLORS.fuchsia}`,
                      background: INPUT_STYLES.background,
                      boxShadow: INPUT_STYLES.glowFocused(ACCENT_COLORS.fuchsia),
                      fontFamily: UI_FONT,
                    }}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onCompositionStart={onCompStart}
                    onCompositionEnd={onCompEnd}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (isIME(e)) return;
                      if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                      if (e.key === "Escape") setEditingField(null);
                    }}
                    autoFocus
                    data-testid={`input-title-${song.id}`}
                  />
                ) : (
                  <span
                    className={`text-sm font-semibold truncate text-left cursor-text rounded px-1 py-0.5 hover:bg-white/10 ${!song.title ? "text-white/30 italic" : isCurrent ? "text-white" : "text-white/80"}`}
                    onMouseDown={(e) => startEditing("title", song.title, e)}
                    data-testid={`button-edit-title-${song.id}`}
                  >
                    {song.title || "Untitled"}
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-0 overflow-hidden mt-1">
                <span className="text-cyan-400 text-[10px] mr-1 font-bold flex-shrink-0" style={{ textShadow: "0 0 8px rgba(6,182,212,0.3)" }}>NEXT:</span>
                {editingField === "nextTitle" ? (
                  <input
                    type="text"
                    className="h-7 text-sm text-white px-2 flex-1 rounded-md focus:outline-none transition-all duration-200"
                    style={{
                      border: `1px solid ${ACCENT_COLORS.cyan}`,
                      background: INPUT_STYLES.background,
                      boxShadow: INPUT_STYLES.glowFocused(ACCENT_COLORS.cyan),
                      fontFamily: UI_FONT,
                    }}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onCompositionStart={onCompStart}
                    onCompositionEnd={onCompEnd}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (isIME(e)) return;
                      if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                      if (e.key === "Escape") setEditingField(null);
                    }}
                    autoFocus
                    placeholder={defaultNext || "---"}
                    data-testid={`input-next-title-${song.id}`}
                  />
                ) : (
                  <span
                    className={`text-sm truncate text-left cursor-text rounded px-1 py-0.5 hover:bg-white/10 ${song.nextTitle ? "text-white/80" : "text-white/40 italic"}`}
                    onMouseDown={(e) => startEditing("nextTitle", song.nextTitle || "", e)}
                    data-testid={`button-edit-next-${song.id}`}
                  >
                    {nextDisplay}
                  </span>
                )}
              </div>
            </>
          )}

          <div className="flex items-center gap-2 mt-1.5">
            {isMC ? (
              <div className="flex items-center gap-1">
                <TimeInput
                  value={durationValue}
                  onChange={(v) => setDurationValue(v)}
                  onBlur={() => commitDuration()}
                  onFocusField={() => { durationFocusedRef.current = true; }}
                  placeholder="0:00"
                  testId={`input-mc-target-${song.id}`}
                  color="rgba(56,189,248,0.7)"
                />
                <span
                  className="text-[9px] font-bold tracking-wider flex-shrink-0"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(56,189,248,0.5)" }}
                >
                  END
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <TimeInput
                  value={song.xTime ? "X" : durationValue}
                  onChange={(v) => { if (!song.xTime) setDurationValue(v); }}
                  onBlur={() => { if (!song.xTime) commitDuration(); }}
                  onFocusField={() => { if (!song.xTime) durationFocusedRef.current = true; }}
                  placeholder="0:00"
                  testId={`input-duration-${song.id}`}
                  color={song.xTime ? "rgba(34,197,94,0.7)" : undefined}
                  disabled={song.xTime}
                />
                <button
                  tabIndex={-1}
                  className="shrink-0 flex flex-col items-center justify-center rounded-md transition-all duration-200 py-1 px-1"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    minWidth: "28px",
                    ...(song.xTime
                      ? {
                          background: "rgba(34,197,94,0.15)",
                          color: "rgba(34,197,94,0.95)",
                          border: "1px solid rgba(34,197,94,0.4)",
                          boxShadow: "0 0 6px rgba(34,197,94,0.15)",
                        }
                      : {
                          background: "rgba(255,255,255,0.03)",
                          color: "rgba(255,255,255,0.15)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }),
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateSongMutation.mutate({ id: song.id, data: { xTime: !song.xTime }, setlistId });
                  }}
                  data-testid={`button-xtime-${song.id}`}
                >
                  <span style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.05em" }}>X</span>
                  <span style={{ fontSize: "6px", fontWeight: 700, letterSpacing: "0.08em", marginTop: "-1px" }}>TIME</span>
                </button>
              </div>
            )}

            <Select
              value={song.midiNote !== null && song.midiNote !== undefined ? song.midiNote.toString() : "none"}
              onValueChange={handleMidiChange}
            >
              <SelectTrigger
                className="h-auto py-0.5 px-1.5 text-sm w-28 bg-white/6 border-white/10 text-white/70 flex-shrink-0 rounded"
                onClick={(e) => e.stopPropagation()}
                data-testid={`select-midi-${song.id}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No MIDI</SelectItem>
                {MIDI_NOTES_BY_NAME.map((group) => (
                  <SelectGroup key={group.noteName}>
                    <SelectLabel style={{ color: "rgba(255,255,255,0.4)", fontWeight: 700, fontSize: "10px", letterSpacing: "0.1em" }}>── {group.noteName} ──</SelectLabel>
                    {group.notes.map((n) => (
                      <SelectItem key={n.value} value={n.value.toString()}>
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="icon"
              variant="ghost"
              className="!h-6 !w-6 text-white/30 ml-auto flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); deleteSongMutation.mutate({ id: song.id, setlistId }); }}
              data-testid={`button-delete-song-${song.id}`}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <button
          className="flex-shrink-0 self-start w-8 h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white/80 hover:bg-white/10 transition-all duration-200"
          onClick={(e) => {
            e.stopPropagation();
            onManualStart(index);
          }}
          data-testid={`button-start-song-${song.id}`}
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function SetlistPanel({
  songs,
  currentSongIndex,
  selectedSongIndex,
  setlist,
  onSongSelect,
  onManualStart,
  countdownStatus,
}: SetlistPanelProps) {
  const { toast } = useToast();
  const [setlistNameValue, setSetlistNameValue] = useState(setlist?.name || "");
  const [doorOpenValue, setDoorOpenValue] = useState(setlist?.doorOpen || "");
  const [showTimeValue, setShowTimeValue] = useState(setlist?.showTime || "");
  const [rehearsalValue, setRehearsalValue] = useState(setlist?.rehearsal || "");
  const imeSetlistRef = useRef(false);
  const imeSetlistTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const setlistNameFocusedRef = useRef(false);
  const doorOpenFocusedRef = useRef(false);
  const showTimeFocusedRef = useRef(false);
  const rehearsalFocusedRef = useRef(false);
  const imeDoorRef = useRef(false);
  const imeDoorTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const imeShowRef = useRef(false);
  const imeShowTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const imeRehearsalRef = useRef(false);
  const imeRehearsalTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [newSongId, setNewSongId] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showInfoPreview, setShowInfoPreview] = useState(false);

  useEffect(() => {
    if (setlist && !setlistNameFocusedRef.current) {
      setSetlistNameValue(setlist.name);
    }
    if (setlist && !doorOpenFocusedRef.current) {
      setDoorOpenValue(setlist.doorOpen || "");
    }
    if (setlist && !showTimeFocusedRef.current) {
      setShowTimeValue(setlist.showTime || "");
    }
    if (setlist && !rehearsalFocusedRef.current) {
      setRehearsalValue(setlist.rehearsal || "");
    }
  }, [setlist?.id, setlist?.name, setlist?.doorOpen, setlist?.showTime, setlist?.rehearsal]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const updateSetlist = useUpdateSetlist();

  const commitSetlistName = useCallback(() => {
    setlistNameFocusedRef.current = false;
    if (!setlist) return;
    const trimmed = setlistNameValue.trim();
    if (trimmed && trimmed !== setlist.name) {
      updateSetlist.mutate({ id: setlist.id, data: { name: trimmed } });
    } else if (setlist) {
      setSetlistNameValue(setlist.name);
    }
  }, [setlist, setlistNameValue, updateSetlist]);

  const commitDoorOpen = useCallback(() => {
    doorOpenFocusedRef.current = false;
    if (!setlist) return;
    const val = filterTimeInput(doorOpenValue).trim();
    setDoorOpenValue(val);
    if (val !== (setlist.doorOpen || "")) {
      updateSetlist.mutate({ id: setlist.id, data: { doorOpen: val || null } });
    }
  }, [setlist, doorOpenValue, updateSetlist]);

  const commitShowTime = useCallback(() => {
    showTimeFocusedRef.current = false;
    if (!setlist) return;
    const val = filterTimeInput(showTimeValue).trim();
    setShowTimeValue(val);
    if (val !== (setlist.showTime || "")) {
      updateSetlist.mutate({ id: setlist.id, data: { showTime: val || null } });
    }
  }, [setlist, showTimeValue, updateSetlist]);

  const commitRehearsal = useCallback(() => {
    rehearsalFocusedRef.current = false;
    if (!setlist) return;
    const val = filterTimeInput(rehearsalValue).trim();
    setRehearsalValue(val);
    if (val !== (setlist.rehearsal || "")) {
      updateSetlist.mutate({ id: setlist.id, data: { rehearsal: val || null } });
    }
  }, [setlist, rehearsalValue, updateSetlist]);

  const handleExport = useCallback(async () => {
    if (!setlist) return;
    const data = {
      name: setlist.name,
      description: setlist.description,
      doorOpen: setlist.doorOpen ?? null,
      showTime: setlist.showTime ?? null,
      rehearsal: setlist.rehearsal ?? null,
      songs: songs.map((s) => ({
        title: s.title,
        nextTitle: s.nextTitle,
        artist: s.artist,
        durationSeconds: s.durationSeconds,
        midiNote: s.midiNote,
        midiChannel: s.midiChannel,
        timeRange: s.timeRange,
        isEvent: s.isEvent ?? false,
        isMC: s.isMC ?? false,
        xTime: s.xTime ?? false,
        isEncore: s.isEncore ?? false,
        subTimerSeconds: s.subTimerSeconds ?? 0,
        subTimerTimeRange: s.subTimerTimeRange ?? null,
      })),
    };
    const safeName = setlist.name.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF _-]/g, "") || "setlist";
    const jsonStr = JSON.stringify(data, null, 2);

    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${safeName}.scd`,
          types: [
            { description: "Song Countdown File", accept: { "application/json": [".scd", ".json"] } },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonStr);
        await writable.close();
        toast({ title: "Saved", description: handle.name });
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }

    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.scd`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Saved" });
  }, [setlist, songs, toast]);

  const processImportFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.songs || !Array.isArray(data.songs)) {
        toast({ title: "Invalid file", description: "JSON file must contain a songs array", variant: "destructive" });
        return;
      }
      if (!setlist) return;
      const importName = data.name || file.name.replace(/\.(scd|json)$/i, "");
      const confirmed = window.confirm(
        `「${importName}」をインポートしますか？\n現在のセットリストのデータは上書きされます。`
      );
      if (!confirmed) return;
      const songsData = data.songs.map((s: any) => ({
        title: s.title ?? "",
        nextTitle: s.nextTitle ?? null,
        artist: s.artist ?? null,
        durationSeconds: typeof s.durationSeconds === "number" ? s.durationSeconds : 0,
        orderIndex: 0,
        midiNote: typeof s.midiNote === "number" ? s.midiNote : null,
        midiChannel: typeof s.midiChannel === "number" ? s.midiChannel : null,
        timeRange: s.timeRange ?? null,
        isEvent: s.isEvent === true,
        isMC: s.isMC === true,
        xTime: s.xTime === true,
        isEncore: s.isEncore === true,
        subTimerSeconds: typeof s.subTimerSeconds === "number" ? s.subTimerSeconds : 0,
        subTimerTimeRange: s.subTimerTimeRange ?? null,
      }));
      await localDB.replaceSetlistSongs(setlist.id, importName, songsData, {
        doorOpen: typeof data.doorOpen === "string" ? data.doorOpen : null,
        showTime: typeof data.showTime === "string" ? data.showTime : null,
        rehearsal: typeof data.rehearsal === "string" ? data.rehearsal : null,
      });
      queryClient.invalidateQueries({ queryKey: ["setlists"] });
      queryClient.invalidateQueries({ queryKey: ["songs", setlist.id] });
      toast({ title: "Imported", description: `${importName} (${data.songs.length} songs)` });
    } catch {
      toast({ title: "Import failed", description: "Could not read the file", variant: "destructive" });
    }
  }, [setlist, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".json") || file.name.endsWith(".scd"))) {
      processImportFile(file);
    } else {
      toast({ title: "Invalid file", description: "Please drop a .json or .scd file", variant: "destructive" });
    }
  }, [processImportFile, toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImportFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processImportFile]);

  const reorderSongsMutation = useReorderSongs();
  const updateSongForReorder = useUpdateSong();
  const addSongMutation = useCreateSong();

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 100);
  }, []);

  const handleAddSongAt = useCallback((afterIndex: number) => {
    if (!setlist) return;
    addSongMutation.mutate({
      setlistId: setlist.id,
      title: "",
      nextTitle: null,
      artist: null,
      durationSeconds: 0,
      orderIndex: afterIndex + 1,
      midiNote: null,
      midiChannel: null,
      timeRange: null,
      isEvent: false,
      xTime: false,
      isMC: false,
    }, {
      onSuccess: (newSong) => {
        if (newSong?.id) {
          setNewSongId(newSong.id);
        }
        scrollToBottom();
      },
    });
  }, [setlist, addSongMutation, scrollToBottom]);

  const handleAddEventAt = useCallback((afterIndex: number) => {
    if (!setlist) return;
    addSongMutation.mutate({
      setlistId: setlist.id,
      title: "",
      nextTitle: null,
      artist: null,
      durationSeconds: 0,
      orderIndex: afterIndex + 1,
      midiNote: null,
      midiChannel: null,
      timeRange: null,
      isEvent: true,
      xTime: false,
      isMC: false,
    }, {
      onSuccess: (newSong) => {
        if (newSong?.id) {
          setNewSongId(newSong.id);
        }
        scrollToBottom();
      },
    });
  }, [setlist, addSongMutation, scrollToBottom]);

  const handleAddMCAt = useCallback((afterIndex: number) => {
    if (!setlist) return;
    addSongMutation.mutate({
      setlistId: setlist.id,
      title: "",
      nextTitle: null,
      artist: null,
      durationSeconds: 0,
      orderIndex: afterIndex + 1,
      midiNote: null,
      midiChannel: null,
      timeRange: null,
      isEvent: false,
      xTime: false,
      isMC: true,
    }, {
      onSuccess: (newSong) => {
        if (newSong?.id) {
          setNewSongId(newSong.id);
        }
        scrollToBottom();
      },
    });
  }, [setlist, addSongMutation, scrollToBottom]);

  useEffect(() => {
    if (newSongId && songs.some(s => s.id === newSongId)) {
      setNewSongId(null);
    }
  }, [songs, newSongId]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = songs.findIndex((s) => s.id === active.id);
      const newIndex = songs.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(songs, oldIndex, newIndex);
      if (setlist) {
        reorderSongsMutation.mutate({ setlistId: setlist.id, songIds: reordered.map((s) => s.id) }, {
          onSuccess: () => {
            for (let i = 1; i < reordered.length; i++) {
              const prev = reordered[i - 1];
              if (prev.nextTitle) {
                updateSongForReorder.mutate({ id: reordered[i].id, data: { title: prev.nextTitle }, setlistId: setlist.id });
              }
            }
          },
        });
      }
    },
    [songs, reorderSongsMutation, setlist, updateSongForReorder],
  );

  return (
    <div
      className="flex flex-col h-full relative"
      style={{
        background: "linear-gradient(180deg, #22211f 0%, #1a1a18 100%)",
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      data-testid="setlist-panel"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.scd,application/json"
        onChange={handleFileInput}
        className="hidden"
        data-testid="input-import-file"
      />
      {isDragOver && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none"
          style={{
            background: "rgba(6,182,212,0.15)",
            border: "3px dashed rgba(6,182,212,0.6)",
            borderRadius: 8,
          }}
        >
          <Upload className="w-10 h-10 text-cyan-400 mb-3" />
          <p className="text-cyan-300 text-sm font-bold tracking-wide">Drop JSON file to import</p>
        </div>
      )}
      {/* Header */}
      <div
        className="px-3 py-3 relative"
        style={{
          borderBottom: "1px solid rgba(232,121,249,0.15)",
          background: "linear-gradient(180deg, rgba(232,121,249,0.06) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <h3
            className="flex-1 min-w-0 text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-400"
            style={{
              fontFamily: UI_FONT,
              textShadow: "0 0 12px rgba(232,121,249,0.4)",
            }}
          >
            Concert Title
          </h3>
          <span className="text-[8px] font-bold uppercase tracking-wider text-green-400/60 leading-none text-center" style={{ fontFamily: UI_FONT, width: "72px", minWidth: "72px" }}>REHEARSAL</span>
          <span className="text-[8px] font-bold uppercase tracking-wider text-amber-400/60 leading-none text-center" style={{ fontFamily: UI_FONT, width: "72px", minWidth: "72px" }}>DOOR OPEN</span>
          <span className="text-[8px] font-bold uppercase tracking-wider text-cyan-400/60 leading-none text-center" style={{ fontFamily: UI_FONT, width: "72px", minWidth: "72px" }}>SHOW TIME</span>
          <div className="flex items-center gap-0">
            <button
              className="w-7 h-7 rounded-full flex items-center justify-center text-fuchsia-400/50 hover:text-fuchsia-400 hover:bg-fuchsia-500/10 transition-all duration-200"
              onClick={() => setShowInfoPreview(true)}
              title="Preview INFO display"
              data-testid="button-info-preview"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            <button
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-all duration-200"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-import-setlist"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-all duration-200"
              onClick={handleExport}
              data-testid="button-export-setlist"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 min-w-0 h-9 text-sm rounded-lg text-white px-3 font-semibold placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50 transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            value={setlistNameValue}
            onChange={(e) => { if (setlist) setSetlistNameValue(e.target.value); }}
            onFocus={() => { setlistNameFocusedRef.current = true; }}
            onCompositionStart={() => { imeSetlistRef.current = true; clearTimeout(imeSetlistTimerRef.current); }}
            onCompositionEnd={() => { clearTimeout(imeSetlistTimerRef.current); imeSetlistTimerRef.current = setTimeout(() => { imeSetlistRef.current = false; }, 300); }}
            onBlur={commitSetlistName}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229 || imeSetlistRef.current) return;
              if (e.key === "Enter") { e.preventDefault(); commitSetlistName(); }
            }}
            placeholder="Concert Title"
            data-testid="input-setlist-name"
          />
          <input
            type="text"
            inputMode="numeric"
            className="h-9 text-sm rounded-lg text-white px-2 text-center font-semibold placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-green-500/40 transition-all duration-200"
            style={{ width: "72px", minWidth: "72px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            value={rehearsalValue}
            onChange={(e) => { setRehearsalValue(imeRehearsalRef.current ? e.target.value : filterTimeInput(e.target.value)); }}
            onCompositionStart={() => { imeRehearsalRef.current = true; clearTimeout(imeRehearsalTimerRef.current); }}
            onCompositionEnd={(e) => { clearTimeout(imeRehearsalTimerRef.current); imeRehearsalTimerRef.current = setTimeout(() => { imeRehearsalRef.current = false; }, 300); setRehearsalValue(filterTimeInput((e.target as HTMLInputElement).value)); }}
            onFocus={() => { rehearsalFocusedRef.current = true; }}
            onBlur={commitRehearsal}
            onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229 || imeRehearsalRef.current) return; if (e.key === "Enter") { e.preventDefault(); commitRehearsal(); } }}
            placeholder="00:00"
            data-testid="input-rehearsal"
          />
          <input
            type="text"
            inputMode="numeric"
            className="h-9 text-sm rounded-lg text-white px-2 text-center font-semibold placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-500/40 transition-all duration-200"
            style={{ width: "72px", minWidth: "72px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            value={doorOpenValue}
            onChange={(e) => { setDoorOpenValue(imeDoorRef.current ? e.target.value : filterTimeInput(e.target.value)); }}
            onCompositionStart={() => { imeDoorRef.current = true; clearTimeout(imeDoorTimerRef.current); }}
            onCompositionEnd={(e) => { clearTimeout(imeDoorTimerRef.current); imeDoorTimerRef.current = setTimeout(() => { imeDoorRef.current = false; }, 300); setDoorOpenValue(filterTimeInput((e.target as HTMLInputElement).value)); }}
            onFocus={() => { doorOpenFocusedRef.current = true; }}
            onBlur={commitDoorOpen}
            onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229 || imeDoorRef.current) return; if (e.key === "Enter") { e.preventDefault(); commitDoorOpen(); } }}
            placeholder="00:00"
            data-testid="input-door-open"
          />
          <input
            type="text"
            inputMode="numeric"
            className="h-9 text-sm rounded-lg text-white px-2 text-center font-semibold placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-all duration-200"
            style={{ width: "72px", minWidth: "72px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            value={showTimeValue}
            onChange={(e) => { setShowTimeValue(imeShowRef.current ? e.target.value : filterTimeInput(e.target.value)); }}
            onCompositionStart={() => { imeShowRef.current = true; clearTimeout(imeShowTimerRef.current); }}
            onCompositionEnd={(e) => { clearTimeout(imeShowTimerRef.current); imeShowTimerRef.current = setTimeout(() => { imeShowRef.current = false; }, 300); setShowTimeValue(filterTimeInput((e.target as HTMLInputElement).value)); }}
            onFocus={() => { showTimeFocusedRef.current = true; }}
            onBlur={commitShowTime}
            onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229 || imeShowRef.current) return; if (e.key === "Enter") { e.preventDefault(); commitShowTime(); } }}
            placeholder="00:00"
            data-testid="input-show-time"
          />
        </div>
      </div>

      {/* Song list */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="p-2 space-y-1.5">
          {songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/30">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: "rgba(232,121,249,0.08)", border: "1px solid rgba(232,121,249,0.15)" }}
              >
                <Music className="w-7 h-7 text-fuchsia-400/50" />
              </div>
              <p className="text-sm mb-1 text-white/50">No songs yet</p>
              <p className="text-[11px] text-white/25">Add songs to build your setlist</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={songs.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {(() => {
                  let songNum = 0;
                  return songs.map((song, index) => {
                    if (!song.isEvent && !song.isMC) songNum++;
                    return (
                      <InlineSongCard
                        key={song.id}
                        song={song}
                        index={index}
                        songNumber={songNum}
                        songs={songs}
                        isCurrent={index === currentSongIndex}
                        isSelected={index === selectedSongIndex}
                        isPast={index < currentSongIndex}
                        countdownStatus={countdownStatus}
                        setlistId={setlist!.id}
                        onSelect={onSongSelect}
                        onManualStart={onManualStart}
                        autoEditTitle={song.id === newSongId}
                      />
                    );
                  });
                })()}
              </SortableContext>
            </DndContext>
          )}
          <InsertionRow
            onAddSong={() => handleAddSongAt(songs.length)}
            onAddSpecial={() => handleAddEventAt(songs.length)}
            onAddMC={() => handleAddMCAt(songs.length)}
            disabled={!setlist}
            testIdPrefix="panel-bottom"
          />
          <div style={{ minHeight: "50vh" }} />
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-3 py-3 relative"
        style={{
          borderTop: "1px solid rgba(6,182,212,0.15)",
          background: "linear-gradient(0deg, rgba(6,182,212,0.04) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center justify-between gap-2 text-[11px] text-white/30">
          <span>{songs.length} songs</span>
          <span style={{ fontFamily: UI_FONT }}>
            {formatDuration(songs.reduce((acc, s) => acc + s.durationSeconds, 0))} total
          </span>
        </div>
      </div>

      {showInfoPreview && (
        <EventInfoDisplay
          concertTitle={setlist?.name || ""}
          doorOpen={setlist?.doorOpen || null}
          showTime={setlist?.showTime || null}
          rehearsal={setlist?.rehearsal || null}
          onClose={() => setShowInfoPreview(false)}
        />
      )}
    </div>
  );
}
