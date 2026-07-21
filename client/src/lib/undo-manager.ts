import { type LocalSetlist, type LocalSong, type LocalCue, localDB } from "./local-db";

interface UndoSnapshot {
  setlistId: number;
  setlist: LocalSetlist;
  songs: LocalSong[];
  // C5: キューも控えに含める。キュー誤削除→Cmd+Z で「キューは戻らず
  // 無関係な曲編集だけ巻き戻る」二重被害を防ぐ。
  cues: LocalCue[];
  label: string;
  timestamp: number;
}

const MAX_UNDO_STACK = 30;

let undoStack: UndoSnapshot[] = [];
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((fn) => fn());
}

let skipNext = false;

export const undoManager = {
  skipNextSnapshot() {
    skipNext = true;
  },

  async pushSnapshot(setlistId: number, label: string) {
    if (skipNext) {
      skipNext = false;
      return;
    }
    try {
      const last = undoStack[undoStack.length - 1];
      if (last && last.setlistId === setlistId && last.label === label && Date.now() - last.timestamp < 500) {
        return;
      }

      const allSetlists = await localDB.getAllSetlists();
      const setlist = allSetlists.find((s) => s.id === setlistId);
      if (!setlist) return;
      const songs = await localDB.getSongsBySetlist(setlistId);
      const cues = await localDB.getAllCues();
      undoStack.push({
        setlistId,
        setlist: { ...setlist },
        songs: songs.map((s) => ({ ...s })),
        cues: cues.map((c) => ({ ...c })),
        label,
        timestamp: Date.now(),
      });
      if (undoStack.length > MAX_UNDO_STACK) {
        undoStack = undoStack.slice(-MAX_UNDO_STACK);
      }
      notify();
    } catch (_) {}
  },

  canUndo(): boolean {
    return undoStack.length > 0;
  },

  peekLabel(): string | null {
    if (undoStack.length === 0) return null;
    return undoStack[undoStack.length - 1].label;
  },

  async undo(): Promise<{ setlistId: number; label: string } | null> {
    const snapshot = undoStack.pop();
    if (!snapshot) return null;
    notify();

    try {
      const allSetlists = await localDB.getAllSetlists();
      const setlistExists = allSetlists.some((s) => s.id === snapshot.setlistId);

      if (!setlistExists) {
        await localDB.restoreSetlist(snapshot.setlist);
      } else {
        // Restore ALL setlist fields, not just name/description/isActive.
        // Otherwise undo of a song change wipes any door/show/rehearsal change
        // the user made between snapshots.
        await localDB.updateSetlist(snapshot.setlistId, {
          name: snapshot.setlist.name,
          description: snapshot.setlist.description,
          isActive: snapshot.setlist.isActive,
          doorOpen: snapshot.setlist.doorOpen,
          showTime: snapshot.setlist.showTime,
          rehearsal: snapshot.setlist.rehearsal,
        });
      }

      const currentSongs = setlistExists
        ? await localDB.getSongsBySetlist(snapshot.setlistId)
        : [];

      for (const cs of currentSongs) {
        const existed = snapshot.songs.find((s) => s.id === cs.id);
        if (!existed) {
          await localDB.deleteSong(cs.id);
        }
      }

      for (const ss of snapshot.songs) {
        const exists = currentSongs.find((c) => c.id === ss.id);
        if (exists) {
          const { id, ...data } = ss;
          await localDB.updateSong(id, data);
        } else {
          await localDB.restoreSong(ss);
        }
      }

      // C5: キューも控え時点へ戻す（古い控え=cues 無しは触らない）
      if (snapshot.cues) {
        await localDB.replaceAllCues(snapshot.cues);
      }

      return { setlistId: snapshot.setlistId, label: snapshot.label };
    } catch (_) {
      return null;
    }
  },

  clear() {
    undoStack = [];
    notify();
  },

  subscribe(fn: () => void) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },

  getStackSize(): number {
    return undoStack.length;
  },
};
