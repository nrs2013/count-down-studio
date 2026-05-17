import { openDB, type IDBPDatabase } from "idb";

export interface LocalSetlist {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  doorOpen: string | null;
  showTime: string | null;
  rehearsal: string | null;
}

export interface LocalSong {
  id: number;
  setlistId: number;
  title: string;
  nextTitle: string | null;
  artist: string | null;
  durationSeconds: number;
  orderIndex: number;
  midiNote: number | null;
  midiChannel: number | null;
  timeRange: string | null;
  isEvent: boolean;
  xTime: boolean;
  isMC: boolean;
  isEncore: boolean;
  // END row — when played (by click or MIDI), triggers the concert-end summary.
  isEnd?: boolean;
  subTimerSeconds: number;
  subTimerTimeRange: string | null;
}

// A user-customisable press-and-hold cue card (replaces the hard-coded
// STAND BY! / HOLD! / GO! overlays). Director presses & holds the
// shortcutKey while the cue should flash on the sub-display and on the
// in-app preview rectangle.
export interface LocalCue {
  id: number;
  label: string;            // e.g. "STAND BY!"
  color: string;            // background hex, e.g. "#f5c518"
  textColor?: string;       // optional text hex; when undefined, auto-picked from background luminance
  shortcutKey: string;      // single key, e.g. "," "." "m" — also stored case-folded
  blink: boolean;           // whether to flash background <-> text color
  blinkSpeed: "slow" | "normal" | "fast"; // 1.2s / 0.7s / 0.35s
  orderIndex: number;       // display order in the cue bar
}

const DB_NAME = "songcountdown";
const DB_VERSION = 2;

// Default cues seeded the first time a user lands on DB_VERSION >= 2.
// These reproduce the hard-coded STAND BY! / HOLD! / GO! cards that used
// to live in output.tsx so existing muscle memory keeps working.
const DEFAULT_CUES: Omit<LocalCue, "id">[] = [
  { label: "STAND BY!", color: "#f5c518", shortcutKey: ",", blink: true,  blinkSpeed: "normal", orderIndex: 0 },
  { label: "HOLD!",     color: "#f5c518", shortcutKey: "m", blink: true,  blinkSpeed: "normal", orderIndex: 1 },
  { label: "GO!",       color: "#2dba4e", shortcutKey: ".", blink: false, blinkSpeed: "normal", orderIndex: 2 },
];

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains("setlists")) {
          db.createObjectStore("setlists", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("songs")) {
          const songStore = db.createObjectStore("songs", { keyPath: "id", autoIncrement: true });
          songStore.createIndex("bySetlist", "setlistId");
        }
        // v2: introduce the customisable cue cards store and seed it with
        // the three classic cues. We seed inside the upgrade transaction so
        // the user sees them on their first opening of the new version.
        if (!db.objectStoreNames.contains("cues")) {
          const cuesStore = db.createObjectStore("cues", { keyPath: "id", autoIncrement: true });
          cuesStore.createIndex("byOrder", "orderIndex");
          if (oldVersion < 2) {
            // tx is the upgrade transaction; we can add() through it.
            const seedStore = tx.objectStore("cues");
            for (const cue of DEFAULT_CUES) {
              seedStore.add(cue);
            }
          }
        }
      },
    });
  }
  return dbPromise;
}

