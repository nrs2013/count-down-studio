import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { undoManager } from "@/lib/undo-manager";
import { useToast } from "@/hooks/use-toast";

export function useUndo() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const performUndo = useCallback(async () => {
    if (!undoManager.canUndo()) return;

    const result = await undoManager.undo();
    if (result) {
      qc.invalidateQueries({ queryKey: ["setlists"] });
      qc.invalidateQueries({ queryKey: ["songs", result.setlistId] });
      toast({
        description: `Undo: ${result.label}`,
        duration: 2000,
      });
    }
  }, [qc, toast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
          return;
        }
        e.preventDefault();
        performUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [performUndo]);

  return { performUndo };
}
