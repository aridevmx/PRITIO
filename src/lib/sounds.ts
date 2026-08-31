export type SoundName =
  | "taskCompleted"
  | "notification"
  | "meetingReminder"
  | "pomodoroTick"
  | "pomodoroEnd";

const STORAGE_KEY = "pritio:soundsEnabled";

export function areSoundsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setSoundsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "false");
  } catch {
    /* localStorage no disponible — ignorar */
  }
}

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

interface Note {
  freq: number;
  start: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

const SOUNDS: Record<SoundName, Note[]> = {
  taskCompleted: [
    { freq: 783.99, start: 0, duration: 0.09, type: "sine", gain: 0.22 },
    { freq: 1174.66, start: 0.08, duration: 0.16, type: "sine", gain: 0.22 },
  ],
  notification: [
    { freq: 659.25, start: 0, duration: 0.08, type: "sine", gain: 0.18 },
    { freq: 987.77, start: 0.07, duration: 0.14, type: "sine", gain: 0.18 },
  ],
  meetingReminder: [
    { freq: 523.25, start: 0, duration: 0.1, type: "sine", gain: 0.2 },
    { freq: 523.25, start: 0.14, duration: 0.1, type: "sine", gain: 0.2 },
  ],
  pomodoroTick: [
    { freq: 900, start: 0, duration: 0.02, type: "square", gain: 0.05 },
  ],
  pomodoroEnd: [
    { freq: 659.25, start: 0, duration: 0.12, type: "sine", gain: 0.2 },
    { freq: 783.99, start: 0.16, duration: 0.12, type: "sine", gain: 0.2 },
    { freq: 987.77, start: 0.32, duration: 0.22, type: "sine", gain: 0.22 },
  ],
};

export function playSound(name: SoundName): void {
  if (!areSoundsEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const now = ctx.currentTime;
  for (const note of SOUNDS[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type;
    osc.frequency.value = note.freq;

    const t0 = now + note.start;
    const tEnd = t0 + note.duration;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(note.gain, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, tEnd);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(tEnd + 0.05);
  }
}
