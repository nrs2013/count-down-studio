import { createContext, useContext } from "react";
import { useCountdownBroadcaster, type CountdownState } from "./use-countdown-broadcast";

interface AppModeContextValue {
  outputOpen: boolean;
  outputFullscreen: boolean;
  openOutputWindow: () => void;
  closeOutputWindow: () => void;
  toggleOutputWindow: () => void;
  broadcast: (state: CountdownState) => void;
  requestOutputFullscreen: () => void;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const { broadcast, openOutputWindow, closeOutputWindow, toggleOutputWindow, outputOpen, outputFullscreen, requestOutputFullscreen } = useCountdownBroadcaster();

  return (
    <AppModeContext.Provider value={{
      outputOpen,
      outputFullscreen,
      openOutputWindow,
      closeOutputWindow,
      toggleOutputWindow,
      broadcast,
      requestOutputFullscreen,
    }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const ctx = useContext(AppModeContext);
  if (!ctx) throw new Error("useAppMode must be used within AppModeProvider");
  return ctx;
}
