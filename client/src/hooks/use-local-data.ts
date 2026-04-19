import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { localDB, type LocalSetlist, type LocalSong } from "@/lib/local-db";
import { undoManager } from "@/lib/undo-manager";

export function useSetlists() {
  return useQuery<LocalSetlist[]>({
    queryKey: ["setlists"],
    queryFn: () => localDB.getAllSetlists(),
  });
}

export function useSongs(setlistId: number | undefined | null) {
  return useQuery<LocalSong[]>({
    queryKey: ["songs", setlistId],
    queryFn: () => localDB.getSongsBySetlist(setlistId!),
    enabled: !!setlistId,
  });
}

export function useCreateSetlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string | null; isActive?: boolean; doorOpen?: string | null; showTime?: string | null; rehearsal?: string | null }) =>
      localDB.createSetlist({ name: data.name, description: data.description ?? null, isActive: data.isActive ?? false, doorOpen: data.doorOpen ?? null, showTime: data.showTime ?? null, rehearsal: data.rehearsal ?? null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["setlists"] }); },
  });
}

export function useUpdateSetlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<LocalSetlist> }) => {
      await undoManager.pushSnapshot(id, "Edit setlist");
      return localDB.updateSetlist(id, data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["setlists"] }); },
  });
}

export function useDeleteSetlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await undoManager.pushSnapshot(id, "Delete setlist");
      return localDB.deleteSetlist(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["setlists"] });
      qc.invalidateQueries({ queryKey: ["songs"] });
    },
  });
}

export function useCreateSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<LocalSong, "id">) => {
      await undoManager.pushSnapshot(data.setlistId, "Add song");
      return localDB.createSong(data);
    },
    onSuccess: (_data, variables) => { qc.invalidateQueries({ queryKey: ["songs", variables.setlistId] }); },
  });
}

export function useUpdateSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data, setlistId }: { id: number; data: Partial<LocalSong>; setlistId: number }) => {
      await undoManager.pushSnapshot(setlistId, "Edit song");
      return localDB.updateSong(id, data);
    },
    onSuccess: (_data, variables) => { qc.invalidateQueries({ queryKey: ["songs", variables.setlistId] }); },
  });
}

export function useDeleteSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, setlistId }: { id: number; setlistId: number }) => {
      await undoManager.pushSnapshot(setlistId, "Delete song");
      return localDB.deleteSong(id);
    },
    onSuccess: (_data, variables) => { qc.invalidateQueries({ queryKey: ["songs", variables.setlistId] }); },
  });
}

export function useActivateSetlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => localDB.activateSetlist(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["setlists"] }); },
  });
}

export function useDuplicateSetlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: number) => {
      const setlists = await localDB.getAllSetlists();
      const source = setlists.find(s => s.id === sourceId);
      if (!source) throw new Error("Setlist not found");
      const songs = await localDB.getSongsBySetlist(sourceId);
      const newSetlist = await localDB.createSetlist({
        name: source.name + " (copy)",
        description: source.description,
        isActive: false,
        doorOpen: source.doorOpen,
        showTime: source.showTime,
        rehearsal: source.rehearsal,
      });
      for (const song of songs) {
        const { id, setlistId, ...songData } = song;
        await localDB.createSong({ ...songData, setlistId: newSetlist.id });
      }
      return newSetlist;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["setlists"] }); },
  });
}

export function useReorderSongs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ setlistId, songIds }: { setlistId: number; songIds: number[] }) => {
      await undoManager.pushSnapshot(setlistId, "Reorder songs");
      return localDB.reorderSongs(setlistId, songIds);
    },
    onSuccess: (_data, variables) => { qc.invalidateQueries({ queryKey: ["songs", variables.setlistId] }); },
  });
}
