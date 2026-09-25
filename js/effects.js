const melodies = {
  good: [[523, 0, .13], [659, .11, .20]],
  great: [[523, 0, .13], [659, .10, .13], [784, .22, .25]],
  excellent: [[523, 0, .12], [659, .10, .12], [784, .20, .12], [1047, .31, .20], [1318, .47, .36]],
  perfect: [[523, 0, .11], [659, .09, .11], [784, .18, .12], [1047, .28, .15], [1318, .41, .18], [1568, .56, .16], [2093, .75, .49]]
};
let context, master;
export function prepareEffects() {
  try {
    context ||= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') void context.resume().catch(() => {});
    if (!master) {
      master = context.createGain(); master.gain.value = .32;
      master.connect(context.destination);
    }
  } catch { /* Sound is optional if the browser blocks audio. */ }
}
export function playEffect(grade) {
  if (!melodies[grade]) return;
  try {
    prepareEffects();
    if (!context || !master) return;
    const now = context.currentTime;
    for (const [frequency, offset, duration] of melodies[grade]) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = grade === 'good' ? 'sine' : 'triangle'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.19, now + offset + .016);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      oscillator.connect(gain).connect(master);
      oscillator.start(now + offset); oscillator.stop(now + offset + duration + .015);
    }
    if (grade === 'excellent' || grade === 'perfect') {
      const bass = context.createOscillator(), gain = context.createGain();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(170, now);
      bass.frequency.exponentialRampToValueAtTime(55, now + .22);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.24, now + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .27);
      bass.connect(gain).connect(master);
      bass.start(now); bass.stop(now + .3);
    }
  } catch { /* The on-screen reaction still works without audio. */ }
}
