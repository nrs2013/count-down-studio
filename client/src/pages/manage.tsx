import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useIsMobile, useDeviceType } from "@/hooks/use-mobile";
import { useMidi } from "@/hooks/use-midi";
import { useCountdown } from "@/hooks/use-countdown";
import { useAppMode } from "@/hooks/use-app-mode";
import { type LocalSong as Song, localDB } from "@/lib/local-db";
import {
  useSetlists,
  useSongs,
  useCreateSetlist,
  useDeleteSetlist,
  useCreateSong,
  useDeleteSong,
  useUpdateSong,
  useUpdateSetlist,
  useReorderSongs,
} from "@/hooks/use-local-data";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Music,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  GripVertical,
} from "lucide-react";
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
  filterTimeInput,
  parseDuration,
  formatDuration,
  parseStartEndFromRange,
  INPUT_STYLES,
  ACCENT_COLORS,
  HEADER_FONT,
} from "@/lib/time-utils";
import { StyledInput, TimeInput, StyledSelect, useIMEGuard } from "@/components/styled-input";
import { MidiNoteIndicator } from "@/components/midi-note-indicator";
import { PerformanceEditor } from "@/components/performance-editor";
import { SongRow, SongTableHeader, AddSongButton, AddSpecialButton, AddMCButton, AddEncoreButton, InsertionRow } from "@/components/song-row";

