let utterance = null;
let recognition = null;
export function availableVoices() { return speechSynthesis.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('en')); }
export function voicesChanged(callback) { if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', callback); }
export function stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); utterance = null; }
export function speak(text, settings) {
  if (!('speechSynthesis' in window)) return false;
  stopSpeaking();
  utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US'; utterance.rate = Number(settings.speed) || 1;
  const voice = availableVoices().find(item => item.voiceURI === settings.voice);
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
  return true;
}
export function speechSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
export function stopListening() { if (recognition) { const current = recognition; recognition = null; current.abort(); } }
export function listen({ onStart, onResult, onNoSpeech, onError }) {
  const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Constructor) { onError('このブラウザは音声認識に対応していません。文字入力で練習できます。'); return; }
  stopSpeaking(); stopListening();
  const current = new Constructor(); recognition = current;
  current.lang = 'en-US'; current.continuous = false; current.interimResults = false; current.maxAlternatives = 1;
  let finished = false;
  current.onstart = () => { if (recognition === current) onStart(); };
  current.onresult = event => {
    if (recognition !== current || finished) return;
    finished = true; recognition = null;
    const result = event.results[0]?.[0];
    result?.transcript?.trim() ? onResult(result.transcript, result.confidence) : onNoSpeech();
  };
  current.onerror = event => {
    if (recognition !== current || finished) return;
    finished = true; recognition = null;
    if (event.error === 'aborted') return;
    if (['no-speech', 'audio-capture'].includes(event.error)) onNoSpeech();
    else onError(event.error === 'not-allowed' ? 'マイク権限を確認してください。文字入力でも練習できます。' : '認識できませんでした。もう一度お試しください。');
  };
  current.onend = () => {
    if (recognition !== current || finished) return;
    finished = true; recognition = null; onNoSpeech();
  };
  try { current.start(); } catch { recognition = null; onError('マイクを起動できませんでした。もう一度お試しください。'); }
}
