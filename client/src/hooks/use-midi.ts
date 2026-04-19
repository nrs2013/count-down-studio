import { useState, useEffect, useCallback, useRef } from "react";

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiMessage {
  command: number;
  note: number;
  velocity: number;
  channel: number;
  timestamp: number;
}

interface UseMidiOptions {
  onMessage?: (message: MidiMessage) => void;
  onNoteOn?: (note: number, velocity: number, channel: number) => void;
}

export function useMidi(options: UseMidiOptions = {}) {
  const [isSupported, setIsSupported] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [lastMessage, setLastMessage] = useState<MidiMessage | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
    if (!event.data || event.data.length < 2) return;

    const [status, note, velocity] = event.data;
    const command = status & 0xf0;
    const channel = status & 0x0f;

    const message: MidiMessage = {
      command,
      note,
      velocity: velocity || 0,
      channel,
      timestamp: event.timeStamp,
    };

    console.log(`[MIDI] Message: cmd=0x${command.toString(16)} note=${note} vel=${velocity} ch=${channel + 1} raw=[${Array.from(event.data).map(b => '0x' + b.toString(16)).join(',')}]`);

    setLastMessage(message);
    optionsRef.current.onMessage?.(message);

    if (command === 0x90 && velocity > 0) {
      console.log(`[MIDI] Note ON: note=${note} vel=${velocity} ch=${channel + 1}`);
      optionsRef.current.onNoteOn?.(note, velocity, channel);
    }
  }, []);

  const connectDevices = useCallback((midiAccess: MIDIAccess) => {
    const inputDevices: MidiDevice[] = [];
    midiAccess.inputs.forEach((input) => {
      inputDevices.push({
        id: input.id,
        name: input.name || "Unknown Device",
        manufacturer: input.manufacturer || "Unknown",
      });
      input.onmidimessage = handleMidiMessage as any;
    });
    setDevices(inputDevices);
    setIsConnected(inputDevices.length > 0);
  }, [handleMidiMessage]);

  const initialize = useCallback(async () => {
    if (!navigator.requestMIDIAccess) {
      console.warn("[MIDI] Web MIDI API is not supported in this browser");
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    console.log("[MIDI] Requesting MIDI access...");

    try {
      const midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = midiAccess;
      console.log("[MIDI] Access granted. Inputs:", midiAccess.inputs.size, "Outputs:", midiAccess.outputs.size);
      midiAccess.inputs.forEach((input) => {
        console.log("[MIDI] Input device:", input.name, "| manufacturer:", input.manufacturer, "| state:", input.state, "| connection:", input.connection);
      });
      connectDevices(midiAccess);

      midiAccess.onstatechange = (e) => {
        const port = (e as any).port;
        console.log("[MIDI] State change:", port?.name, port?.type, port?.state, port?.connection);
        connectDevices(midiAccess);
      };
    } catch (err) {
      console.error("[MIDI] Access denied:", err);
      setIsConnected(false);
    }
  }, [connectDevices]);

  useEffect(() => {
    initialize();

    return () => {
      if (midiAccessRef.current) {
        midiAccessRef.current.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
      }
    };
  }, [initialize]);

  return {
    isSupported,
    isConnected,
    devices,
    lastMessage,
    reconnect: initialize,
  };
}