function MobileSongCard({
  song,
  index,
  songNumber,
  setlistId,
  isLast,
  onNextTitleCommit,
}: {
  song: Song;
  index: number;
  songNumber?: number;
  setlistId: number;
  isLast: boolean;
  onNextTitleCommit?: (songIndex: number, nextTitleValue: string | null) => void;
}) {
  const { toast } = useToast();
  const updateSong = useUpdateSong();
  const deleteSong = useDeleteSong();

  const [title, setTitle] = useState(song.title);
  const [nextTitle, setNextTitle] = useState(song.nextTitle || "");
  const [duration, setDuration] = useState(formatDuration(song.durationSeconds));

  const initRange = parseStartEndFromRange(song.timeRange);
  const [startTime, setStartTime] = useState(initRange.start);
  const [endTime, setEndTime] = useState(initRange.end);

  const focusedFieldRef = useRef<string | null>(null);

  useEffect(() => {
    if (focusedFieldRef.current !== "title") setTitle(song.title);
    if (focusedFieldRef.current !== "nextTitle") setNextTitle(song.nextTitle || "");
    if (focusedFieldRef.current !== "duration") setDuration(formatDuration(song.durationSeconds));
    if (focusedFieldRef.current !== "startTime" && focusedFieldRef.current !== "endTime") {
      const r = parseStartEndFromRange(song.timeRange);
      setStartTime(r.start);
      setEndTime(r.end);
    }
  }, [song.title, song.nextTitle, song.durationSeconds, song.timeRange]);

  const resetStartEnd = () => {
    const r = parseStartEndFromRange(song.timeRange);
    setStartTime(r.start);
    setEndTime(r.end);
  };

  const commitTitle = () => {
    focusedFieldRef.current = null;
    const trimmed = title.trim();
    if (trimmed !== song.title) {
      updateSong.mutate({ id: song.id, data: { title: trimmed }, setlistId });
    } else {
      setTitle(song.title);
    }
  };

  const commitNextTitle = () => {
    focusedFieldRef.current = null;
    const trimmed = nextTitle.trim();
    const newVal = trimmed || null;
    if (newVal !== (song.nextTitle || null)) {
      updateSong.mutate({ id: song.id, data: { nextTitle: newVal }, setlistId });
      onNextTitleCommit?.(index, newVal);
    }
  };

  const commitStartEnd = () => {
    focusedFieldRef.current = null;
    const s = startTime.trim();
    const e = endTime.trim();
    if (!s && !e) {
      if (song.timeRange) {
        updateSong.mutate({ id: song.id, data: { timeRange: null }, setlistId });
      }
      return;
    }
    if (s && !e) return;
    if (!s && e) return;
    const sParsed = parseDuration(s);
    const eParsed = parseDuration(e);
    if (sParsed === null) { toast({ title: "START: M:SS", description: "e.g. 1:30" }); resetStartEnd(); return; }
    if (eParsed === null) { toast({ title: "END: M:SS", description: "e.g. 4:00" }); resetStartEnd(); return; }
    if (eParsed < sParsed) { toast({ title: "END < START", description: "END must be after START" }); resetStartEnd(); return; }
    const sFormatted = formatDuration(sParsed);
    const eFormatted = formatDuration(eParsed);
    setStartTime(sFormatted);
    setEndTime(eFormatted);
    const combined = `${sFormatted}~${eFormatted}`;
    if (combined !== (song.timeRange || "")) {
      const diff = eParsed - sParsed;
      updateSong.mutate({ id: song.id, data: { timeRange: combined, durationSeconds: diff }, setlistId });
      setDuration(formatDuration(diff));
    }
  };

  const commitDuration = () => {
    focusedFieldRef.current = null;
    const trimmed = duration.trim();
    if (!trimmed) { setDuration(formatDuration(song.durationSeconds)); return; }
    const parsed = parseDuration(trimmed);
    if (parsed === null) { toast({ title: "Time: M:SS", description: "e.g. 3:30" }); setDuration(formatDuration(song.durationSeconds)); return; }
    setDuration(formatDuration(parsed));
    if (parsed !== song.durationSeconds) {
      updateSong.mutate({ id: song.id, data: { durationSeconds: parsed }, setlistId });
    }
  };

  const handleMidiChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const newVal = val === "" ? null : parseInt(val, 10);
    if (newVal !== (song.midiNote ?? null)) {
      updateSong.mutate({ id: song.id, data: { midiNote: newVal }, setlistId });
    }
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  };

  const labelStyle: React.CSSProperties = { fontFamily: UI_FONT, fontSize: "10px", letterSpacing: "0.1em" };
  const LABEL_W = "w-10";

  const isEvent = song.isEvent === true;

  return (
    <div
      ref={setNodeRef}
      className="px-3 py-3 transition-all duration-200"
      style={{
        ...sortableStyle,
        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.06)",
        ...(isEvent ? {
          background: "rgba(234,179,8,0.04)",
          borderLeft: "3px solid rgba(250,204,21,0.5)",
        } : {}),
      }}
      data-testid={`row-song-${song.id}`}
    >
      {/* Row 1: Drag handle + Number + NOW Title + Delete */}
      <div className="flex items-center gap-1.5 mb-2">
        <div
          className="shrink-0 cursor-grab active:cursor-grabbing flex items-center justify-center w-5"
          style={{ color: "rgba(255,255,255,0.2)", touchAction: "none" }}
          tabIndex={-1}
          {...attributes}
          {...listeners}
          data-testid={`drag-handle-${song.id}`}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <span
          className="w-6 text-center text-xs font-bold shrink-0"
          style={{ fontFamily: MONO_FONT, color: isEvent ? "rgba(250,204,21,0.7)" : "rgba(232,121,249,0.5)" }}
        >
          {isEvent ? "S" : (songNumber ?? index + 1)}
        </span>
        <div className="flex-1 min-w-0">
          <StyledInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onFocusField={() => { focusedFieldRef.current = "title"; }}
            className="w-full"
            placeholder="Song title"
            testId={`input-song-title-${song.id}`}
            accent="fuchsia"
          />
        </div>
        <button
          tabIndex={-1}
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white/30 active:text-red-400 transition-all duration-200"
          onClick={() => {
            deleteSong.mutate({ id: song.id, setlistId }, {
              onSuccess: () => toast({ title: "Deleted" }),
            });
          }}
          data-testid={`button-delete-song-${song.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Indented fields area - consistent left alignment */}
      <div className="flex flex-col gap-1.5" style={{ paddingLeft: "calc(0.375rem + 1.375rem + 1.5rem)" }}>
        {/* NEXT Title */}
        <div className="flex items-center gap-1.5">
          <span className={`${LABEL_W} shrink-0 text-cyan-400/50 uppercase`} style={labelStyle}>Next</span>
          <StyledInput
            value={nextTitle}
            onChange={(e) => setNextTitle(e.target.value)}
            onBlur={commitNextTitle}
            onFocusField={() => { focusedFieldRef.current = "nextTitle"; }}
            className="flex-1 text-cyan-400"
            placeholder="NEXT title"
            testId={`input-song-next-${song.id}`}
            accent="cyan"
          />
        </div>

        {/* Time fields - equal 3-column grid */}
        <div className="flex items-center gap-1.5">
          <div className="grid grid-cols-3 gap-1.5 flex-1">
            <div className="flex items-center gap-1">
              <span className="shrink-0 text-white/30 uppercase" style={labelStyle}>S</span>
              <TimeInput
                value={startTime}
                onChange={setStartTime}
                onBlur={commitStartEnd}
                onFocusField={() => { focusedFieldRef.current = "startTime"; }}
                className="w-full"
                testId={`input-song-start-${song.id}`}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="shrink-0 text-white/30 uppercase" style={labelStyle}>E</span>
              <TimeInput
                value={endTime}
                onChange={setEndTime}
                onBlur={commitStartEnd}
                onFocusField={() => { focusedFieldRef.current = "endTime"; }}
                className="w-full"
                testId={`input-song-end-${song.id}`}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="shrink-0 text-white/30 uppercase" style={labelStyle}>T</span>
              <TimeInput
                value={duration}
                onChange={setDuration}
                onBlur={commitDuration}
                onFocusField={() => { focusedFieldRef.current = "duration"; }}
                className="w-full"
                placeholder="M:SS"
                testId={`input-song-duration-${song.id}`}
              />
            </div>
          </div>
        </div>

        {/* MIDI select */}
        <div className="flex items-center gap-1.5">
          <span className={`${LABEL_W} shrink-0 text-white/30 uppercase`} style={labelStyle}>MIDI</span>
          <StyledSelect
            value={song.midiNote !== null && song.midiNote !== undefined ? String(song.midiNote) : ""}
            onChange={handleMidiChange}
            className="flex-1"
            hasValue={song.midiNote !== null && song.midiNote !== undefined}
            testId={`select-midi-${song.id}`}
          >
            <option value="" style={{ background: "#2e2e2b" }}>No MIDI</option>
            {MIDI_NOTES_BY_NAME.map((group) => (
              <optgroup key={group.noteName} label={`── ${group.noteName} ──`} style={{ background: "#2e2e2b", color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>
                {group.notes.map((n) => (
                  <option key={n.value} value={String(n.value)} style={{ background: "#2e2e2b", color: "rgba(255,255,255,0.9)", fontWeight: 400 }}>
                    {n.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </StyledSelect>
        </div>
      </div>
    </div>
  );
}

export default function Manage() {
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const deviceType = useDeviceType();
  const useCardLayout = deviceType === "mobile";
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const concertIME = useIMEGuard();
  const countdown = useCountdown();
  const { broadcast, outputOpen, outputFullscreen, requestOutputFullscreen } = useAppMode();
  const midiNoteOnRef = useRef<((note: number, velocity: number, channel: number) => void) | null>(null);
  const midi = useMidi({ onNoteOn: (note, vel, ch) => midiNoteOnRef.current?.(note, vel, ch) });

  const [currentSongId, setCurrentSongId] = useState<number | null>(null);
  const [liveTitleOverrides, setLiveTitleOverrides] = useState<{ songId: number; title: string; nextTitle: string } | null>(null);
  const [liveDurationOverride, setLiveDurationOverride] = useState<{ songId: number; durationSeconds: number } | null>(null);
  const [showEventInfoOnPrimary, setShowEventInfoOnPrimary] = useState(false);
  const stopEventInfoRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!outputOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        requestOutputFullscreen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [outputOpen, requestOutputFullscreen]);

  const { data: setlists = [], isLoading: loadingSetlists } = useSetlists();
  const [selectedSetlistId, setSelectedSetlistId] = useState<number | null>(null);

  const activeSetlist = selectedSetlistId
    ? setlists.find((s) => s.id === selectedSetlistId)
    : setlists[0];

  const { data: songs = [] } = useSongs(activeSetlist?.id);
  const sortedSongs = [...songs].sort((a, b) => a.orderIndex - b.orderIndex);

  const currentSongIndex = currentSongId !== null ? sortedSongs.findIndex((s) => s.id === currentSongId) : -1;

  const prevSetlistIdRef = useRef(activeSetlist?.id);
  useEffect(() => {
    if (prevSetlistIdRef.current !== activeSetlist?.id) {
      prevSetlistIdRef.current = activeSetlist?.id;
      if (currentSongId !== null) {
        countdown.stop();
        setCurrentSongId(null);
        setLiveTitleOverrides(null);
        setLiveDurationOverride(null);
      }
    }
  }, [activeSetlist?.id, currentSongId, countdown]);

  useEffect(() => {
    if (currentSongId !== null && sortedSongs.length > 0 && !sortedSongs.some((s) => s.id === currentSongId)) {
      setCurrentSongId(null);
      countdown.stop();
    }
  }, [sortedSongs, currentSongId, countdown]);

  const prevStatusRef = useRef(countdown.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = countdown.status;
    if (prev === "running" && countdown.status === "finished" && currentSongId !== null) {
      const idx = sortedSongs.findIndex((s) => s.id === currentSongId);
      const nextIdx = idx + 1;
      const nextSong = sortedSongs[nextIdx];
      if (nextIdx < sortedSongs.length && nextSong.isMC) {
        setCurrentSongId(nextSong.id);
        countdown.startCountUp();
      }
    }
  }, [countdown.status, currentSongId, sortedSongs, countdown]);

  const startSong = useCallback(
    (index: number) => {
      if (index < 0 || index >= sortedSongs.length) return;
      if (stopEventInfoRef.current) {
        stopEventInfoRef.current();
      }
      const song = sortedSongs[index];
      setCurrentSongId(song.id);
      setLiveTitleOverrides(null);
      setLiveDurationOverride(null);
      if (song.isMC || song.isEncore || song.xTime) {
        countdown.startCountUp();
      } else {
        const dur = (liveDurationOverride?.songId === song.id && liveDurationOverride.durationSeconds > 0)
          ? liveDurationOverride.durationSeconds
          : song.durationSeconds;
        countdown.start(dur);
      }
    },
    [sortedSongs, countdown, liveDurationOverride],
  );

  const nextSong = useCallback(() => {
    const next = currentSongIndex + 1;
    if (next < sortedSongs.length) {
      startSong(next);
    }
  }, [currentSongIndex, sortedSongs.length, startSong]);

  const stopSong = useCallback(() => {
    countdown.stop();
    setCurrentSongId(null);
    setLiveTitleOverrides(null);
    setLiveDurationOverride(null);
  }, [countdown]);

  const handleMidiNoteOn = useCallback(
    (note: number, _velocity: number, channel: number) => {
      const matchedIndex = sortedSongs.findIndex(
        (song) =>
          song.midiNote === note &&
          (song.midiChannel === null || song.midiChannel === undefined || song.midiChannel === channel),
      );
      if (matchedIndex >= 0) {
        startSong(matchedIndex);
      }
    },
    [sortedSongs, startSong],
  );

  useEffect(() => {
    midiNoteOnRef.current = handleMidiNoteOn;
  }, [handleMidiNoteOn]);

  const currentSong = currentSongIndex >= 0 ? sortedSongs[currentSongIndex] : null;
  const prevSong = currentSongIndex > 0 ? sortedSongs[currentSongIndex - 1] : null;
  const hasNextSong = currentSongIndex >= 0 && currentSongIndex < sortedSongs.length - 1;
  const nextSongData = hasNextSong ? sortedSongs[currentSongIndex + 1] : null;
  const nextDisplayTitle = (currentSong?.isMC || currentSong?.isEncore ? null : currentSong?.nextTitle) || nextSongData?.title;

  const isIdle = countdown.status === "idle" || countdown.status === "finished";

  const activeSong = currentSong;
  const activeIndex = currentSongIndex;
  const nextSongOfActive = activeIndex >= 0 && activeIndex < sortedSongs.length - 1
    ? sortedSongs[activeIndex + 1] : null;

  const liveTitle = (activeSong && liveTitleOverrides?.songId === activeSong.id) ? liveTitleOverrides.title : null;
  const liveNextTitle = (activeSong && liveTitleOverrides?.songId === activeSong.id) ? liveTitleOverrides.nextTitle : null;

  const activeSongIsMC = currentSong?.isMC === true;
  const activeSongIsEncore = currentSong?.isEncore === true;
  const displaySongTitle = (() => {
    if (activeSongIsMC || activeSongIsEncore) return "";
    if (liveTitle !== null && liveTitle !== undefined) return liveTitle;
    return currentSong?.title || "";
  })();
  const displayArtist = currentSong?.artist || undefined;

  const rawNextTitle = nextDisplayTitle;
  const displayNextTitle = (() => {
    if (liveNextTitle !== null && liveNextTitle !== undefined) {
      return liveNextTitle || nextSongOfActive?.title;
    }
    if (nextSongOfActive && liveTitleOverrides?.songId === nextSongOfActive.id) {
      return liveTitleOverrides.title;
    }
    return rawNextTitle;
  })();

  const displayTime = countdown.formattedTime;
  const displayStatus = countdown.status;
  const displayIsEvent = activeSong?.isEvent ?? false;
  const displayXTime = activeSong?.xTime ?? false;
  const displayIsMC = activeSong?.isMC ?? false;
  const displayIsEncore = activeSong?.isEncore ?? false;
  const displayMcTarget = (displayIsMC || displayIsEncore) && activeSong ? activeSong.durationSeconds : 0;

  const subTimerTotal = activeSong?.subTimerSeconds ?? 0;
  const subTimerStartOffset = (() => {
    if (!activeSong?.subTimerTimeRange) return 0;
    const r = parseStartEndFromRange(activeSong.subTimerTimeRange);
    if (!r.start) return 0;
    const subIN = parseDuration(r.start);
    if (subIN === null) return 0;
    const songRange = parseStartEndFromRange(activeSong.timeRange);
    const songStart = songRange.start ? parseDuration(songRange.start) : null;
    if (songStart !== null) {
      return Math.max(0, subIN - songStart);
    }
    return subIN;
  })();
  const subTimerActive = subTimerTotal > 0 && (subTimerStartOffset === 0 || countdown.elapsedSeconds >= subTimerStartOffset);
  const subTimerElapsed = Math.max(0, countdown.elapsedSeconds - subTimerStartOffset);
  const subTimerRemaining = subTimerTotal > 0
    ? Math.max(0, subTimerTotal - subTimerElapsed)
    : 0;
  const subTimerMin = Math.floor(Math.ceil(subTimerRemaining) / 60);
  const subTimerSec = Math.ceil(subTimerRemaining) % 60;
  const subTimerFormatted = subTimerTotal > 0
    ? `${subTimerMin.toString().padStart(2, "0")}:${subTimerSec.toString().padStart(2, "0")}`
    : "";

  useEffect(() => {
    if (!outputOpen || showEventInfoOnPrimary) return;
    broadcast({
      formattedTime: displayTime,
      status: displayStatus,
      progress: countdown.progress,
      songTitle: displaySongTitle || undefined,
      artist: displayArtist,
      nextSongTitle: displayNextTitle,
      remainingSeconds: countdown.remainingSeconds,
      isEvent: displayIsEvent,
      xTime: displayXTime,
      isMC: displayIsMC,
      isEncore: displayIsEncore,
      isCountUp: countdown.isCountUp,
      elapsedSeconds: countdown.elapsedSeconds,
      mcTargetSeconds: displayMcTarget,
      subTimerSeconds: subTimerTotal,
      subTimerRemaining,
      subTimerFormatted,
      subTimerActive,
    });
  }, [broadcast, outputOpen, showEventInfoOnPrimary, displayTime, displayStatus, countdown.progress, countdown.remainingSeconds, displaySongTitle, displayArtist, displayNextTitle, displayIsEvent, displayXTime, displayIsMC, displayIsEncore, countdown.isCountUp, countdown.elapsedSeconds, displayMcTarget, subTimerTotal, subTimerRemaining, subTimerFormatted, subTimerActive]);

  const createSetlist = useCreateSetlist();
  const deleteSetlist = useDeleteSetlist();
  const updateSetlist = useUpdateSetlist();
  const addSong = useCreateSong();
  const updateSongMutation = useUpdateSong();
  const reorderSongs = useReorderSongs();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleNextTitleCommit = useCallback((_songIndex: number, _nextTitleValue: string | null) => {
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeSetlist) return;
    const oldIndex = sortedSongs.findIndex((s) => s.id === active.id);
    const newIndex = sortedSongs.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(sortedSongs, oldIndex, newIndex);
    reorderSongs.mutate({
      setlistId: activeSetlist.id,
      songIds: newOrder.map((s) => s.id),
    });
  }, [activeSetlist, sortedSongs, reorderSongs, updateSongMutation]);

  const [isDragOver, setIsDragOver] = useState(false);

  const processDroppedFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.name || !Array.isArray(data.songs)) {
        toast({ title: "Invalid file", variant: "destructive" });
        return;
      }
      if (!activeSetlist) return;
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
      await localDB.replaceSetlistSongs(activeSetlist.id, importName, songsData, {
        doorOpen: typeof data.doorOpen === "string" ? data.doorOpen : null,
        showTime: typeof data.showTime === "string" ? data.showTime : null,
        rehearsal: typeof data.rehearsal === "string" ? data.rehearsal : null,
      });
      queryClient.invalidateQueries({ queryKey: ["setlists"] });
      queryClient.invalidateQueries({ queryKey: ["songs", activeSetlist.id] });
      toast({ title: "Imported", description: `${importName} (${data.songs.length} songs)` });
    } catch {
      toast({ title: "Error", description: "Failed to read file", variant: "destructive" });
    }
  }, [toast, activeSetlist]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".json") || file.name.endsWith(".scd"))) {
      processDroppedFile(file);
    } else {
      toast({ title: "Invalid file", description: "Please drop a .json or .scd file", variant: "destructive" });
    }
  }, [processDroppedFile, toast]);

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const [concertName, setConcertName] = useState("");
  const [doorOpenValue, setDoorOpenValue] = useState("");
  const [showTimeValue, setShowTimeValue] = useState("");
  const [rehearsalValue, setRehearsalValue] = useState("");
  const concertNameFocusedRef = useRef(false);
  const doorOpenFocusedRef = useRef(false);
  const showTimeFocusedRef = useRef(false);
  const rehearsalFocusedRef = useRef(false);
  const imeDoorRef = useRef(false);
  const imeDoorTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const imeShowRef = useRef(false);
  const imeShowTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const imeRehearsalRef = useRef(false);
  const imeRehearsalTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (activeSetlist && !concertNameFocusedRef.current) {
      setConcertName(activeSetlist.name);
    }
    if (activeSetlist && !doorOpenFocusedRef.current) {
      setDoorOpenValue(activeSetlist.doorOpen || "");
    }
    if (activeSetlist && !showTimeFocusedRef.current) {
      setShowTimeValue(activeSetlist.showTime || "");
    }
    if (activeSetlist && !rehearsalFocusedRef.current) {
      setRehearsalValue(activeSetlist.rehearsal || "");
    }
  }, [activeSetlist?.id, activeSetlist?.name, activeSetlist?.doorOpen, activeSetlist?.showTime, activeSetlist?.rehearsal]);

  const commitConcertName = () => {
    concertNameFocusedRef.current = false;
    if (!activeSetlist) return;
    const trimmed = concertName.trim();
    if (trimmed && trimmed !== activeSetlist.name) {
      updateSetlist.mutate({ id: activeSetlist.id, data: { name: trimmed } });
    } else {
      setConcertName(activeSetlist.name);
    }
  };

  const commitDoorOpen = () => {
    doorOpenFocusedRef.current = false;
    if (!activeSetlist) return;
    const val = filterTimeInput(doorOpenValue).trim();
    setDoorOpenValue(val);
    if (val !== (activeSetlist.doorOpen || "")) {
      updateSetlist.mutate({ id: activeSetlist.id, data: { doorOpen: val || null } });
    }
  };

  const commitShowTime = () => {
    showTimeFocusedRef.current = false;
    if (!activeSetlist) return;
    const val = filterTimeInput(showTimeValue).trim();
    setShowTimeValue(val);
    if (val !== (activeSetlist.showTime || "")) {
      updateSetlist.mutate({ id: activeSetlist.id, data: { showTime: val || null } });
    }
  };

  const commitRehearsal = () => {
    rehearsalFocusedRef.current = false;
    if (!activeSetlist) return;
    const val = filterTimeInput(rehearsalValue).trim();
    setRehearsalValue(val);
    if (val !== (activeSetlist.rehearsal || "")) {
      updateSetlist.mutate({ id: activeSetlist.id, data: { rehearsal: val || null } });
    }
  };

  const manageScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingScrollIndexRef.current !== null && sortedSongs.length > 0) {
      const targetIndex = pendingScrollIndexRef.current;
      pendingScrollIndexRef.current = null;
      requestAnimationFrame(() => {
        const container = manageScrollRef.current;
        if (!container) return;
        const rows = container.querySelectorAll("[data-song-row]");
        const targetRow = rows[targetIndex] as HTMLElement | undefined;
        if (targetRow) {
          targetRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }
  }, [sortedSongs]);

  const handleAddSongAt = useCallback((afterIndex: number) => {
    if (!activeSetlist) return;
    pendingScrollIndexRef.current = afterIndex + 1;
    addSong.mutate({
      setlistId: activeSetlist.id,
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
      isEncore: false,
      subTimerSeconds: 0,
      subTimerTimeRange: null,
    });
  }, [activeSetlist, addSong]);

  const handleAddEventAt = useCallback((afterIndex: number) => {
    if (!activeSetlist) return;
    pendingScrollIndexRef.current = afterIndex + 1;
    addSong.mutate({
      setlistId: activeSetlist.id,
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
      isEncore: false,
      subTimerSeconds: 0,
      subTimerTimeRange: null,
    });
  }, [activeSetlist, addSong]);

  const handleAddMCAt = useCallback((afterIndex: number) => {
    if (!activeSetlist) return;
    pendingScrollIndexRef.current = afterIndex + 1;
    addSong.mutate({
      setlistId: activeSetlist.id,
      title: "MC",
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
      isEncore: false,
      subTimerSeconds: 0,
      subTimerTimeRange: null,
    });
  }, [activeSetlist, addSong]);

  const handleAddEncoreAt = useCallback((afterIndex: number) => {
    if (!activeSetlist) return;
    pendingScrollIndexRef.current = afterIndex + 1;
    addSong.mutate({
      setlistId: activeSetlist.id,
      title: "ENCORE",
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
      isEncore: true,
      subTimerSeconds: 0,
      subTimerTimeRange: null,
    });
  }, [activeSetlist, addSong]);

  const handleNewConcert = () => {
    createSetlist.mutate({ name: "New Concert", isActive: false }, {
      onSuccess: (newSetlist) => {
        setSelectedSetlistId(newSetlist.id);
      },
    });
  };

  const handleDeleteConcert = () => {
    if (!activeSetlist) return;
    deleteSetlist.mutate(activeSetlist.id, {
      onSuccess: () => {
        setSelectedSetlistId(null);
        toast({ title: "Deleted" });
      },
    });
  };

  const handleExport = useCallback(async () => {
    if (!activeSetlist) return;
    const data = {
      name: activeSetlist.name,
      description: activeSetlist.description,
      doorOpen: activeSetlist.doorOpen ?? null,
      showTime: activeSetlist.showTime ?? null,
      rehearsal: activeSetlist.rehearsal ?? null,
      songs: sortedSongs.map((s) => ({
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
      })),
    };
    const safeName = activeSetlist.name.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF _-]/g, "") || "setlist";
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

    const blob = new Blob([jsonStr], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.scd`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Saved", description: `${safeName}.scd` });
  }, [activeSetlist, sortedSongs, toast]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processDroppedFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processDroppedFile]);

  const currentSetlistIndex = setlists.findIndex((s) => s.id === activeSetlist?.id);

  const goToPrevSetlist = () => {
    if (currentSetlistIndex > 0) {
      setSelectedSetlistId(setlists[currentSetlistIndex - 1].id);
    }
  };

  const goToNextSetlist = () => {
    if (currentSetlistIndex < setlists.length - 1) {
      setSelectedSetlistId(setlists[currentSetlistIndex + 1].id);
    }
  };

  if (outputOpen) {
    return (
      <div className="flex flex-col h-full w-full bg-[#262624] overflow-hidden" data-testid="show-page">
        <div className="flex-1 min-h-0 overflow-hidden w-full">
          <PerformanceEditor
            songs={sortedSongs}
            setlist={activeSetlist || null}
            currentSongIndex={currentSongIndex}
            formattedTime={displayTime}
            status={displayStatus}
            progress={countdown.progress}
            songTitle={displaySongTitle}
            nextSongTitle={displayNextTitle}
            remainingSeconds={countdown.remainingSeconds}
            countdownStatus={countdown.status}
            onPause={countdown.pause}
            onResume={countdown.resume}
            onStop={stopSong}
            onNext={nextSong}
            onStartSong={startSong}
            isMC={displayIsMC}
            isEncore={displayIsEncore}
            isCountUp={countdown.isCountUp}
            elapsedSeconds={countdown.elapsedSeconds}
            onLiveTitleChange={(songId, title, nextTitle) => setLiveTitleOverrides({ songId, title, nextTitle })}
            onLiveDurationChange={(songId, dur) => {
              if (dur !== null && dur > 0) {
                setLiveDurationOverride({ songId, durationSeconds: dur });
              } else {
                setLiveDurationOverride(null);
              }
            }}
            hasNextSong={hasNextSong}
            isIdle={isIdle}
            isEvent={displayIsEvent}
            xTime={displayXTime}
            lastMidiMessage={midi.lastMessage}
            onShowEventInfoChange={setShowEventInfoOnPrimary}
            stopEventInfoRef={stopEventInfoRef}
            subTimerFormatted={subTimerFormatted}
            subTimerRemaining={subTimerRemaining}
            subTimerSeconds={subTimerTotal}
            subTimerActive={subTimerActive}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col relative pt-[4.5rem]"
      style={{
        fontFamily: UI_FONT,
        background: "linear-gradient(180deg, #141418 0%, #101014 50%, #141418 100%)",
      }}
      onDrop={handleFileDrop}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      data-testid="manage-page"
    >
      {/* Logo - fixed top left */}
      <button
        className="fixed top-3 left-4 z-50 flex items-center gap-3 transition-all duration-200 hover:opacity-80"
        style={{ background: "none", border: "none", cursor: "pointer" }}
        onClick={() => navigate("/")}
        title="ホーム"
        data-testid="button-home"
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 7,
            background: "linear-gradient(160deg, #b06ae6 0%, #8b3fd4 50%, #7232b8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontFamily: "'Inter', sans-serif", fontWeight: 700, color: "#1a1a1a", lineHeight: 1 }}>CD</span>
        </div>
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "rgba(168,85,247,0.95)", fontFamily: "'Inter', sans-serif", letterSpacing: "0.04em" }}>COUNT DOWN STUDIO</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'Inter', sans-serif", letterSpacing: "0.15em", marginTop: 2 }}>CONCERT COUNTDOWN TIMER</div>
        </div>
      </button>
      {isDragOver && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{
            background: "rgba(6,182,212,0.08)",
            border: "3px dashed rgba(6,182,212,0.5)",
            borderRadius: "12px",
          }}
        >
          <div
            className="text-cyan-400 text-lg font-bold tracking-wider uppercase"
            style={{ textShadow: "0 0 20px rgba(6,182,212,0.6)" }}
          >
            Drop to Import
          </div>
        </div>
      )}
      {/* Sticky header zone */}
      <div className="shrink-0">
        {/* Header */}
        <header
          className="px-3 py-2"
          style={{
            borderBottom: "1px solid rgba(232,121,249,0.15)",
            background: "linear-gradient(180deg, rgba(232,121,249,0.06) 0%, transparent 100%)",
          }}
        >
          <div className="flex items-center gap-1.5 flex-wrap max-w-7xl mx-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept=".scd,.json,application/json"
              onChange={handleImport}
              className="hidden"
              data-testid="input-import-file"
            />
            <button
              className="flex items-center justify-center gap-1.5 rounded-md text-white/70 font-semibold uppercase transition-all duration-200 hover:text-white/90"
              style={{
                fontFamily: HEADER_FONT,
                fontSize: "15px",
                letterSpacing: "0.12em",
                background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(8px)",
                width: "96px",
                height: "32px",
              }}
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-import-setlist"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              Import
            </button>
            <button
              className="flex items-center justify-center gap-1.5 rounded-md text-white/70 font-semibold uppercase transition-all duration-200 hover:text-white/90 disabled:opacity-30 disabled:hover:text-white/70"
              style={{
                fontFamily: HEADER_FONT,
                fontSize: "15px",
                letterSpacing: "0.12em",
                background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(8px)",
                width: "96px",
                height: "32px",
              }}
              onClick={handleExport}
              disabled={!activeSetlist || sortedSongs.length === 0}
              data-testid="button-export-setlist"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              Export
            </button>
            {setlists.length > 0 && (
              <>
                <button
                  className="flex items-center justify-center gap-1.5 rounded-md text-emerald-400/80 font-semibold uppercase transition-all duration-200 hover:text-emerald-300"
                  style={{
                    fontFamily: HEADER_FONT,
                    fontSize: "15px",
                    letterSpacing: "0.12em",
                    background: "linear-gradient(180deg, rgba(52,211,153,0.1) 0%, rgba(52,211,153,0.04) 100%)",
                    border: "1px solid rgba(52,211,153,0.2)",
                    width: "96px",
                    height: "32px",
                  }}
                  onClick={handleNewConcert}
                  data-testid="button-new-concert"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  New
                </button>
                <button
                  className="flex items-center justify-center gap-1.5 rounded-md text-red-400/80 font-semibold uppercase transition-all duration-200 hover:text-red-300"
                  style={{
                    fontFamily: HEADER_FONT,
                    fontSize: "15px",
                    letterSpacing: "0.12em",
                    background: "linear-gradient(180deg, rgba(248,113,113,0.1) 0%, rgba(248,113,113,0.04) 100%)",
                    border: "1px solid rgba(248,113,113,0.2)",
                    width: "96px",
                    height: "32px",
                  }}
                  onClick={handleDeleteConcert}
                  data-testid="button-delete-concert"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  Delete
                </button>
              </>
            )}
            <div className="ml-auto">
              <MidiNoteIndicator lastMessage={midi.lastMessage} />
            </div>
          </div>
        </header>

        {!loadingSetlists && setlists.length > 0 && (
          <div className="max-w-7xl mx-auto px-3 pt-4 pb-0">
            {/* Concert navigation */}
            <div className="flex items-center gap-2 mb-3">
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 transition-all duration-200 disabled:opacity-20"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                disabled={currentSetlistIndex <= 0}
                onClick={goToPrevSetlist}
                data-testid="button-prev-setlist"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-white/30 tabular-nums" style={{ fontFamily: UI_FONT }}>
                {currentSetlistIndex + 1} / {setlists.length}
              </span>
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 transition-all duration-200 disabled:opacity-20"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                disabled={currentSetlistIndex >= setlists.length - 1}
                onClick={goToNextSetlist}
                data-testid="button-next-setlist"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Label row */}
            <div className="flex items-baseline gap-3 mb-3">
              <span
                className="flex-1 min-w-0 text-[15px] uppercase leading-none"
                style={{ fontFamily: HEADER_FONT, letterSpacing: "0.12em", color: "rgba(232,121,249,0.7)", textShadow: "0 0 8px rgba(232,121,249,0.2)" }}
              >
                Concert Title
              </span>
              <span className="text-[15px] uppercase leading-none text-center whitespace-nowrap" style={{ fontFamily: HEADER_FONT, letterSpacing: "0.12em", color: "rgba(74,222,128,0.6)", width: "90px", minWidth: "90px" }}>REHEARSAL</span>
              <span className="text-[15px] uppercase leading-none text-center whitespace-nowrap" style={{ fontFamily: HEADER_FONT, letterSpacing: "0.12em", color: "rgba(250,204,21,0.6)", width: "90px", minWidth: "90px" }}>DOOR OPEN</span>
              <span className="text-[15px] uppercase leading-none text-center whitespace-nowrap" style={{ fontFamily: HEADER_FONT, letterSpacing: "0.12em", color: "rgba(6,182,212,0.6)", width: "90px", minWidth: "90px" }}>SHOW TIME</span>
            </div>

            {/* Input row - all same height */}
            <div className="flex items-center gap-3 mb-6">
              <input
                type="text"
                value={concertName}
                onChange={(e) => setConcertName(e.target.value)}
                onBlur={commitConcertName}
                onCompositionStart={concertIME.onCompositionStart}
                onCompositionEnd={concertIME.onCompositionEnd}
                onKeyDown={(e) => { if (concertIME.isIME(e)) return; if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="flex-1 min-w-0 h-12 text-lg font-bold px-4 rounded-md text-white focus:outline-none transition-all duration-200 placeholder:text-white/20"
                style={{
                  fontFamily: UI_FONT,
                  border: INPUT_STYLES.border,
                  background: INPUT_STYLES.background,
                }}
                onFocus={(e) => {
                  concertNameFocusedRef.current = true;
                  e.currentTarget.style.borderColor = ACCENT_COLORS.fuchsia;
                  e.currentTarget.style.boxShadow = INPUT_STYLES.glowFocused(ACCENT_COLORS.fuchsia);
                }}
                onBlurCapture={(e) => {
                  e.currentTarget.style.borderColor = INPUT_STYLES.borderBlur;
                  e.currentTarget.style.boxShadow = "none";
                }}
                placeholder="Concert Title"
                data-testid="input-concert-name"
              />
              <input
                type="text"
                className="h-12 text-sm px-3 rounded-md text-white text-center focus:outline-none transition-all duration-200 placeholder:text-white/20"
                style={{ fontFamily: UI_FONT, width: "90px", minWidth: "90px", border: INPUT_STYLES.border, background: INPUT_STYLES.background }}
                value={rehearsalValue}
                onChange={(e) => { setRehearsalValue(imeRehearsalRef.current ? e.target.value : filterTimeInput(e.target.value)); }}
                onCompositionStart={() => { imeRehearsalRef.current = true; clearTimeout(imeRehearsalTimerRef.current); }}
                onCompositionEnd={(e) => { clearTimeout(imeRehearsalTimerRef.current); imeRehearsalTimerRef.current = setTimeout(() => { imeRehearsalRef.current = false; }, 300); setRehearsalValue(filterTimeInput((e.target as HTMLInputElement).value)); }}
                onFocus={(e) => { rehearsalFocusedRef.current = true; e.currentTarget.style.borderColor = ACCENT_COLORS.fuchsia; e.currentTarget.style.boxShadow = INPUT_STYLES.glowFocused(ACCENT_COLORS.fuchsia); }}
                onBlur={commitRehearsal}
                onBlurCapture={(e) => { e.currentTarget.style.borderColor = INPUT_STYLES.borderBlur; e.currentTarget.style.boxShadow = "none"; }}
                onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229 || imeRehearsalRef.current) return; if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder="00:00"
                inputMode="numeric"
                data-testid="manage-input-rehearsal"
              />
              <input
                type="text"
                className="h-12 text-sm px-3 rounded-md text-white text-center focus:outline-none transition-all duration-200 placeholder:text-white/20"
                style={{ fontFamily: UI_FONT, width: "90px", minWidth: "90px", border: INPUT_STYLES.border, background: INPUT_STYLES.background }}
                value={doorOpenValue}
                onChange={(e) => { setDoorOpenValue(imeDoorRef.current ? e.target.value : filterTimeInput(e.target.value)); }}
                onCompositionStart={() => { imeDoorRef.current = true; clearTimeout(imeDoorTimerRef.current); }}
                onCompositionEnd={(e) => { clearTimeout(imeDoorTimerRef.current); imeDoorTimerRef.current = setTimeout(() => { imeDoorRef.current = false; }, 300); setDoorOpenValue(filterTimeInput((e.target as HTMLInputElement).value)); }}
                onFocus={(e) => { doorOpenFocusedRef.current = true; e.currentTarget.style.borderColor = ACCENT_COLORS.fuchsia; e.currentTarget.style.boxShadow = INPUT_STYLES.glowFocused(ACCENT_COLORS.fuchsia); }}
                onBlur={commitDoorOpen}
                onBlurCapture={(e) => { e.currentTarget.style.borderColor = INPUT_STYLES.borderBlur; e.currentTarget.style.boxShadow = "none"; }}
                onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229 || imeDoorRef.current) return; if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder="00:00"
                inputMode="numeric"
                data-testid="manage-input-door-open"
              />
              <input
                type="text"
                className="h-12 text-sm px-3 rounded-md text-white text-center focus:outline-none transition-all duration-200 placeholder:text-white/20"
                style={{ fontFamily: UI_FONT, width: "90px", minWidth: "90px", border: INPUT_STYLES.border, background: INPUT_STYLES.background }}
                value={showTimeValue}
                onChange={(e) => { setShowTimeValue(imeShowRef.current ? e.target.value : filterTimeInput(e.target.value)); }}
                onCompositionStart={() => { imeShowRef.current = true; clearTimeout(imeShowTimerRef.current); }}
                onCompositionEnd={(e) => { clearTimeout(imeShowTimerRef.current); imeShowTimerRef.current = setTimeout(() => { imeShowRef.current = false; }, 300); setShowTimeValue(filterTimeInput((e.target as HTMLInputElement).value)); }}
                onFocus={(e) => { showTimeFocusedRef.current = true; e.currentTarget.style.borderColor = ACCENT_COLORS.fuchsia; e.currentTarget.style.boxShadow = INPUT_STYLES.glowFocused(ACCENT_COLORS.fuchsia); }}
                onBlur={commitShowTime}
                onBlurCapture={(e) => { e.currentTarget.style.borderColor = INPUT_STYLES.borderBlur; e.currentTarget.style.boxShadow = "none"; }}
                onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229 || imeShowRef.current) return; if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder="00:00"
                inputMode="numeric"
                data-testid="manage-input-show-time"
              />
            </div>

            {!useCardLayout && (
              <SongTableHeader showMidiColumn />
            )}
          </div>
        )}
      </div>

      <div ref={manageScrollRef} className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-7xl mx-auto px-3 py-4">
        {loadingSetlists ? (
          <div className="text-center text-white/30 py-12" style={{ fontFamily: UI_FONT }}>Loading...</div>
        ) : setlists.length === 0 ? (
          <div className="text-center py-16">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{
                background: "rgba(232,121,249,0.08)",
                border: "1px solid rgba(232,121,249,0.2)",
              }}
            >
              <Music className="w-7 h-7 text-fuchsia-400/50" />
            </div>
            <p className="text-white/30 mb-4" style={{ fontFamily: UI_FONT }}>No concerts yet</p>
            <button
              onClick={handleNewConcert}
              className="flex items-center gap-1.5 mx-auto px-4 py-2 rounded-full text-fuchsia-300 text-sm font-medium tracking-wider uppercase transition-all duration-300"
              style={{
                background: "rgba(232,121,249,0.12)",
                border: "1px solid rgba(232,121,249,0.3)",
                boxShadow: "0 0 15px rgba(232,121,249,0.1)",
              }}
              data-testid="button-new-concert-empty"
            >
              <Plus className="w-4 h-4" />
              New Concert
            </button>
          </div>
        ) : (
          <>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortedSongs.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  className="mb-4"
                  data-testid="song-list"
                >
                  {(() => {
                    let songNum = 0;
                    return sortedSongs.map((song, index) => {
                      if (!song.isEvent && !song.isMC && !song.isEncore) songNum++;
                      return useCardLayout ? (
                        <MobileSongCard
                          key={song.id}
                          song={song}
                          index={index}
                          songNumber={songNum}
                          setlistId={activeSetlist!.id}
                          isLast={index === sortedSongs.length - 1}
                          onNextTitleCommit={handleNextTitleCommit}
                        />
                      ) : (
                        <SongRow
                          key={song.id}
                          song={song}
                          index={index}
                          songNumber={songNum}
                          setlistId={activeSetlist!.id}
                          isLast={index === sortedSongs.length - 1}
                          onNextTitleCommit={handleNextTitleCommit}
                          showMidiColumn
                          testIdPrefix="row"
                        />
                      );
                    });
                  })()}
                  <InsertionRow
                    onAddSong={() => handleAddSongAt(sortedSongs.length)}
                    onAddSpecial={() => handleAddEventAt(sortedSongs.length)}
                    onAddMC={() => handleAddMCAt(sortedSongs.length)}
                    onAddEncore={() => handleAddEncoreAt(sortedSongs.length)}
                    disabled={!activeSetlist}
                    testIdPrefix="manage-bottom"
                  />
                  <div style={{ minHeight: "50vh" }} />
                </div>
              </SortableContext>
            </DndContext>

            {/* Summary */}
            <div className="mt-4 text-xs text-white/20 text-right" style={{ fontFamily: UI_FONT }}>
              {sortedSongs.length} songs / {formatDuration(sortedSongs.reduce((a, s) => a + s.durationSeconds, 0))} total
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
