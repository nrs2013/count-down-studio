import { useState, useRef, useEffect } from "react";
import { type MidiDevice, type MidiMessage } from "@/hooks/use-midi";
import { Wifi, WifiOff, Radio, ChevronDown, RefreshCw } from "lucide-react";
import { UI_FONT, MONO_FONT } from "@/lib/time-utils";

interface MidiStatusProps {
  isSupported: boolean;
  isConnected: boolean;
  devices: MidiDevice[];
  lastMessage: MidiMessage | null;
  onReconnect: () => void;
}

function commandName(cmd: number): string {
  switch (cmd) {
    case 0x80: return "Note OFF";
    case 0x90: return "Note ON";
    case 0xa0: return "Aftertouch";
    case 0xb0: return "CC";
    case 0xc0: return "Prog Change";
    case 0xd0: return "Ch Pressure";
    case 0xe0: return "Pitch Bend";
    default: return `0x${cmd.toString(16)}`;
  }
}

export function MidiStatus({
  isSupported,
  isConnected,
  devices,
  lastMessage,
  onReconnect,
}: MidiStatusProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [messageLog, setMessageLog] = useState<MidiMessage[]>([]);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (lastMessage) {
      setMessageLog((prev) => [lastMessage, ...prev].slice(0, 8));
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 150);
      return () => clearTimeout(t);
    }
  }, [lastMessage]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const statusColor = !isSupported
    ? "rgba(239,68,68,0.8)"
    : isConnected
      ? "rgba(52,211,153,0.8)"
      : "rgba(251,191,36,0.8)";

  const statusText = !isSupported
    ? "MIDI N/A"
    : isConnected
      ? devices.length > 0 ? devices[0].name : "Connected"
      : "Waiting...";

  const StatusIcon = !isSupported ? WifiOff : isConnected ? Wifi : Radio;

  return (
    <div ref={ref} className="relative" data-testid="midi-status">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200"
        style={{
          fontFamily: UI_FONT,
          background: "#1c1b19",
          border: `1px solid ${statusColor.replace("0.8", "0.3")}`,
          color: statusColor,
          backdropFilter: "blur(8px)",
        }}
        data-testid="button-midi-dropdown"
      >
        <StatusIcon className={`w-3 h-3 ${!isSupported ? "" : isConnected ? "" : "animate-pulse"}`} />
        <span className="max-w-[120px] truncate">{statusText}</span>
        {flash && (
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "#4ade80", boxShadow: "0 0 6px #4ade80" }}
          />
        )}
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 min-w-[280px] rounded-sm py-2 z-[100]"
          style={{
            background: "rgba(18,18,26,0.95)",
            border: "1px solid #2c2a27",
            backdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/30" style={{ fontFamily: UI_FONT }}>
            MIDI Status
          </div>

          <div className="px-3 py-1.5 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
            <span className="text-[12px] text-white/80" style={{ fontFamily: UI_FONT }}>
              {!isSupported ? "Not supported in this browser" : isConnected ? "Connected" : "Waiting for device..."}
            </span>
          </div>

          {!isSupported && (
            <div className="px-3 py-1.5 text-[11px] text-red-400/80" style={{ fontFamily: UI_FONT }}>
              Chrome or Edge required
            </div>
          )}

          {isSupported && !isConnected && (
            <div className="px-3 py-1.5 text-[11px] text-amber-400/70" style={{ fontFamily: UI_FONT }}>
              Connect a USB/Bluetooth MIDI device
            </div>
          )}

          {isConnected && devices.length > 0 && (
            <div className="px-3 py-1">
              {devices.map((d) => (
                <div key={d.id} className="text-[11px] text-white/60 py-0.5" style={{ fontFamily: UI_FONT }}>
                  {d.name}
                  {d.manufacturer !== "Unknown" && (
                    <span className="text-white/30 ml-1">({d.manufacturer})</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div
            className="px-3 py-1.5 mt-1"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 mb-1" style={{ fontFamily: UI_FONT }}>
              Message Log {messageLog.length > 0 ? `(${messageLog.length})` : ""}
            </div>
            {messageLog.length === 0 ? (
              <div className="text-[11px] text-white/30 italic" style={{ fontFamily: UI_FONT }}>
                No messages received yet
              </div>
            ) : (
              <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
                {messageLog.map((msg, i) => (
                  <div
                    key={`${msg.timestamp}-${i}`}
                    className="text-[11px] text-white/70 flex items-center gap-1"
                    style={{ fontFamily: MONO_FONT }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: msg.command === 0x90 && msg.velocity > 0 ? "#4ade80" : "#64748b",
                      }}
                    />
                    <span className="text-white/40 w-[60px] flex-shrink-0">{commandName(msg.command)}</span>
                    <span>N:{msg.note}</span>
                    <span className="text-white/40">Ch:{msg.channel + 1}</span>
                    <span className="text-white/40">V:{msg.velocity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="px-3 pt-2 mt-1"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReconnect();
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] text-white/60 hover:text-white/90 transition-colors duration-200"
              style={{
                background: "#1c1b19",
                border: "1px solid #201e1c",
              }}
              data-testid="button-midi-reconnect"
            >
              <RefreshCw className="w-3 h-3" />
              Reconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
