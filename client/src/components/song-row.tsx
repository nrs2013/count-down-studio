import { useState, useRef, useEffect } from "react";
import { type LocalSong as Song } from "@/lib/local-db";
import { useUpdateSong, useDeleteSong } from "@/hooks/use-local-data";
import { useToast } from "@/hooks/use-toast";
import { Trash2, GripVertical, Play, Plus } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  UI_FONT,
  MONO_FONT,
  MIDI_NOTES_BY_NAME,
  parseDuration,
  formatDuration,
  parseStartEndFromRange,
  INPUT_STYLES,
  ACCENT_COLORS,
  TABLE_HEADER_STYLE,
} from "@/lib/time-utils";
import { StyledInput, TimeInput, StyledSelect } from "@/components/styled-input";

export const SONG_LIST_BG = "#141418";

interface SongRowProps {
  song: Song;
  index: number;
  songNumber?: number;
  setlistId: number;
  isLast: boolean;
  showPlayButton?: boolean;
  showMidiColumn?: boolean;
  hideSubStartEnd?: boolean;
  isCurrent?: boolean;
  onStartSong?: (index: number) => void;
  onLiveTitleChange?: (songId: number, title: string, nextTitle: string) => void;
  onLiveDurationChange?: (songId: number, durationSeconds: number | null) => void;
  onNextTitleCommit?: (songIndex: number, nextTitleValue: string | null) => void;
  testIdPrefix?: string;
}