export const localDB = {
  async getAllSetlists(): Promise<LocalSetlist[]> {
    const db = await getDB();
    const all = await db.getAll("setlists");
    return all.map((s: any) => ({ ...s, doorOpen: s.doorOpen ?? null, showTime: s.showTime ?? null, rehearsal: s.rehearsal ?? null }));
  },

  async createSetlist(data: Omit<LocalSetlist, "id">): Promise<LocalSetlist> {
    const db = await getDB();
    const id = (await db.add("setlists", { ...data })) as number;
    return { ...data, id };
  },

  async updateSetlist(id: number, data: Partial<LocalSetlist>): Promise<LocalSetlist> {
    const db = await getDB();
    const existing = await db.get("setlists", id);
    if (!existing) throw new Error("Setlist not found");
    const updated = { ...existing, ...data, id };
    await db.put("setlists", updated);
    return updated;
  },

  async deleteSetlist(id: number): Promise<void> {
    const db = await getDB();
    await db.delete("setlists", id);
    const tx = db.transaction("songs", "readwrite");
    const index = tx.store.index("bySetlist");
    let cursor = await index.openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  },

  async activateSetlist(id: number): Promise<void> {
    const db = await getDB();
    const all = await db.getAll("setlists");
    const tx = db.transaction("setlists", "readwrite");
    for (const s of all) {
      await tx.store.put({ ...s, isActive: s.id === id });
    }
    await tx.done;
  },

  async getSongsBySetlist(setlistId: number): Promise<LocalSong[]> {
    const db = await getDB();
    const tx = db.transaction("songs", "readonly");
    const index = tx.store.index("bySetlist");
    const songs = await index.getAll(setlistId);
    await tx.done;
    return songs
      .map((s: any) => ({ ...s, isEvent: s.isEvent ?? false, xTime: s.xTime ?? false, isMC: s.isMC ?? false, isEncore: s.isEncore ?? false, isEnd: s.isEnd ?? false, subTimerSeconds: s.subTimerSeconds ?? 0, subTimerTimeRange: s.subTimerTimeRange ?? null }))
      .sort((a: LocalSong, b: LocalSong) => a.orderIndex - b.orderIndex);
  },

  async createSong(data: Omit<LocalSong, "id">): Promise<LocalSong> {
    const db = await getDB();
    const tx = db.transaction("songs", "readwrite");
    const idx = tx.store.index("bySetlist");
    const existing = await idx.getAll(data.setlistId);
    const sorted = existing.sort((a: any, b: any) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    const insertAt = Math.max(0, Math.min(data.orderIndex ?? sorted.length, sorted.length));

    sorted.splice(insertAt, 0, null as any);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] && (sorted[i] as any).orderIndex !== i) {
        await tx.store.put({ ...sorted[i], orderIndex: i });
      }
    }

    const songData = { ...data, orderIndex: insertAt };
    const id = (await tx.store.add(songData)) as number;
    await tx.done;
    return { ...songData, id };
  },

  async updateSong(id: number, data: Partial<LocalSong>): Promise<LocalSong> {
    const db = await getDB();
    const existing = await db.get("songs", id);
    if (!existing) throw new Error("Song not found");
    const updated = { ...existing, ...data, id };
    await db.put("songs", updated);
    return updated;
  },

  async deleteSong(id: number): Promise<void> {
    const db = await getDB();
    await db.delete("songs", id);
  },

  async restoreSong(song: LocalSong): Promise<void> {
    const db = await getDB();
    await db.put("songs", song);
  },

  async restoreSetlist(setlist: LocalSetlist): Promise<void> {
    const db = await getDB();
    await db.put("setlists", setlist);
  },

  async moveSong(id: number, direction: "up" | "down"): Promise<void> {
    const db = await getDB();
    const song = await db.get("songs", id);
    if (!song) throw new Error("Song not found");

    const songs = await this.getSongsBySetlist(song.setlistId);
    const idx = songs.findIndex((s) => s.id === id);
    if (idx === -1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= songs.length) return;

    const tx = db.transaction("songs", "readwrite");
    const tmpOrder = songs[idx].orderIndex;
    await tx.store.put({ ...songs[idx], orderIndex: songs[swapIdx].orderIndex });
    await tx.store.put({ ...songs[swapIdx], orderIndex: tmpOrder });
    await tx.done;
  },

  async reorderSongs(setlistId: number, songIds: number[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("songs", "readwrite");
    for (let i = 0; i < songIds.length; i++) {
      const song = await tx.store.get(songIds[i]);
      if (song && song.setlistId === setlistId) {
        await tx.store.put({ ...song, orderIndex: i });
      }
    }
    await tx.done;
  },

  async exportSetlist(setlistId: number): Promise<object> {
    const db = await getDB();
    const setlist = await db.get("setlists", setlistId);
    if (!setlist) throw new Error("Setlist not found");
    const songs = await this.getSongsBySetlist(setlistId);
    return { setlist, songs };
  },

  async importData(data: { setlist: Omit<LocalSetlist, "id">; songs: Omit<LocalSong, "id" | "setlistId">[] }): Promise<number> {
    const newSetlist = await this.createSetlist(data.setlist);
    const db = await getDB();
    const tx = db.transaction("songs", "readwrite");
    for (let i = 0; i < data.songs.length; i++) {
      const s = data.songs[i];
      await tx.store.add({
        setlistId: newSetlist.id,
        title: s.title ?? "",
        nextTitle: s.nextTitle ?? null,
        artist: s.artist ?? null,
        durationSeconds: typeof s.durationSeconds === "number" ? s.durationSeconds : 0,
        orderIndex: i,
        midiNote: typeof s.midiNote === "number" ? s.midiNote : null,
        midiChannel: typeof s.midiChannel === "number" ? s.midiChannel : null,
        timeRange: s.timeRange ?? null,
        isEvent: s.isEvent === true,
        isMC: s.isMC === true,
        xTime: s.xTime === true,
        isEncore: s.isEncore === true,
        isEnd: (s as any).isEnd === true,
        subTimerSeconds: typeof s.subTimerSeconds === "number" ? s.subTimerSeconds : 0,
        subTimerTimeRange: s.subTimerTimeRange ?? null,
      });
    }
    await tx.done;
    return newSetlist.id;
  },

  // ============================================================
  // Cue cards — user-customisable STAND BY! / GO! / HOLD! style overlays
  // ============================================================
  async getAllCues(): Promise<LocalCue[]> {
    const db = await getDB();
    const all = await db.getAll("cues");
    return all
      .map((c: any) => ({
        id: c.id,
        label: c.label ?? "",
        color: c.color ?? "#f5c518",
        textColor: typeof c.textColor === "string" && c.textColor.length > 0 ? c.textColor : undefined,
        shortcutKey: c.shortcutKey ?? "",
        blink: c.blink !== false,
        blinkSpeed: (c.blinkSpeed === "slow" || c.blinkSpeed === "fast") ? c.blinkSpeed : "normal",
        orderIndex: typeof c.orderIndex === "number" ? c.orderIndex : 0,
      }) as LocalCue)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  },

  async createCue(data: Omit<LocalCue, "id">): Promise<LocalCue> {
    const db = await getDB();
    const id = (await db.add("cues", { ...data })) as number;
    return { ...data, id };
  },

  async updateCue(id: number, data: Partial<LocalCue>): Promise<LocalCue> {
    const db = await getDB();
    const existing = await db.get("cues", id);
    if (!existing) throw new Error("Cue not found");
    const updated: LocalCue = { ...existing, ...data, id };
    await db.put("cues", updated);
    return updated;
  },

  async deleteCue(id: number): Promise<void> {
    const db = await getDB();
    await db.delete("cues", id);
  },

  async reorderCues(cueIds: number[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("cues", "readwrite");
    for (let i = 0; i < cueIds.length; i++) {
      const cue = await tx.store.get(cueIds[i]);
      if (cue) {
        await tx.store.put({ ...cue, orderIndex: i });
      }
    }
    await tx.done;
  },

  async replaceSetlistSongs(setlistId: number, newName: string, songs: Omit<LocalSong, "id" | "setlistId">[], extra?: { doorOpen?: string | null; showTime?: string | null; rehearsal?: string | null }): Promise<void> {
    const db = await getDB();

    // Atomic replace: delete existing songs + update setlist metadata + add new songs
    // in ONE transaction over both stores. If anything throws, IndexedDB rolls back
    // automatically — no half-state where the setlist exists but its songs are gone.
    const tx = db.transaction(["songs", "setlists"], "readwrite");
    const songsStore = tx.objectStore("songs");
    const setlistsStore = tx.objectStore("setlists");

    // 1) Delete existing songs for this setlist
    const idx = songsStore.index("bySetlist");
    let cursor = await idx.openCursor(setlistId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    // 2) Update setlist metadata (name + optional door/show/rehearsal)
    const existing = await setlistsStore.get(setlistId);
    if (existing) {
      const updated: LocalSetlist = {
        ...existing,
        name: newName,
        doorOpen: extra && extra.doorOpen !== undefined ? (extra.doorOpen ?? null) : existing.doorOpen,
        showTime: extra && extra.showTime !== undefined ? (extra.showTime ?? null) : existing.showTime,
        rehearsal: extra && extra.rehearsal !== undefined ? (extra.rehearsal ?? null) : existing.rehearsal,
      };
      await setlistsStore.put(updated);
    }

    // 3) Add new songs
    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      await songsStore.add({
        setlistId,
        title: s.title ?? "",
        nextTitle: s.nextTitle ?? null,
        artist: s.artist ?? null,
        durationSeconds: typeof s.durationSeconds === "number" ? s.durationSeconds : 0,
        orderIndex: i,
        midiNote: typeof s.midiNote === "number" ? s.midiNote : null,
        midiChannel: typeof s.midiChannel === "number" ? s.midiChannel : null,
        timeRange: s.timeRange ?? null,
        isEvent: s.isEvent === true,
        isMC: s.isMC === true,
        xTime: s.xTime === true,
        isEncore: s.isEncore === true,
        isEnd: (s as any).isEnd === true,
        subTimerSeconds: typeof s.subTimerSeconds === "number" ? s.subTimerSeconds : 0,
        subTimerTimeRange: s.subTimerTimeRange ?? null,
      });
    }

    await tx.done;
  },
};
