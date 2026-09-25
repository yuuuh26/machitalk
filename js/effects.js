const notes = {
  good: [[523, 0, .11]],
  great: [[523, 0, .09], [659, .10, .12]],
  excellent: [[523, 0, .09], [659, .09, .09], [784, .19, .17]],
  perfect: [[523, 0, .08], [659, .08, .08], [784, .16, .09], [1047, .25, .22]]
};
let context;
export function playEffect(grade) {
  if (!notes[grade]) return;
  try {
    context ||= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') context.resume();
    const now = context.currentTime;
    for (const [frequency, offset, duration] of notes[grade]) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = grade === 'good' ? 'sine' : 'triangle'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.065, now + offset + .015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + offset); oscillator.stop(now + offset + duration + .01);
    }
  } catch { /* Visual feedback still works if audio is unavailable. */ }
}