export function SongRow({
  song,
  index,
  songNumber,
  setlistId,
  isLast,
  showPlayButton = false,
  showMidiColumn = false,
  hideSubStartEnd = false,
  isCurrent = false,
  onStartSong,
  onLiveTitleChange,
  onLiveDurationChange,
  onNextTitleCommit,
  testIdPrefix = "row",
}: SongRowProps) {
  const { toast } = useToast();
  const updateSong = useUpdateSong();
  const deleteSong = useDeleteSong();

  const [title, setTitle] = useState(song.title);
  const [nextTitle, setNextTitle] = useState(song.nextTitle || "");
  const [duration, setDuration] = useState(formatDuration(song.durationSeconds));
  const initRange = parseStartEndFromRange(song.timeRange);
  const [startTime, setStartTime] = useState(initRange.start);
  const [endTime, setEndTime] = useState(initRange.end);
  const [subTimer, setSubTimer] = useState(song.subTimerSeconds > 0 ? formatDuration(song.subTimerSeconds) : "");
  const initSubRange = parseStartEndFromRange(song.subTimerTimeRange);
  const [subStartTime, setSubStartTime] = useState(initSubRange.start);
  const [subEndTime, setSubEndTime] = useState(initSubRange.end);

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
    if (focusedFieldRef.current !== "subTimer") setSubTimer(song.subTimerSeconds > 0 ? formatDuration(song.subTimerSeconds) : "");
    if (focusedFieldRef.current !== "subStartTime" && focusedFieldRef.current !== "subEndTime") {
      const sr = parseStartEndFromRange(song.subTimerTimeRange);
      setSubStartTime(sr.start);
      setSubEndTime(sr.end);
    }
  }, [song.title, song.nextTitle, song.durationSeconds, song.timeRange, song.subTimerSeconds, song.subTimerTimeRange]);

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

    if (sParsed === null) {
      toast({ title: "START: M:SS", description: "e.g. 1:30" });
      resetStartEnd();
      return;
    }
    if (eParsed === null) {
      toast({ title: "END: M:SS", description: "e.g. 4:00" });
      resetStartEnd();
      return;
    }

    if (eParsed < sParsed) {
      toast({ title: "END < START", description: "END must be after START" });
      resetStartEnd();
      return;
    }

    const sFormatted = formatDuration(sParsed);
    const eFormatted = formatDuration(eParsed);
    setStartTime(sFormatted);
    setEndTime(eFormatted);

    const combined = `${sFormatted}~${eFormatted}`;
    if (combined !== (song.timeRange || "")) {
      const diff = eParsed - sParsed;
      updateSong.mutate({
        id: song.id,
        data: { timeRange: combined, durationSeconds: diff },
        setlistId,
      });
      setDuration(formatDuration(diff));
    }
  };

  const commitDuration = () => {
    focusedFieldRef.current = null;
    const trimmed = duration.trim();
    if (!trimmed) {
      setDuration(formatDuration(song.durationSeconds));
      return;
    }
    const parsed = parseDuration(trimmed);
    if (parsed === null) {
      toast({ title: "Time: M:SS", description: "e.g. 3:30" });
      setDuration(formatDuration(song.durationSeconds));
      return;
    }
    setDuration(formatDuration(parsed));
    if (parsed !== song.durationSeconds) {
      updateSong.mutate({ id: song.id, data: { durationSeconds: parsed }, setlistId });
    }
  };

  const commitSubTimer = () => {
    focusedFieldRef.current = null;
    const trimmed = subTimer.trim();
    if (!trimmed) {
      if (song.subTimerSeconds > 0) {
        updateSong.mutate({ id: song.id, data: { subTimerSeconds: 0, subTimerTimeRange: null }, setlistId });
      }
      setSubTimer("");
      setSubStartTime("");
      setSubEndTime("");
      return;
    }
    const parsed = parseDuration(trimmed);
    if (parsed === null) {
      toast({ title: "着替: M:SS", description: "e.g. 1:30" });
      setSubTimer(song.subTimerSeconds > 0 ? formatDuration(song.subTimerSeconds) : "");
      return;
    }
    setSubTimer(formatDuration(parsed));
    if (parsed !== song.subTimerSeconds) {
      updateSong.mutate({ id: song.id, data: { subTimerSeconds: parsed }, setlistId });
    }
  };

  const resetSubStartEnd = () => {
    const r = parseStartEndFromRange(song.subTimerTimeRange);
    setSubStartTime(r.start);
    setSubEndTime(r.end);
  };

  const commitSubStartEnd = () => {
    focusedFieldRef.current = null;
    const s = subStartTime.trim();
    const e = subEndTime.trim();

    if (!s && !e) {
      if (song.subTimerTimeRange) {
        updateSong.mutate({ id: song.id, data: { subTimerTimeRange: null, subTimerSeconds: 0 }, setlistId });
        setSubTimer("");
      }
      return;
    }

    if (s && !e) return;
    if (!s && e) return;

    const sParsed = parseDuration(s);
    const eParsed = parseDuration(e);

    if (sParsed === null) {
      toast({ title: "着替 START: M:SS", description: "e.g. 1:30" });
      resetSubStartEnd();
      return;
    }
    if (eParsed === null) {
      toast({ title: "着替 END: M:SS", description: "e.g. 4:00" });
      resetSubStartEnd();
      return;
    }

    if (eParsed <= sParsed) {
      toast({ title: "END < START", description: "END must be after START" });
      resetSubStartEnd();
      return;
    }

    const sFormatted = formatDuration(sParsed);
    const eFormatted = formatDuration(eParsed);
    setSubStartTime(sFormatted);
    setSubEndTime(eFormatted);

    const combined = `${sFormatted}~${eFormatted}`;
    if (combined !== (song.subTimerTimeRange || "")) {
      const diff = eParsed - sParsed;
      updateSong.mutate({
        id: song.id,
        data: { subTimerTimeRange: combined, subTimerSeconds: diff },
        setlistId,
      });
      setSubTimer(formatDuration(diff));
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

  const pid = testIdPrefix;
  const isEvent = song.isEvent === true;
  const isMC = song.isMC === true;
  const isEncore = song.isEncore === true;
  const isEnd = (song as any).isEnd === true;
  const isCompactRow = isMC || isEncore || isEnd;

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-1 py-1.5 px-2 transition-all duration-200 group`}
      style={{
        ...sortableStyle,
        // Flat Claude-style: solid surface, lifted above warm gray canvas.
        background: isCurrent ? "#2a1e28" : "#242320",
        borderRadius: "3px",
        marginBottom: "3px",
        border: isCurrent ? "1px solid #c186c8" : "1px solid #2c2a27",
        boxShadow: isCurrent
          ? "0 0 0 1px rgba(193,134,200,0.25)"
          : "none",
      }}
      data-testid={`${pid}-song-${song.id}`}
      data-song-row=""
    >
      <div
        className="shrink-0 cursor-grab active:cursor-grabbing flex items-center justify-center w-4"
        style={{ color: "rgba(255,255,255,0.15)", touchAction: "none" }}
        tabIndex={-1}
        {...attributes}
        {...listeners}
        data-testid={`drag-handle-${song.id}`}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Category badge for MC/SP/EN/END — distinct colored tint with confident edges. */}
      {(isEncore || isMC || isEvent || isEnd) ? (
        <span
          className="text-center shrink-0 flex items-center justify-center"
          style={{
            fontFamily: MONO_FONT,
            fontSize: "10px",
            fontWeight: 900,
            letterSpacing: "0.05em",
            color: isEnd ? "#f0c77a" : isEncore ? "#b8d9b0" : isMC ? "#a8d4e8" : "#e8c890",
            background: isEnd
              ? "rgba(232,176,74,0.38)"
              : isEncore
              ? "rgba(106,138,102,0.32)"
              : isMC
              ? "rgba(106,150,184,0.32)"
              : "rgba(184,149,88,0.32)",
            border: isEnd
              ? "1px solid rgba(232,176,74,0.8)"
              : isEncore
              ? "1px solid rgba(106,138,102,0.7)"
              : isMC
              ? "1px solid rgba(106,150,184,0.7)"
              : "1px solid rgba(184,149,88,0.7)",
            borderRadius: "2px",
            padding: "3px 0",
            width: 30, minWidth: 30, maxWidth: 30,
            lineHeight: 1,
            boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
          }}
          data-testid={`text-song-index-${song.id}`}
        >
          {isEnd ? "END" : isEncore ? "EN" : isMC ? "MC" : "SP"}
        </span>
      ) : (
        <span
          className="text-center shrink-0 flex items-center justify-center"
          style={{
            fontFamily: MONO_FONT,
            fontSize: "12px",
            fontWeight: 700,
            color: isCurrent ? "#c186c8" : "#76766f",
            width: 30, minWidth: 30, maxWidth: 30,
            height: 22,
            lineHeight: 1,
          }}
          data-testid={`text-song-index-${song.id}`}
        >
          {songNumber ?? index + 1}
        </span>
      )}

      {showPlayButton && (
        <button
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-150"
          style={{
            color: isCurrent ? "#0a0a08" : "#a8a8a0",
            background: isCurrent ? "#c186c8" : "#2c2a27",
            border: "none",
          }}
          onClick={() => onStartSong?.(index)}
          data-testid={`${pid}-button-play-${song.id}`}
        >
          <Play className="w-3 h-3" fill="currentColor" />
        </button>
      )}

      {(isMC || isEncore || isEnd) ? (
        <>
          {isEnd ? (
            <span
              className="flex-[0.8] min-w-0 flex items-center px-2 font-bold tracking-widest"
              style={{ color: "#f0c77a", fontFamily: MONO_FONT, fontSize: 12, letterSpacing: "0.25em" }}
            >
              END OF SHOW
            </span>
          ) : (
            <span className="flex-[0.8] min-w-0" />
          )}
          <span className="flex-[0.8] min-w-0" />
        </>
      ) : (
        <StyledInput
          value={title}
          onChange={(e) => { setTitle(e.target.value); onLiveTitleChange?.(song.id, e.target.value, nextTitle); }}
          onBlur={commitTitle}
          onFocusField={() => { focusedFieldRef.current = "title"; }}
          className="flex-[0.8] min-w-0"
          placeholder="NOW title"
          testId={`${pid}-input-title-${song.id}`}
          accent="fuchsia"
          bold
        />
      )}

      {!isMC && !isEncore && !isEnd && (
        <StyledInput
          value={nextTitle}
          onChange={(e) => { setNextTitle(e.target.value); onLiveTitleChange?.(song.id, title, e.target.value); }}
          onBlur={commitNextTitle}
          onFocusField={() => { focusedFieldRef.current = "nextTitle"; }}
          className="flex-[0.8] min-w-0 text-cyan-400"
          placeholder="NEXT title"
          testId={`${pid}-input-next-${song.id}`}
          accent="cyan"
          bold
        />
      )}

      {(isMC || isEncore) ? (
        <>
          <span className="w-[60px] shrink-0" />
          <span className="w-[60px] shrink-0" />
          <TimeInput
            value={duration}
            onChange={(v) => {
              setDuration(v);
              const parsed = parseDuration(v);
              onLiveDurationChange?.(song.id, parsed);
            }}
            onBlur={() => {
              commitDuration();
              onLiveDurationChange?.(song.id, null);
            }}
            onFocusField={() => { focusedFieldRef.current = "duration"; }}
            placeholder="0:00"
            testId={`${pid}-input-${isEncore ? "encore" : "mc"}-target-${song.id}`}
            color={"#e8b04a"}
          />
          <span className="shrink-0" style={{ width: "42px" }} />
          {!hideSubStartEnd && <span className="w-[60px] shrink-0" />}
          {!hideSubStartEnd && <span className="w-[60px] shrink-0" />}
          <span className="w-[60px] shrink-0" />
        </>
      ) : isEnd ? (
        <>
          <span className="w-[60px] shrink-0" />
          <span className="w-[60px] shrink-0" />
          <span className="w-[60px] shrink-0" />
          <span className="shrink-0" style={{ width: "42px" }} />
          {!hideSubStartEnd && <span className="w-[60px] shrink-0" />}
          {!hideSubStartEnd && <span className="w-[60px] shrink-0" />}
          <span className="w-[60px] shrink-0" />
        </>
      ) : (
        <>
          <TimeInput
            value={startTime}
            onChange={setStartTime}
            onBlur={commitStartEnd}
            onFocusField={() => { focusedFieldRef.current = "startTime"; }}
            placeholder="0:00"
            testId={`${pid}-input-start-${song.id}`}
          />
          <TimeInput
            value={endTime}
            onChange={setEndTime}
            onBlur={commitStartEnd}
            onFocusField={() => { focusedFieldRef.current = "endTime"; }}
            placeholder="0:00"
            testId={`${pid}-input-end-${song.id}`}
          />

          <TimeInput
            value={song.xTime ? "X" : duration}
            onChange={(v) => {
              if (song.xTime) return;
              setDuration(v);
              const parsed = parseDuration(v);
              onLiveDurationChange?.(song.id, parsed);
            }}
            onBlur={() => {
              if (song.xTime) return;
              commitDuration();
              onLiveDurationChange?.(song.id, null);
            }}
            onFocusField={() => { if (!song.xTime) focusedFieldRef.current = "duration"; }}
            placeholder="0:00"
            testId={`${pid}-input-duration-${song.id}`}
            color={song.xTime ? "#7ed472" : "#e8b04a"}
            disabled={song.xTime}
          />

          <button
            tabIndex={-1}
            className="shrink-0 flex flex-col items-center justify-center rounded-sm transition-all duration-200"
            style={{
              fontFamily: MONO_FONT,
              lineHeight: 1,
              whiteSpace: "nowrap",
              width: "42px",
              height: "38px",
              ...(song.xTime
                ? {
                    background: "#5a8056",
                    color: "#0a0a08",
                    border: "1px solid #7aa876",
                    boxShadow: "0 0 0 1px rgba(106,138,102,0.3)",
                  }
                : {
                    background: "#0c0b0a",
                    color: "#5a5a54",
                    border: "1px solid #242320",
                  }),
            }}
            onClick={() => {
              updateSong.mutate({ id: song.id, data: { xTime: !song.xTime }, setlistId });
            }}
            data-testid={`${pid}-button-xtime-${song.id}`}
          >
            <span style={{ fontSize: "13px", fontWeight: 900, letterSpacing: "0.05em" }}>X</span>
            <span style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em", marginTop: "2px" }}>TIME</span>
          </button>

          {!hideSubStartEnd && (
            <TimeInput
              value={subStartTime}
              onChange={setSubStartTime}
              onBlur={commitSubStartEnd}
              onFocusField={() => { focusedFieldRef.current = "subStartTime"; }}
              placeholder="0:00"
              testId={`${pid}-input-substart-${song.id}`}
              color={subStartTime ? "#a8a8a0" : undefined}
            />
          )}
          {!hideSubStartEnd && (
            <TimeInput
              value={subEndTime}
              onChange={setSubEndTime}
              onBlur={commitSubStartEnd}
              onFocusField={() => { focusedFieldRef.current = "subEndTime"; }}
              placeholder="0:00"
              testId={`${pid}-input-subend-${song.id}`}
              color={subEndTime ? "#a8a8a0" : undefined}
            />
          )}
          <TimeInput
            value={subTimer}
            onChange={setSubTimer}
            onBlur={commitSubTimer}
            onFocusField={() => { focusedFieldRef.current = "subTimer"; }}
            placeholder="着替"
            testId={`${pid}-input-subtimer-${song.id}`}
            color={subTimer ? "#e0a070" : undefined}
          />
        </>
      )}

      {showMidiColumn && (
        <StyledSelect
          value={song.midiNote !== null && song.midiNote !== undefined ? String(song.midiNote) : ""}
          onChange={handleMidiChange}
          className="w-[72px] shrink-0"
          hasValue={song.midiNote !== null && song.midiNote !== undefined}
          testId={`${pid}-select-midi-${song.id}`}
        >
          <option value="" style={{ background: "#1a1918", color: "rgba(255,255,255,0.5)" }}>No MIDI</option>
          {MIDI_NOTES_BY_NAME.map((group) => (
            <optgroup key={group.noteName} label={`── ${group.noteName} ──`} style={{ background: "#1c1b19", color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>
              {group.notes.map((n) => (
                <option key={n.value} value={String(n.value)} style={{ background: "#1a1918", color: "rgba(255,255,255,0.9)", fontWeight: 400 }}>
                  {n.label}
                </option>
              ))}
            </optgroup>
          ))}
        </StyledSelect>
      )}

      <button
        tabIndex={-1}
        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
        style={{ color: "transparent", background: "transparent" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#a8a8a0"; e.currentTarget.style.background = "#1c1b19"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "transparent"; e.currentTarget.style.background = "transparent"; }}
        onClick={() => {
          deleteSong.mutate({ id: song.id, setlistId }, {
            onSuccess: () => toast({ title: "Deleted" }),
          });
        }}
        data-testid={`${pid}-button-delete-${song.id}`}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

interface SongTableHeaderProps {
  showPlayButton?: boolean;
  showMidiColumn?: boolean;
  hideSubStartEnd?: boolean;
}

export function SongTableHeader({ showPlayButton = false, showMidiColumn = false, hideSubStartEnd = false }: SongTableHeaderProps) {
  return (
    <div
      className="flex items-center gap-1 px-2 pt-3 pb-0.5 text-[15px] uppercase font-normal shrink-0"
      style={{ ...TABLE_HEADER_STYLE, borderLeft: "3px solid transparent" }}
      data-testid="song-table-header"
    >
      {/* All column labels: unified muted warm gray (PROMPTER style) */}
      <span className="w-4" />
      <span className="text-center" style={{ width: 22, minWidth: 22, maxWidth: 22, color: "#76766f" }}>#</span>
      {showPlayButton && <span className="w-7" />}
      <span className="flex-[0.8]" style={{ color: "#76766f" }}>NOW TITLE</span>
      <span className="flex-[0.8]" style={{ color: "#76766f" }}>NEXT TITLE</span>
      <span className="w-[60px] text-center" style={{ color: "#76766f" }}>START</span>
      <span className="w-[60px] text-center" style={{ color: "#76766f" }}>END</span>
      <span className="w-[60px] text-center" style={{ color: "#b89550", fontWeight: 700 }}>TIME</span>
      <span className="w-[42px] text-center" style={{ color: "#7aa878", fontSize: "13px", fontWeight: 700 }}>X TIME</span>
      {!hideSubStartEnd && <span className="w-[60px] text-center" style={{ color: "#76766f", fontSize: "12px" }}>着替IN</span>}
      {!hideSubStartEnd && <span className="w-[60px] text-center" style={{ color: "#76766f", fontSize: "12px" }}>着替OUT</span>}
      <span className="w-[60px] text-center" style={{ color: "#b8855a", fontSize: "12px", letterSpacing: "-0.05em", fontWeight: 700 }}>着替時間</span>
      {showMidiColumn && <span className="w-[72px] text-center" style={{ color: "#a896c0", fontWeight: 700 }}>MIDI</span>}
      <span className="w-5" />
    </div>
  );
}

interface AddSongButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: "full" | "compact";
  testId?: string;
  lineBreak?: boolean;
}

export function AddSongButton({ onClick, disabled = false, variant = "full", testId = "button-add-song", lineBreak = false }: AddSongButtonProps) {
  const label = lineBreak ? <span className="text-center leading-tight">ADD<br />SONG</span> : "ADD SONG";
  if (variant === "compact") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all duration-300 disabled:opacity-40"
        style={{
          background: "transparent",
          border: "1px dashed #2c2a27",
          color: "#a8a8a0",
        }}
        data-testid={testId}
      >
        <Plus className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-sm font-semibold text-sm tracking-wider uppercase transition-all duration-300 disabled:opacity-40"
      style={{
        background: "transparent",
        border: "1px dashed #2c2a27",
        color: "#a8a8a0",
      }}
      data-testid={testId}
    >
      <Plus className="w-4 h-4" />
      {label}
    </button>
  );
}

interface AddMCButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: "full" | "compact";
  testId?: string;
  lineBreak?: boolean;
}

export function AddMCButton({ onClick, disabled = false, variant = "full", testId = "button-add-mc", lineBreak = false }: AddMCButtonProps) {
  const label = lineBreak ? <span className="text-center leading-tight">ADD<br />MC</span> : "ADD MC";
  if (variant === "compact") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all duration-300 disabled:opacity-40"
        style={{
          background: "transparent",
          border: "1px dashed #2c2a27",
          color: "#a8a8a0",
        }}
        data-testid={testId}
      >
        <Plus className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-sm font-semibold text-sm tracking-wider uppercase transition-all duration-300 disabled:opacity-40"
      style={{
        background: "transparent",
        border: "1px dashed #2c2a27",
        color: "#a8a8a0",
      }}
      data-testid={testId}
    >
      <Plus className="w-4 h-4" />
      {label}
    </button>
  );
}

interface AddSpecialButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: "full" | "compact";
  testId?: string;
  lineBreak?: boolean;
}

export function AddSpecialButton({ onClick, disabled = false, variant = "full", testId = "button-add-event", lineBreak = false }: AddSpecialButtonProps) {
  const label = lineBreak ? <span className="text-center leading-tight">ADD<br />SPECIAL</span> : "ADD SPECIAL";
  if (variant === "compact") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all duration-300 disabled:opacity-40"
        style={{
          background: "transparent",
          border: "1px dashed #2c2a27",
          color: "#a8a8a0",
        }}
        data-testid={testId}
      >
        <Plus className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-sm font-semibold text-sm tracking-wider uppercase transition-all duration-300 disabled:opacity-40"
      style={{
        background: "transparent",
        border: "1px dashed #2c2a27",
        color: "#a8a8a0",
      }}
      data-testid={testId}
    >
      <Plus className="w-4 h-4" />
      {label}
    </button>
  );
}

interface AddEncoreButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: "full" | "compact";
  testId?: string;
  lineBreak?: boolean;
}

export function AddEncoreButton({ onClick, disabled = false, variant = "full", testId = "button-add-encore", lineBreak = false }: AddEncoreButtonProps) {
  const label = lineBreak ? <span className="text-center leading-tight">ADD<br />ENCORE</span> : "ADD ENCORE";
  if (variant === "compact") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all duration-300 disabled:opacity-40"
        style={{
          background: "transparent",
          border: "1px dashed #2c2a27",
          color: "#a8a8a0",
        }}
        data-testid={testId}
      >
        <Plus className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-sm font-semibold text-sm tracking-wider uppercase transition-all duration-300 disabled:opacity-40"
      style={{
        background: "transparent",
        border: "1px dashed #2c2a27",
        color: "#a8a8a0",
      }}
      data-testid={testId}
    >
      <Plus className="w-4 h-4" />
      {label}
    </button>
  );
}

interface InsertionRowProps {
  onAddSong: () => void;
  onAddSpecial: () => void;
  onAddMC: () => void;
  onAddEncore?: () => void;
  onAddEnd?: () => void;
  disabled?: boolean;
  testIdPrefix?: string;
}

export function InsertionRow({ onAddSong, onAddSpecial, onAddMC, onAddEncore, onAddEnd, disabled = false, testIdPrefix = "" }: InsertionRowProps) {
  const pfx = testIdPrefix ? `${testIdPrefix}-` : "";
  return (
    <div
      className="flex items-center gap-1 px-1 py-0.5"
      style={{
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <button
        onClick={onAddSong}
        disabled={disabled}
        className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-all duration-200 disabled:opacity-30"
        style={{
          color: "#e8c8ee",
          background: "linear-gradient(180deg, rgba(193,134,200,0.28) 0%, rgba(193,134,200,0.1) 100%), #2a2a28",
          border: "1px solid rgba(193,134,200,0.55)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset",
        }}
        data-testid={`${pfx}insert-song`}
      >
        <Plus className="w-3 h-3" />
        SONG
      </button>
      <button
        onClick={onAddSpecial}
        disabled={disabled}
        className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-all duration-200 disabled:opacity-30"
        style={{
          color: "#e8c890",
          background: "linear-gradient(180deg, rgba(184,149,88,0.28) 0%, rgba(184,149,88,0.1) 100%), #2a2a28",
          border: "1px solid rgba(184,149,88,0.55)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset",
        }}
        data-testid={`${pfx}insert-special`}
      >
        <Plus className="w-3 h-3" />
        SPECIAL
      </button>
      <button
        onClick={onAddMC}
        disabled={disabled}
        className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-all duration-200 disabled:opacity-30"
        style={{
          color: "#a8d4e8",
          background: "linear-gradient(180deg, rgba(106,150,184,0.28) 0%, rgba(106,150,184,0.1) 100%), #2a2a28",
          border: "1px solid rgba(106,150,184,0.55)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset",
        }}
        data-testid={`${pfx}insert-mc`}
      >
        <Plus className="w-3 h-3" />
        MC
      </button>
      {onAddEncore && (
        <button
          onClick={onAddEncore}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-all duration-200 disabled:opacity-30"
          style={{
            color: "#b8d9b0",
            background: "linear-gradient(180deg, rgba(106,138,102,0.28) 0%, rgba(106,138,102,0.1) 100%), #2a2a28",
            border: "1px solid rgba(106,138,102,0.55)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset",
          }}
          data-testid={`${pfx}insert-encore`}
        >
          <Plus className="w-3 h-3" />
          ENCORE
        </button>
      )}
      {onAddEnd && (
        <button
          onClick={onAddEnd}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-all duration-200 disabled:opacity-30"
          style={{
            color: "#f0c77a",
            background: "linear-gradient(180deg, rgba(232,176,74,0.32) 0%, rgba(232,176,74,0.1) 100%), #2a2a28",
            border: "1px solid rgba(232,176,74,0.6)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.05) inset",
          }}
          data-testid={`${pfx}insert-end`}
        >
          <Plus className="w-3 h-3" />
          END
        </button>
      )}
    </div>
  );
}
