import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { type LocalSong as Song, type LocalSetlist as Setlist, localDB } from "@/lib/local-db";
import {
  useCreateSong,
  useUpdateSong,
  useReorderSongs,
  useUpdateSetlist,
} from "@/hooks/use-local-data";
import { Play, Pause, Square, SkipForward, Download, Upload, Info } from "lucide-react";
import { MidiNoteIndicator } from "@/components/midi-note-indicator";
import { type MidiMessage } from "@/hooks/use-midi";
import { MidiLogMonitor } from "./midi-log-monitor";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CountdownDisplay } from "./countdown-display";
import { EventInfoDisplay } from "./event-info-display";
import { type CountdownStatus } from "@/hooks/use-countdown";
import {
  UI_FONT,
  MONO_FONT,
  HEADER_FONT,
  formatDuration,
  filterTimeInput,
} from "@/lib/time-utils";
import { useAppMode } from "@/hooks/use-app-mode";
import { SongRow, SongTableHeader, AddSongButton, AddSpecialButton, AddMCButton, AddEncoreButton, InsertionRow } from "@/components/song-row";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ==================================================================
// LiveMidiBigDisplay: prominent MIDI signal readout below the countdown
// preview. Scales up the MidiNoteIndicator so it reads from across the room.
// ==================================================================
function LiveMidiBigDisplay({ lastMessage }: { lastMessage: MidiMessage | null }) {
  return (
    <div
      className="flex items-center justify-center w-full"
      style={{
        minHeight: 84,
        padding: "12px 16px",
        borderRadius: 12,
        border: "1px solid #2a231e",
        background: "#221d18",
      }}
      data-testid="live-midi-big-display"
    >
      {lastMessage ? (
        <div style={{ transform: "scale(2.4)", transformOrigin: "center" }}>
          <MidiNoteIndicator lastMessage={lastMessage} />
        </div>
      ) : (
        <div
          style={{
            fontFamily: "'JetBrains Mono', 'Menlo', monospace",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: "#5a5a54",
            textTransform: "uppercase",
          }}
        >
          MIDI signal will appear here
        </div>
      )}
    </div>
  );
}

interface PerformanceEditorProps {
  songs: Song[];
  setlist: Setlist | null;
  currentSongIndex: number;
  formattedTime: string;
  status: CountdownStatus | "preview";
  progress: number;
  songTitle?: string;
  nextSongTitle?: string;
  remainingSeconds: number;
  countdownStatus: CountdownStatus;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onNext: () => void;
  onStartSong: (index: number) => void;
  isMC?: boolean;
  isEncore?: boolean;
  isCountUp?: boolean;
  elapsedSeconds?: number;
  mcTargetSeconds?: number;
  onLiveTitleChange?: (songId: number, title: string, nextTitle: string) => void;
  onLiveDurationChange?: (songId: number, durationSeconds: number | null) => void;
  hasNextSong: boolean;
  isIdle: boolean;
  isEvent?: boolean;
  xTime?: boolean;
  lastMidiMessage?: MidiMessage | null;
  onShowEventInfoChange?: (showing: boolean) => void;
  stopEventInfoRef?: React.MutableRefObject<(() => void) | null>;
  subTimerFormatted?: string;
  subTimerRemaining?: number;
  subTimerSeconds?: number;
  subTimerActive?: boolean;
}

