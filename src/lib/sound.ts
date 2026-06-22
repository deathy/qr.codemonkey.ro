// A tiny, synthesized scan-confirmation blip — no audio asset, just a short
// soft sine via Web Audio. Kept deliberately quiet and brief.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Resume the AudioContext on the first user gesture. Browsers start it
 * suspended until then, so without this the first blip would be silent.
 */
export function initSoundUnlock(): void {
  const unlock = () => {
    const ac = getCtx();
    if (ac && ac.state === 'suspended') void ac.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
}

export function playBeep(): void {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume().catch(() => {});
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = 1320;
  // Quick fade in/out so there's no click; peak gain is low (~0.06).
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.13);
}
