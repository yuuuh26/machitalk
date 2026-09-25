let utterance = null;
let recognition = null;
let contextualPhrasesSupported = true;
export function availableVoices() { return 'speechSynthesis' in window ? speechSynthesis.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('en')) : []; }
export function voicesChanged(callback) { if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', callback); }
export function stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); utterance = null; }
// Web Speech voices do not expose gender. Match the English voices whose names
// identify a male speaker, and lower the pitch when the device has none.
const MALE_VOICE = /(?:\bmale(?:\b|[_\d])|\b(?:man|david|guy|daniel|alex|fred|george|james|oliver|ryan|brian|matthew|mark|aaron|thomas|arthur|rishi|reed|evan|rocko|christopher|andrew|eric|roger|stephen)\b)/i;
export function chooseExampleVoice(voices) {
  return voices.find(voice => MALE_VOICE.test(`${voice.name} ${voice.voiceURI || ''}`)) || null;
}
export function speak(text, settings, onFinish, { example = false } = {}) {
  if (!('speechSynthesis' in window)) return false;
  stopSpeaking();
  const current = new SpeechSynthesisUtterance(text);
  utterance = current;
  current.lang = 'en-US'; current.rate = Number(settings.speed) || 1;
  const voices = availableVoices();
  const maleVoice = example ? chooseExampleVoice(voices) : null;
  const voice = maleVoice || voices.find(item => item.voiceURI === settings.voice);
  if (voice) current.voice = voice;
  if (example) current.pitch = maleVoice ? 1 : .78;
  current.onend = () => { if (utterance === current) { utterance = null; onFinish?.(true); } };
  current.onerror = () => { if (utterance === current) { utterance = null; onFinish?.(false); } };
  try { speechSynthesis.speak(current); }
  catch { utterance = null; return false; }
  return true;
}
export function speechSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
export function stopListening() { if (recognition) { const current = recognition; recognition = null; current.abort(); } }
export function buildBiasPhrases(node) {
  if (!node) return [];
  // Keep the boost modest: context should help with place names and common phrasing,
  // without forcing a suggested answer when someone says something else.
  const expressions = (node.acceptedIntents || []).flatMap(intent => intent.expressions || []);
  const names = (node.prompt || '').match(/\b(?:Osaka|Umeda|Kyoto|Tokyo|Namba|Shibuya|Shinjuku|Dotonbori|Takoyaki|Matcha)\b/gi) || [];
  return [...new Set([...names, ...expressions.filter(phrase => phrase.split(/\s+/).length <= 4)])].slice(0, 14);
}
export function listen({ onStart, onInterim, onResult, onNoSpeech, onError, node }) {
  const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Constructor) { onError('このブラウザは音声認識に対応していません。文字入力で練習できます。'); return; }
  stopSpeaking(); stopListening();
  const current = new Constructor(); recognition = current;
  current.lang = 'en-US'; current.continuous = false; current.interimResults = true; current.maxAlternatives = 5;
  if (contextualPhrasesSupported && 'phrases' in current && window.SpeechRecognitionPhrase) {
    try { current.phrases = buildBiasPhrases(node).map(phrase => new window.SpeechRecognitionPhrase(phrase, 1.5)); }
    catch { contextualPhrasesSupported = false; }
  }
  let finished = false, interim = '';
  current.onstart = () => { if (recognition === current) onStart(); };
  current.onresult = event => {
    if (recognition !== current || finished) return;
    const finalResults = [];
    for (const result of Array.from(event.results)) {
      if (result.isFinal) finalResults.push(result);
      else {
        interim = result[0]?.transcript?.trim() || interim;
      }
    }
    const suffix = finalResults.slice(1).map(result => result[0]?.transcript || '').join(' ');
    const final = finalResults.length ? Array.from(finalResults[0]).slice(0, 5).map(alternative => ({
      transcript: `${alternative.transcript} ${suffix}`.trim().replace(/\s+/g, ' '), confidence: alternative.confidence
    })) : [];
    if (final.some(item => item.transcript)) {
      finished = true; recognition = null;
      onResult(final.slice(0, 5));
    } else if (interim) onInterim?.(interim);
  };
  current.onerror = event => {
    if (recognition !== current || finished) return;
    finished = true; recognition = null;
    if (event.error === 'aborted') return;
    if (event.error === 'no-speech') onNoSpeech('声を聞き取れませんでした。');
    else if (event.error === 'phrases-not-supported') {
      contextualPhrasesSupported = false;
      onError('聞き取り補助が使えませんでした。次は補助なしで録音します。');
    }
    else if (event.error === 'audio-capture') onError('マイクの音声を取得できませんでした。端末のマイク設定を確認してください。');
    else if (['not-allowed', 'service-not-allowed'].includes(event.error)) onError('マイクの利用が許可されていません。権限を確認するか文字で答えてください。');
    else onError('音声認識が途中で止まりました。もう一度お試しください。');
  };
  current.onend = () => {
    if (recognition !== current || finished) return;
    finished = true; recognition = null;
    onNoSpeech(interim ? `途中まで「${interim}」と聞こえましたが、確定できませんでした。` : '声を聞き取れませんでした。', interim);
  };
  try { current.start(); } catch { recognition = null; onError('マイクを起動できませんでした。もう一度お試しください。'); }
}
