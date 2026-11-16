// Short alert tones made with Web Audio, so there is no sound file to load.
// Browsers only allow sound after the user has clicked on the page, so the
// dashboard asks for one tap if the audio is still locked.

let context: AudioContext | null = null;

function audio() {
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  return context;
}

export function soundLocked() {
  const ctx = audio();
  return !ctx || ctx.state === 'suspended';
}

export async function unlockSound() {
  const ctx = audio();
  if (ctx && ctx.state === 'suspended') await ctx.resume().catch(() => {});
  return !soundLocked();
}

function tone(ctx: AudioContext, frequency: number, start: number, length: number, volume: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + length + 0.05);
}

// 'request': a two-note chime. 'reminder': three rising notes. 'overdue': a firmer double beep.
export function playSound(kind: 'request' | 'reminder' | 'overdue') {
  const ctx = audio();
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.02;
  if (kind === 'request') {
    tone(ctx, 784, t, 0.35, 0.25);
    tone(ctx, 1047, t + 0.18, 0.5, 0.25);
  } else if (kind === 'reminder') {
    tone(ctx, 659, t, 0.25, 0.3);
    tone(ctx, 880, t + 0.16, 0.25, 0.3);
    tone(ctx, 1175, t + 0.32, 0.5, 0.3);
  } else {
    tone(ctx, 523, t, 0.22, 0.35);
    tone(ctx, 523, t + 0.3, 0.22, 0.35);
    tone(ctx, 392, t + 0.6, 0.45, 0.35);
  }
}
