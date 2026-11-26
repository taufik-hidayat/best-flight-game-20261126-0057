// Sound, synthesised live with WebAudio — no audio files. A propeller drone
// that follows the throttle, wind that rises with airspeed, a chime when a
// ring is flown, a thud on touchdown and a crunch on a crash. Everything
// starts on the first user gesture, as browsers require.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      // Engine: two detuned saws through a low-pass, the classic prop drone.
      engineOsc1 = ctx.createOscillator();
      engineOsc1.type = 'sawtooth';
      engineOsc1.frequency.value = 62;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 93;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc1.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc1.start();
      engineOsc2.start();

      // Wind: looped noise through a band-pass that opens with speed.
      const noiseLength = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < noiseLength; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      noise.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  /** Call from any user gesture; also resumes a suspended context. */
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /** Per-frame: engine pitch follows throttle, wind follows airspeed. */
  function update(throttle, speed, flying) {
    if (!started || muted) return;
    const t = ctx.currentTime;
    engineOsc1.frequency.setTargetAtTime(58 + throttle * 95, t, 0.1);
    engineOsc2.frequency.setTargetAtTime(87 + throttle * 142, t, 0.1);
    engineGain.gain.setTargetAtTime(flying ? 0.05 + throttle * 0.1 : 0.03 + throttle * 0.05, t, 0.15);
    const wind = Math.max(0, (speed - 18) / 70);
    windGain.gain.setTargetAtTime(flying ? wind * 0.16 : 0, t, 0.2);
    windFilter.frequency.setTargetAtTime(500 + speed * 9, t, 0.2);
  }

  function tone(freq, at, dur, type, vol) {
    if (!started) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime + at);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + dur + 0.05);
  }

  /** A bright three-note chime for a ring flown. */
  function ringChime() {
    if (!started || muted) return;
    tone(660, 0, 0.22, 'sine', 0.22);
    tone(880, 0.07, 0.22, 'sine', 0.22);
    tone(1320, 0.14, 0.4, 'sine', 0.2);
  }

  /** A low thud for a touchdown. */
  function touchdown() {
    if (!started || muted) return;
    tone(70, 0, 0.25, 'sine', 0.5);
    tone(140, 0, 0.12, 'triangle', 0.25);
  }

  /** A crunch of noise for a crash. */
  function crash() {
    if (!started || muted) return;
    const dur = 0.7;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    tone(55, 0, 0.6, 'sine', 0.4);
  }

  /** A short click for menus. */
  function click() {
    if (!started || muted) return;
    tone(1200, 0, 0.06, 'square', 0.08);
  }

  /** A rising fanfare for a finished courier run. */
  function fanfare() {
    if (!started || muted) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.35, 'triangle', 0.2));
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  function isMuted() {
    return muted;
  }

  return { unlock, update, ringChime, touchdown, crash, click, fanfare, setMuted, isMuted };
}