export function PerformanceEditor({
  songs,
  setlist,
  currentSongIndex,
  formattedTime,
  status,
  progress,
  songTitle,
  nextSongTitle,
  remainingSeconds,
  countdownStatus,
  onPause,
  onResume,
  onStop,
  onNext,
  onStartSong,
  isMC,
  isEncore,
  isCountUp,
  elapsedSeconds,
  mcTargetSeconds,
  onLiveTitleChange,
  onLiveDurationChange,
  hasNextSong,
  isIdle,
  isEvent,
  xTime,
  lastMidiMessage,
  onShowEventInfoChange,
  stopEventInfoRef,
  subTimerFormatted,
  subTimerRemaining,
  subTimerSeconds: subTimerSecondsProp,
  subTimerActive,
}: PerformanceEditorProps) {
  const addSong = useCreateSong();
  const reorderSongs = useReorderSongs();
  const updateSetlist = useUpdateSetlist();
  const updateSong = useUpdateSong();
  const { toast } = useToast();
  const { broadcast, outputOpen } = useAppMode();
  const [, navigate] = useLocation();
  const [showingEventInfo, setShowingEventInfo] = useState(false);
  const eventInfoIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const showingEventInfoRef = useRef(false);
  const screensaverTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const screensaverActiveRef = useRef(false);
  const SCREENSAVER_TIMEOUT = 10 * 60 * 1000;

  const stopEventInfoBroadcast = useCallback(() => {
    showingEventInfoRef.current = false;
    setShowingEventInfo(false);
    onShowEventInfoChange?.(false);
    clearInterval(eventInfoIntervalRef.current);
    broadcast({
      formattedTime: "--:--",
      status: "idle",
      progress: 0,
      remainingSeconds: 0,
      showEventInfo: false,
    });
  }, [broadcast, onShowEventInfoChange]);

  const startEventInfoBroadcast = useCallback(() => {
    showingEventInfoRef.current = true;
    setShowingEventInfo(true);
    onShowEventInfoChange?.(true);
    const sendInfo = () => {
      broadcast({
        formattedTime: "--:--",
        status: "idle",
        progress: 0,
        remainingSeconds: 0,
        showEventInfo: true,
        eventConcertTitle: setlistNameValueRef.current || "",
        eventDoorOpen: doorOpenValueRef.current || null,
        eventShowTime: showTimeValueRef.current || null,
        eventRehearsal: rehearsalValueRef.current || null,
      });
    };
    sendInfo();
    clearInterval(eventInfoIntervalRef.current);
    eventInfoIntervalRef.current = setInterval(sendInfo, 1000);
  }, [broadcast]);

  const toggleEventInfo = useCallback(() => {
    screensaverActiveRef.current = false;
    if (showingEventInfo) {
      stopEventInfoBroadcast();
    } else {
      startEventInfoBroadcast();
    }
  }, [showingEventInfo, stopEventInfoBroadcast, startEventInfoBroadcast]);

  const startEventInfoBroadcastRef = useRef(startEventInfoBroadcast);
  const stopEventInfoBroadcastRef = useRef(stopEventInfoBroadcast);
  useEffect(() => { startEventInfoBroadcastRef.current = startEventInfoBroadcast; }, [startEventInfoBroadcast]);
  useEffect(() => { stopEventInfoBroadcastRef.current = stopEventInfoBroadcast; }, [stopEventInfoBroadcast]);

  const resetScreensaverTimer = useCallback(() => {
    clearTimeout(screensaverTimerRef.current);
    if (!outputOpen) return;
    screensaverTimerRef.current = setTimeout(() => {
      if (!showingEventInfoRef.current) {
        screensaverActiveRef.current = true;
        startEventInfoBroadcastRef.current();
      }
    }, SCREENSAVER_TIMEOUT);
  }, [outputOpen]);

  useEffect(() => {
    if (!outputOpen) {
      clearTimeout(screensaverTimerRef.current);
      screensaverActiveRef.current = false;
      return;
    }
    const handler = () => {
      if (screensaverActiveRef.current) {
        screensaverActiveRef.current = false;
        stopEventInfoBroadcastRef.current();
      }
      resetScreensaverTimer();
    };
    window.addEventListener("mousemove", handler);
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", handler);
    window.addEventListener("touchstart", handler);
    resetScreensaverTimer();
    return () => {
      window.removeEventListener("mousemove", handler);
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("touchstart", handler);
      clearTimeout(screensaverTimerRef.current);
    };
  }, [outputOpen, resetScreensaverTimer]);

  useEffect(() => {
    if (lastMidiMessage && outputOpen) {
      if (screensaverActiveRef.current) {
        screensaverActiveRef.current = false;
        stopEventInfoBroadcastRef.current();
      }
      resetScreensaverTimer();
    }
  }, [lastMidiMessage, outputOpen, resetScreensaverTimer]);

  useEffect(() => {
    if (!outputOpen && showingEventInfoRef.current) {
      clearInterval(eventInfoIntervalRef.current);
      showingEventInfoRef.current = false;
      setShowingEventInfo(false);
      onShowEventInfoChange?.(false);
    }
  }, [outputOpen, onShowEventInfoChange]);

  useEffect(() => {
    if (stopEventInfoRef) stopEventInfoRef.current = stopEventInfoBroadcast;
  }, [stopEventInfoRef, stopEventInfoBroadcast]);

  useEffect(() => {
    return () => { clearInterval(eventInfoIntervalRef.current); };
  }, []);

  const handleNextTitleCommit = useCallback((_songIndex: number, _nextTitleValue: string | null) => {
  }, []);

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImportFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.songs || !Array.isArray(data.songs)) {
        toast({ title: "Invalid file", variant: "destructive" });
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
      toast({ title: "Import failed", variant: "destructive" });
    }
  }, [setlist, toast]);

  const handleImportInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImportFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processImportFile]);

  const handleEditorDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".json") || file.name.endsWith(".scd"))) {
      processImportFile(file);
    } else if (file) {
      toast({ title: "Invalid file", description: ".json or .scd only", variant: "destructive" });
    }
  }, [processImportFile, toast]);

  const handleEditorDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const [setlistNameValue, setSetlistNameValue] = useState(setlist?.name || "");
  const [doorOpenValue, setDoorOpenValue] = useState(setlist?.doorOpen || "");
  const [showTimeValue, setShowTimeValue] = useState(setlist?.showTime || "");
  const [rehearsalValue, setRehearsalValue] = useState(setlist?.rehearsal || "");
  const setlistNameValueRef = useRef(setlistNameValue);
  const doorOpenValueRef = useRef(doorOpenValue);
  const showTimeValueRef = useRef(showTimeValue);
  const rehearsalValueRef = useRef(rehearsalValue);
  useEffect(() => { setlistNameValueRef.current = setlistNameValue; }, [setlistNameValue]);
  useEffect(() => { doorOpenValueRef.current = doorOpenValue; }, [doorOpenValue]);
  useEffect(() => { showTimeValueRef.current = showTimeValue; }, [showTimeValue]);
  useEffect(() => { rehearsalValueRef.current = rehearsalValue; }, [rehearsalValue]);
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

  useEffect(() => {
    if (setlist && !setlistNameFocusedRef.current) setSetlistNameValue(setlist.name);
    if (setlist && !doorOpenFocusedRef.current) setDoorOpenValue(setlist.doorOpen || "");
    if (setlist && !showTimeFocusedRef.current) setShowTimeValue(setlist.showTime || "");
    if (setlist && !rehearsalFocusedRef.current) setRehearsalValue(setlist.rehearsal || "");
  }, [setlist?.id, setlist?.name, setlist?.doorOpen, setlist?.showTime, setlist?.rehearsal]);

  useEffect(() => {
    if (showingEventInfoRef.current) {
      clearInterval(eventInfoIntervalRef.current);
      const sendInfo = () => {
        broadcast({
          formattedTime: "--:--",
          status: "idle",
          progress: 0,
          remainingSeconds: 0,
          showEventInfo: true,
          eventConcertTitle: setlistNameValueRef.current || "",
          eventDoorOpen: doorOpenValueRef.current || null,
          eventShowTime: showTimeValueRef.current || null,
          eventRehearsal: rehearsalValueRef.current || null,
        });
      };
      sendInfo();
      eventInfoIntervalRef.current = setInterval(sendInfo, 1000);
    }
  }, [setlistNameValue, doorOpenValue, showTimeValue, rehearsalValue, broadcast]);

  const commitSetlistName = () => {
    setlistNameFocusedRef.current = false;
    if (!setlist) return;
    const trimmed = setlistNameValue.trim();
    if (trimmed && trimmed !== setlist.name) {
      updateSetlist.mutate({ id: setlist.id, data: { name: trimmed } });
    } else {
      setSetlistNameValue(setlist.name);
    }
  };

  const commitDoorOpen = () => {
    doorOpenFocusedRef.current = false;
    if (!setlist) return;
    const val = filterTimeInput(doorOpenValue).trim();
    setDoorOpenValue(val);
    if (val !== (setlist.doorOpen || "")) {
      updateSetlist.mutate({ id: setlist.id, data: { doorOpen: val || null } });
    }
  };

  const commitShowTime = () => {
    showTimeFocusedRef.current = false;
    if (!setlist) return;
    const val = filterTimeInput(showTimeValue).trim();
    setShowTimeValue(val);
    if (val !== (setlist.showTime || "")) {
      updateSetlist.mutate({ id: setlist.id, data: { showTime: val || null } });
    }
  };

  const commitRehearsal = () => {
    rehearsalFocusedRef.current = false;
    if (!setlist) return;
    const val = filterTimeInput(rehearsalValue).trim();
    setRehearsalValue(val);
    if (val !== (setlist.rehearsal || "")) {
      updateSetlist.mutate({ id: setlist.id, data: { rehearsal: val || null } });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !setlist) return;
    const oldIndex = songs.findIndex((s) => s.id === active.id);
    const newIndex = songs.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(songs, oldIndex, newIndex);
    reorderSongs.mutate({
      setlistId: setlist.id,
      songIds: newOrder.map((s) => s.id),
    }, {
      onSuccess: () => {
        for (let i = 1; i < newOrder.length; i++) {
          const prev = newOrder[i - 1];
          if (prev.nextTitle) {
            updateSong.mutate({ id: newOrder[i].id, data: { title: prev.nextTitle }, setlistId: setlist.id });
          }
        }
      },
    });
  }, [setlist, songs, reorderSongs, updateSong]);

  const editorScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingScrollIndexRef.current !== null && songs.length > 0) {
      const targetIndex = pendingScrollIndexRef.current;
      pendingScrollIndexRef.current = null;
      requestAnimationFrame(() => {
        const container = editorScrollRef.current;
        if (!container) return;
        const rows = container.querySelectorAll("[data-song-row]");
        const targetRow = rows[targetIndex] as HTMLElement | undefined;
        if (targetRow) {
          targetRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }
  }, [songs]);

  const handleAddSongAt = useCallback((afterIndex: number) => {
    if (!setlist) return;
    const orderIndex = afterIndex + 1;
    pendingScrollIndexRef.current = orderIndex;
    addSong.mutate({
      setlistId: setlist.id,
      title: "",
      nextTitle: null,
      artist: null,
      durationSeconds: 0,
      orderIndex,
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
  }, [setlist, addSong]);

  const handleAddEventAt = useCallback((afterIndex: number) => {
    if (!setlist) return;
    const orderIndex = afterIndex + 1;
    pendingScrollIndexRef.current = orderIndex;
    addSong.mutate({
      setlistId: setlist.id,
      title: "",
      nextTitle: null,
      artist: null,
      durationSeconds: 0,
      orderIndex,
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
  }, [setlist, addSong]);

  const handleAddMCAt = useCallback((afterIndex: number) => {
    if (!setlist) return;
    const orderIndex = afterIndex + 1;
    pendingScrollIndexRef.current = orderIndex;
    addSong.mutate({
      setlistId: setlist.id,
      title: "MC",
      nextTitle: null,
      artist: null,
      durationSeconds: 0,
      orderIndex,
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
  }, [setlist, addSong]);

  const handleAddEncoreAt = useCallback((afterIndex: number) => {
    if (!setlist) return;
    const orderIndex = afterIndex + 1;
    pendingScrollIndexRef.current = orderIndex;
    addSong.mutate({
      setlistId: setlist.id,
      title: "ENCORE",
      nextTitle: null,
      artist: null,
      durationSeconds: 0,
      orderIndex,
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
  }, [setlist, addSong]);

  const ctrlBtnClass = "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all duration-200";

  return (
    <div className="flex flex-col h-full w-full" style={{
      background: "#181411",
      backgroundImage:
        "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(193,134,200,0.08), transparent 60%), radial-gradient(ellipse 80% 60% at 50% 100%, rgba(60,40,70,0.1), transparent 60%)",
    }} data-testid="performance-editor">
      {/* ===== FULL-WIDTH TOP STRIP: CD logo + wordmark (left) / SAVE + IMPORT (right) ===== */}
      <div
        className="shrink-0 flex items-center justify-between px-4 w-full"
        style={{
          background: "#181411",
          height: 56,
        }}
      >
        <button
          className="flex items-center gap-3 transition-opacity duration-150 hover:opacity-80"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
          onClick={() => navigate("/")}
          title="ホームに戻る"
          data-testid="button-home-show"
        >
          {/* Solid fuchsia logo square (PROMPTER-style, no glow) */}
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: "#c186c8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 14, fontFamily: "'Helvetica Neue','Inter',sans-serif", fontWeight: 900, color: "#0a0a08", lineHeight: 1, letterSpacing: "-0.03em" }}>CD</span>
          </div>
          {/* Wordmark: **COUNT DOWN** STUDIO */}
          <div style={{ lineHeight: 1, textAlign: "left" }}>
            <div style={{ fontSize: 14, fontFamily: "'Helvetica Neue','Inter',sans-serif", letterSpacing: "0.03em", color: "#e8e8e2" }}>
              <b style={{ fontWeight: 800, color: "#c186c8" }}>COUNT DOWN</b>
              <span style={{ fontWeight: 300, marginLeft: 6 }}>STUDIO</span>
            </div>
            <div style={{ fontSize: 9, color: "#76766f", letterSpacing: "0.22em", marginTop: 3, fontWeight: 700, textTransform: "uppercase" }}>
              Concert Countdown Timer
            </div>
          </div>
        </button>

        {/* Right side: SAVE + IMPORT shortcut buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-colors duration-150"
            style={{ color: "#a8a8a0", background: "#1e1814", border: "1px solid #322a24" }}
            data-testid="editor-button-save-top"
            title="Save setlist"
          >
            <Download className="w-3.5 h-3.5" /> Save
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-colors duration-150"
            style={{ color: "#a8a8a0", background: "#1e1814", border: "1px solid #322a24" }}
            data-testid="editor-button-import-top"
            title="Import setlist"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.scd"
            className="hidden"
            onChange={handleImportInput}
            data-testid="editor-file-input"
          />
        </div>
      </div>

      {/* ===== FULL-WIDTH SECOND STRIP: Concert Title + REHEARSAL / DOOR OPEN / SHOW TIME =====
          Spans entire width so the concert schedule lives at the top, unified across L/R. */}
      <div
        className="shrink-0 w-full px-4 pt-2 pb-3"
        style={{
          background: "#181411",
        }}
      >
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-9 shrink-0" />
          <span className="flex-1 text-[11px] uppercase font-bold"
            style={{ fontFamily: UI_FONT, letterSpacing: "0.15em", color: "#c186c8" }}
          >Concert Title</span>
          <span className="text-[11px] uppercase font-bold text-center"
            style={{ fontFamily: UI_FONT, letterSpacing: "0.15em", color: "#a8a8a0", width: "72px", minWidth: "72px" }}
          >REHEARSAL</span>
          <span className="text-[11px] uppercase font-bold text-center"
            style={{ fontFamily: UI_FONT, letterSpacing: "0.15em", color: "#a8a8a0", width: "72px", minWidth: "72px" }}
          >DOOR OPEN</span>
          <span className="text-[11px] uppercase font-bold text-center"
            style={{ fontFamily: UI_FONT, letterSpacing: "0.15em", color: "#a8a8a0", width: "72px", minWidth: "72px" }}
          >SHOW TIME</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleEventInfo}
            disabled={!outputOpen}
            className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center transition-colors duration-150"
            style={{
              background: showingEventInfo ? "#c186c8" : "#1e1814",
              border: showingEventInfo ? "1px solid #c186c8" : "1px solid #322a24",
              opacity: outputOpen ? 1 : 0.35,
              cursor: outputOpen ? "pointer" : "not-allowed",
            }}
            title={outputOpen ? (showingEventInfo ? "Hide event info on output" : "Show event info on output") : "Open output window first"}
            data-testid="button-toggle-event-info-top"
          >
            <Info className="w-4 h-4" style={{ color: showingEventInfo ? "#0a0a08" : "#a8a8a0" }} />
          </button>
          <input
            type="text"
            className="flex-1 min-w-0 h-9 text-sm rounded-lg px-3 font-semibold placeholder:text-[#76766f] focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50 transition-all duration-150"
            style={{ background: "#1e1814", border: "1px solid #322a24", color: "#e8e8e2", fontFamily: UI_FONT }}
            value={setlistNameValue}
            onChange={(e) => { if (setlist) setSetlistNameValue(e.target.value); }}
            onFocus={() => { setlistNameFocusedRef.current = true; }}
            onCompositionStart={() => { imeSetlistRef.current = true; clearTimeout(imeSetlistTimerRef.current); }}
            onCompositionEnd={() => { clearTimeout(imeSetlistTimerRef.current); imeSetlistTimerRef.current = setTimeout(() => { imeSetlistRef.current = false; }, 300); }}
            onBlur={commitSetlistName}
            onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229 || imeSetlistRef.current) return; if (e.key === "Enter") { e.preventDefault(); commitSetlistName(); } }}
            placeholder="Concert Title"
            data-testid="editor-input-setlist-name"
          />
          <input
            type="text"
            inputMode="numeric"
            className="h-9 text-sm rounded-lg px-2 text-center font-semibold placeholder:text-[#76766f] focus:outline-none focus:ring-1 focus:ring-[#322a24] transition-all duration-150"
            style={{ width: "72px", minWidth: "72px", background: "#1e1814", border: "1px solid #322a24", color: "#e8e8e2", fontFamily: MONO_FONT }}
            value={rehearsalValue}
            onChange={(e) => { setRehearsalValue(imeRehearsalRef.current ? e.target.value : filterTimeInput(e.target.value)); }}
            onCompositionStart={() => { imeRehearsalRef.current = true; clearTimeout(imeRehearsalTimerRef.current); }}
            onCompositionEnd={(e) => { clearTimeout(imeRehearsalTimerRef.current); imeRehearsalTimerRef.current = setTimeout(() => { imeRehearsalRef.current = false; }, 300); setRehearsalValue(filterTimeInput((e.target as HTMLInputElement).value)); }}
            onFocus={() => { rehearsalFocusedRef.current = true; }}
            onBlur={commitRehearsal}
            onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229 || imeRehearsalRef.current) return; if (e.key === "Enter") { e.preventDefault(); commitRehearsal(); } }}
            placeholder="00:00"
            data-testid="editor-input-rehearsal"
          />
          <input
            type="text"
            inputMode="numeric"
            className="h-9 text-sm rounded-lg px-2 text-center font-semibold placeholder:text-[#76766f] focus:outline-none focus:ring-1 focus:ring-[#322a24] transition-all duration-150"
            style={{ width: "72px", minWidth: "72px", background: "#1e1814", border: "1px solid #322a24", color: "#e8e8e2", fontFamily: MONO_FONT }}
            value={doorOpenValue}
            onChange={(e) => { setDoorOpenValue(imeDoorRef.current ? e.target.value : filterTimeInput(e.target.value)); }}
            onCompositionStart={() => { imeDoorRef.current = true; clearTimeout(imeDoorTimerRef.current); }}
            onCompositionEnd={(e) => { clearTimeout(imeDoorTimerRef.current); imeDoorTimerRef.current = setTimeout(() => { imeDoorRef.current = false; }, 300); setDoorOpenValue(filterTimeInput((e.target as HTMLInputElement).value)); }}
            onFocus={() => { doorOpenFocusedRef.current = true; }}
            onBlur={commitDoorOpen}
            onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229 || imeDoorRef.current) return; if (e.key === "Enter") { e.preventDefault(); commitDoorOpen(); } }}
            placeholder="00:00"
            data-testid="editor-input-door-open"
          />
          <input
            type="text"
            inputMode="numeric"
            className="h-9 text-sm rounded-lg px-2 text-center font-semibold placeholder:text-[#76766f] focus:outline-none focus:ring-1 focus:ring-[#322a24] transition-all duration-150"
            style={{ width: "72px", minWidth: "72px", background: "#1e1814", border: "1px solid #322a24", color: "#e8e8e2", fontFamily: MONO_FONT }}
            value={showTimeValue}
            onChange={(e) => { setShowTimeValue(imeShowRef.current ? e.target.value : filterTimeInput(e.target.value)); }}
            onCompositionStart={() => { imeShowRef.current = true; clearTimeout(imeShowTimerRef.current); }}
            onCompositionEnd={(e) => { clearTimeout(imeShowTimerRef.current); imeShowTimerRef.current = setTimeout(() => { imeShowRef.current = false; }, 300); setShowTimeValue(filterTimeInput((e.target as HTMLInputElement).value)); }}
            onFocus={() => { showTimeFocusedRef.current = true; }}
            onBlur={commitShowTime}
            onKeyDown={(e) => { if (e.nativeEvent.isComposing || e.keyCode === 229 || imeShowRef.current) return; if (e.key === "Enter") { e.preventDefault(); commitShowTime(); } }}
            placeholder="00:00"
            data-testid="editor-input-show-time"
          />
        </div>
      </div>

      {/* ===== MAIN CONTENT: LEFT preview + RIGHT editor (flex row) =====
          pt-6 adds breathing room below the Concert Title strip (matches LEFT preview vertical balance).
          pr-6 on the whole row adds right-edge margin that mirrors the LEFT preview's px-6 padding. */}
      <div className="flex flex-1 min-h-0 w-full pt-6 pr-6">

      {/* LEFT: External display preview area.
          Outer container is WARM GRAY (#181411). ONLY the 16:9 preview rectangle is pure BLACK.
          Explicit flex spacers center the preview; spacers + control bar inherit warm gray. */}
      <div
        className="flex flex-col shrink-0 w-1/2 h-full"
        style={{ background: "#181411" }}
      >
        {/* Top spacer — warm gray */}
        <div className="flex-1 min-h-[16px]" style={{ background: "#181411" }} />

        {/* 16:9 preview rectangle — ONLY this is pure black, capped so it never overflows */}
        <div className="px-6 w-full shrink-0" style={{ background: "#181411" }}>
          <div
            className="relative mx-auto"
            style={{
              aspectRatio: "16 / 9",
              background: "#000",
              width: "100%",
              maxHeight: "calc(100vh - 220px)",
              overflow: "hidden",
              borderRadius: "6px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px #322a24",
            }}
          >
            {showingEventInfo ? (
              <EventInfoDisplay
                concertTitle={setlistNameValue || ""}
                doorOpen={doorOpenValue || null}
                showTime={showTimeValue || null}
                rehearsal={rehearsalValue || null}
                inline
              />
            ) : (
              <CountdownDisplay
                formattedTime={formattedTime}
                status={status}
                progress={progress}
                songTitle={songTitle}
                nextSongTitle={nextSongTitle}
                remainingSeconds={remainingSeconds}
                fillWidth
                isEvent={isEvent}
                xTime={xTime}
                isMC={isMC}
                isEncore={isEncore}
                isCountUp={isCountUp}
                elapsedSeconds={elapsedSeconds}
                mcTargetSeconds={mcTargetSeconds}
                subTimerFormatted={subTimerFormatted}
                subTimerRemaining={subTimerRemaining}
                subTimerSeconds={subTimerSecondsProp}
                subTimerActive={subTimerActive}
              />
            )}
          </div>
        </div>

        {/* Control bar — warm gray with subtle top border */}
        <div
          className="flex flex-wrap items-center justify-center gap-2 py-3 px-4 w-full shrink-0"
          style={{
            background: "#181411",
            marginTop: "14px",
          }}
          data-testid="editor-control-bar"
        >
          {/* Control pills — all flat PROMPTER-style: solid surface bg + warm border, no neon glow */}
          {countdownStatus === "running" && (
            <button onClick={onPause} className={ctrlBtnClass}
              style={{ color: "#e8e8e2", background: "#1e1814", border: "1px solid #322a24" }}
              data-testid="editor-button-pause"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          )}
          {countdownStatus === "paused" && (
            <button onClick={onResume} className={ctrlBtnClass}
              style={{ color: "#e8e8e2", background: "#1e1814", border: "1px solid #322a24" }}
              data-testid="editor-button-resume"
            >
              <Play className="w-3.5 h-3.5" /> Resume
            </button>
          )}
          {(countdownStatus === "running" || countdownStatus === "paused") && (
            <button onClick={onStop} className={ctrlBtnClass}
              style={{ color: "#a8a8a0", background: "#1e1814", border: "1px solid #322a24" }}
              data-testid="editor-button-stop"
            >
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}
          {/* Live MIDI signal display — shows incoming MIDI note prominently */}
          <LiveMidiBigDisplay lastMessage={lastMidiMessage ?? null} />
        </div>

        {/* Bottom spacer — warm gray (mirrors top spacer, centers the preview+controls) */}
        <div className="flex-1 min-h-[16px]" style={{ background: "#181411" }} />
      </div>

      {/* RIGHT: setlist editor (no center divider — the full-width strips bridge the two sides) */}
      <div
        className="flex-1 flex flex-col min-w-0"
        style={{
          background: "#181411",
        }}
        onDrop={handleEditorDrop}
        onDragOver={handleEditorDragOver}
      >

        <div ref={editorScrollRef} className="flex-1 overflow-y-scroll min-h-0">
          <div className="sticky top-0 z-20" style={{ background: "#181411" }}>
            {/* Concert Title + schedule times have been moved to the FULL-WIDTH top strip. */}
            <SongTableHeader showPlayButton showMidiColumn hideSubStartEnd />
          </div>
          {songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <span className="text-white/20 text-sm" style={{ fontFamily: UI_FONT }}>
                No songs yet
              </span>
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
                    if (!song.isEvent && !song.isMC && !song.isEncore) songNum++;
                    return (
                      <SongRow
                        key={song.id}
                        song={song}
                        index={index}
                        songNumber={songNum}
                        setlistId={setlist!.id}
                        isLast={index === songs.length - 1}
                        isCurrent={index === currentSongIndex}
                        prevNextTitle={index > 0 ? songs[index - 1].nextTitle || "" : ""}
                        onStartSong={onStartSong}
                        onLiveTitleChange={onLiveTitleChange}
                        onLiveDurationChange={onLiveDurationChange}
                        onNextTitleCommit={handleNextTitleCommit}
                        showPlayButton
                        showMidiColumn
                        hideSubStartEnd
                        testIdPrefix="editor"
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
            onAddEncore={() => handleAddEncoreAt(songs.length)}
            disabled={!setlist}
            testIdPrefix="editor-bottom"
          />
          <div style={{ minHeight: "50vh" }} />
        </div>
      </div>

      {/* end of main-content flex row */}
      </div>

      {/* ===== FULL-WIDTH BOTTOM STRIP: MIDI log (spans entire width) ===== */}
      <div
        className="shrink-0 w-full"
        style={{
          borderTop: "1px solid #221d18",
          background: "#181411",
          height: 32,
          overflow: "hidden",
        }}
      >
        <MidiLogMonitor lastMessage={lastMidiMessage ?? null} />
      </div>
    </div>
  );
}
