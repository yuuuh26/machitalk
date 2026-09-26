import { loadRegistry, loadScene, nextNode, turnCount } from './scene-engine.js';
import { evaluateAlternatives } from './evaluator.js';
import { classifyAttempt, wrongAttemptAction, MAX_RECOGNITION_ISSUES, MAX_WRONG_ATTEMPTS } from './attempts.js';
import { avatarStyle, setAvatar } from './avatar.js';
import { availableVoices, voicesChanged, speak, stopSpeaking, listen, stopListening, speechSupported } from './speech.js';
import { playEffect, playClearEffect, prepareEffects } from './effects.js';
import { loadSettings, saveSettings, saveSession, loadSessions, persistenceStatus, requestPersistence, appStorageUsage, DEFAULT_SETTINGS } from './storage.js';

const app = document.querySelector('#app');
const toastElement = document.querySelector('#toast');
const URLS = { app: 'https://yuuuh26.github.io/machitalk/', repo: 'https://github.com/yuuuh26/machitalk' };
const MODES = [
  { id: 'free', label: '自由に答える', help: 'アバターの質問に、英語で自由に答えてね。' },
  { id: 'listen', label: '聞いて答える', help: '質問の少しあとに答えを読み上げるよ。覚えてから話そう。' },
  { id: 'flash', label: '2秒で見て覚える', help: '質問の少しあとに答えを2秒だけ表示するよ。覚えてから話そう。' }
];
const state = { screen: 'home', registry: null, settings: { ...DEFAULT_SETTINGS }, storage: '確認中', persistent: '確認中', filter: 'all', scene: null, meta: null, avatar: null, nodeId: null, turn: 0, feedback: null, transcript: '', answerSource: 'voice', status: 'ready', hintShown: false, hintUsed: false, answerShown: false, wrongAttempts: 0, recognitionIssues: 0, autoAttempted: false, cueStage: 'ready', cueVisible: false, cueToken: 0, cueTimer: null, session: null, streak: 0, timer: null, epoch: 0 };
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const avatar = () => state.registry.avatars.find(item => item.id === state.settings.selectedAvatar) || state.registry.avatars.find(item => item.id === state.scene?.avatar) || state.registry.avatars.find(item => item.default) || state.registry.avatars[0];
const currentNode = () => state.scene?.nodes[state.nodeId];
const practiceMode = () => MODES.find(mode => mode.id === state.settings.practiceMode) || MODES[0];

function cancelCue() {
  state.cueToken++; clearTimeout(state.cueTimer); state.cueTimer = null;
  state.cueVisible = false; state.cueStage = 'ready'; stopSpeaking();
}

function toast(message) {
  toastElement.textContent = message; toastElement.classList.add('show');
  clearTimeout(toastElement.timer); toastElement.timer = setTimeout(() => toastElement.classList.remove('show'), 2500);
}

function stopActivity() {
  state.epoch++; clearTimeout(state.timer); stopListening(); cancelCue();
}

function layout(title, content, { back = false, active = '', immersive = false } = {}) {
  app.classList.toggle('talk-active', immersive);
  if (immersive) return `<main class="talk-main">${content}</main>`;
  return `<header class="topbar"><button class="brand" data-action="home" aria-label="ホーム">Machi<span>Talk</span><small>街で使う英会話</small></button>${back ? '<button class="icon-button" data-action="home" aria-label="ホームに戻る">⌂</button>' : '<button class="icon-button" data-action="settings" aria-label="設定">⚙</button>'}</header><main>${content}</main><nav class="bottom-nav" aria-label="メインメニュー"><button data-action="home" class="${active === 'home' ? 'active' : ''}"><span>⌂</span>ホーム</button><button data-action="scenes" class="${active === 'scenes' ? 'active' : ''}"><span>▦</span>シーン</button><button data-action="history" class="${active === 'history' ? 'active' : ''}"><span>◷</span>履歴</button><button data-action="settings" class="${active === 'settings' ? 'active' : ''}"><span>⚙</span>設定</button></nav>`;
}

function sceneCards(items) {
  return `<div class="scene-grid">${items.map((item, index) => `<button class="scene-card ${escapeHTML(item.category)}" data-action="start" data-id="${escapeHTML(item.id)}"><span class="scene-emoji">${escapeHTML(item.emoji)}</span><span class="scene-details"><span class="scene-number">${String(index + 1).padStart(2, '0')} · ${item.mode.toUpperCase()}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.subtitle)}</small></span><span class="arrow">↗</span></button>`).join('')}</div>`;
}

function modePicker() {
  return `<div class="practice-picker" role="group" aria-label="練習方法">${MODES.map(item => `<button data-action="practice-mode" data-mode="${item.id}" aria-pressed="${practiceMode().id === item.id}">${item.label}</button>`).join('')}</div>`;
}

function avatarPicker() {
  return `<div class="avatar-picker" role="group" aria-label="会話のアバター">${state.registry.avatars.map(item => `<button data-action="avatar-select" data-id="${escapeHTML(item.id)}" aria-pressed="${item.id === avatar().id}" aria-label="${escapeHTML(item.name)}を選ぶ"><span class="avatar-thumb" role="img" aria-label="${escapeHTML(item.name)}の顔" style="${avatarStyle(item)}"></span><strong>${escapeHTML(item.name)}</strong><small>${item.id === avatar().id ? '✓ 選択中' : '選ぶ'}</small></button>`).join('')}</div>`;
}

function showHome() {
  stopActivity(); state.screen = 'home'; state.scene = null;
  const cover = avatar();
  app.innerHTML = layout('MachiTalk', `<section class="hero"><div class="hero-copy"><p class="eyebrow">ASK & GUIDE ENGLISH</p><h1>街で使う<span>英会話。</span></h1><p>聞いて、声に出して、伝わる楽しさを。</p><button class="primary" data-action="quick">▶ QUICK START <span>2〜4分の会話へ</span></button></div><div class="hero-person" role="img" aria-label="${escapeHTML(cover.name)}" style="${avatarStyle(cover, 'neutral')}"></div></section><div class="welcome"><strong>話せるって、もっと楽しい。</strong><span>一緒に練習しよう！</span></div><button class="mode-home" data-action="settings">練習方法：<strong>${practiceMode().label}</strong><span>設定で変更 →</span></button><p class="auto-info">各問題の最初は、アバターが話し終わってから自動で録音するよ。マイクの許可を確認してね。</p><section class="section"><div class="section-heading"><div><p class="eyebrow">CHOOSE YOUR ROLE</p><h2>今日はどちらで話す？</h2></div></div><div class="mode-row"><button class="mode-card ask" data-action="filter" data-mode="ask"><span>↗</span><strong>ASK</strong><small>自分から尋ねる・注文する</small></button><button class="mode-card guide" data-action="filter" data-mode="guide"><span>↖</span><strong>GUIDE</strong><small>外国人を案内する</small></button></div></section><section class="section"><div class="section-heading"><div><p class="eyebrow">REAL SITUATIONS</p><h2>${state.registry.scenes.length}のシーン</h2></div><button class="text-link" data-action="scenes">すべて見る →</button></div>${sceneCards(state.registry.scenes.slice(0, 4))}</section><p class="credit">Made by YUU · v1.9.0</p>`, { active: 'home' });
}

function showScenes(filter = 'all') {
  stopActivity(); state.screen = 'scenes'; state.filter = filter;
  const items = state.registry.scenes.filter(item => filter === 'all' || item.mode === filter);
  app.innerHTML = layout('シーン', `<section class="page-head"><p class="eyebrow">PICK A SITUATION</p><h1>街の会話を練習</h1><p>一つずつ、短い会話から始めよう。</p></section><div class="tabs" role="group" aria-label="シーンの種類">${[['all','すべて'],['ask','ASK'],['guide','GUIDE']].map(([id, label]) => `<button class="${filter === id ? 'selected' : ''}" data-action="filter" data-mode="${id}">${label}</button>`).join('')}</div>${sceneCards(items)}`, { active: 'scenes' });
}

async function startScene(id) {
  stopActivity(); const epoch = state.epoch;
  const meta = state.registry.scenes.find(item => item.id === id);
  if (!meta) return toast('シーンが見つかりません。');
  app.innerHTML = layout('', '<div class="loading">会話を準備しています…</div>', { back: true });
  try {
    const scene = await loadScene(meta);
    if (epoch !== state.epoch) return;
    state.scene = scene; state.meta = meta; state.nodeId = scene.startNode; state.turn = 1;
    state.feedback = null; state.transcript = ''; state.answerSource = 'voice'; state.status = 'ready'; state.hintShown = !!state.settings.hintMode; state.hintUsed = state.hintShown; state.answerShown = false; state.wrongAttempts = 0; state.recognitionIssues = 0; state.autoAttempted = false; state.streak = 0;
    state.session = { sceneId: meta.id, contentVersion: scene.contentVersion || 1, playedAt: new Date().toISOString(), completed: false, goodCount: 0, greatCount: 0, excellentCount: 0, perfectCount: 0, retryCount: 0, hintCount: 0, skippedCount: 0, duration: 0 };
    if (state.hintUsed) state.session.hintCount++;
    state.startedAt = Date.now(); state.screen = 'talk'; renderTalk(); playPrompt();
  } catch (error) { if (epoch === state.epoch) { showScenes(); toast(`読み込み失敗：${error.message}`); } }
}

function feedbackHTML() {
  if (!state.feedback) return '';
  const grade = state.feedback.grade;
  if (['good','great','excellent','perfect'].includes(grade)) return `<div class="feedback ${grade}" role="status"><strong>${grade.toUpperCase()}!</strong><small>${grade === 'perfect' ? 'すばらしい！しっかり伝わった！' : '伝わった！'}</small></div>`;
  const heading = grade === 'try-again' ? state.status === 'advancing' ? '次の問題へ' : state.answerShown ? '答えを見てもう一度' : 'もう一度試してみよう' : grade === 'uncertain' ? '聞き取りを確認してね' : 'うまく聞き取れませんでした';
  return `<div class="feedback gentle" role="status"><strong>${heading}</strong><small>${escapeHTML(state.feedback.message || 'もう一度、ゆっくり話してみよう。')}</small></div>`;
}

function renderTalk() {
  const node = currentNode(), profile = avatar();
  const grade = state.feedback?.grade;
  const success = ['good', 'great', 'excellent', 'perfect'].includes(grade);
  const moving = state.status === 'advancing';
  const mood = state.status === 'listening' ? 'listening' : state.status === 'checking' ? 'thinking' : success ? grade : state.feedback ? 'encourage' : ['question', 'answer-audio'].includes(state.cueStage) ? 'speaking' : 'neutral';
  const sparkCount = { good: 18, great: 28, excellent: 38, perfect: 54 }[grade] || 0;
  const sparks = success ? `<div class="grade-sparks" aria-hidden="true">${Array.from({ length: sparkCount }, (_, i) => `<i style="--x:${(i * 71) % 94 + 3}%;--y:${(i * 43) % 74 + 8}%;--delay:${(i % 9) * .065}s"></i>`).join('')}</div><div class="grade-aura" aria-hidden="true"></div>` : '';
  const hint = state.hintShown && !success ? `<div class="hint-panel"><strong>💡 ヒント</strong><p>使える言葉：${escapeHTML(node.hint?.words || '')}</p><p>言い出し：<b lang="en">${escapeHTML(node.hint?.starter || node.examples[0].split(' ').slice(0, 3).join(' ') + ' ...')}</b></p>${state.answerShown ? '' : '<button data-action="show-answer">全文の答えを見る</button>'}</div>` : '';
  const answer = state.answerShown && !success ? `<div class="answer-card"><span>答え合わせ · 言い方の例</span><p>${escapeHTML(node.instruction || node.task)}</p>${node.examples.map((example, i) => `<div class="answer-example"><strong lang="en">${escapeHTML(example)}</strong><button data-action="sample" data-index="${i}" aria-label="例文${i + 1}を聞く">🔊 聞く</button></div>`).join('')}<small>同じ意味なら、この例文と違う言い方でも正解になるよ。</small></div>` : '';
  const mode = practiceMode();
  const cuePending = state.cueStage !== 'ready' && !state.answerShown;
  const micLabel = state.status === 'listening' ? '停止' : state.status === 'connecting' ? '準備中' : state.autoAttempted ? '再録音' : '録音';
  const mic = !success && !moving ? `<button class="mic-button ${state.status === 'listening' ? 'recording' : ''}" data-action="mic" aria-label="${state.status === 'listening' ? '録音を終了' : state.autoAttempted ? '再録音を開始' : '録音を開始'}" ${state.status === 'checking' || state.status === 'connecting' || cuePending ? 'disabled' : ''}><span aria-hidden="true">${state.status === 'listening' ? '■' : '🎤'}</span><span>${micLabel}</span></button>` : '';
  const recordingState = state.status === 'listening' ? '<span class="capture-state recording" role="status"><i aria-hidden="true"></i>録音中…</span>' : state.status === 'connecting' ? '<span class="capture-state" role="status">マイクを準備中…</span>' : state.cueStage === 'arming' ? '<span class="capture-state" role="status">少し待って、自動で録音するよ</span>' : '';
  const task = `<div class="task-card"><div class="task-row"><div class="task-copy"><span>あなたの番 · 英語で答えよう</span><strong>${escapeHTML(node.instruction || node.task)}</strong>${recordingState}</div>${mic}</div><p class="practice-help">例文と違う言い方でも正解になるよ。</p></div>`;
  const heard = state.status === 'listening'
    ? '<div class="heard-line live" role="status" aria-live="polite"><span>聞き取り中 · あなたの英語</span><strong id="speech-live" lang="en">話すとここに表示されるよ</strong></div>'
    : state.transcript
      ? `<div class="heard-line" role="status"><span>${state.answerSource === 'typed' ? '入力した英語' : '聞き取った英語'}</span><strong lang="en">${escapeHTML(state.transcript)}</strong></div>`
      : state.feedback?.grade === 'no-speech'
        ? '<div class="heard-line unheard" role="status"><span>聞き取り結果</span><strong>声を聞き取れませんでした</strong></div>' : '';
  const cueMessage = { question: 'まず質問を聞こう', pause: '少し待ってね…', 'answer-audio': 'お手本を聞いて覚えよう', 'answer-visible': 'お手本を2秒だけ覚えよう', arming: 'まもなく自動録音', ready: '思い出して英語で話そう' }[state.cueStage];
  const cueStatus = !success && !moving && mode.id !== 'free' && state.cueStage !== 'arming' ? `<p class="cue-status" role="status">${cueMessage}</p>` : '';
  const cueFlash = !success && state.cueVisible ? `<div class="memory-flash" role="status" aria-live="assertive"><small>2秒だけ覚えよう</small><strong lang="en">${escapeHTML(node.examples[0])}</strong></div>` : '';
  const entry = !success && !moving ? `<form id="type-form" class="type-form"><label for="typed">${speechSupported() ? '聞き取りが合わないときは文字でも答えられるよ' : '文字入力で答えてね'}</label><div><input id="typed" name="typed" type="text" lang="en" autocapitalize="sentences" autocomplete="off" placeholder="英語を入力" ${cuePending ? 'disabled' : ''}><button type="submit" ${cuePending ? 'disabled' : ''}>判定</button></div></form><div class="help-row">${mode.id === 'free' || state.answerShown ? '' : '<button data-action="cue-replay">お手本をもう一度</button>'}${state.hintShown ? '' : '<button data-action="hint">💡 ヒントを見る</button>'}${state.answerShown ? '' : '<button data-action="show-answer">答えを見る</button>'}<button data-action="skip">次へ進む</button></div>` : '<p class="moving">次の会話へ…</p>';
  app.innerHTML = layout('', `<section class="conversation"><div class="scene-backdrop ${escapeHTML(state.meta.category)} ${heard ? 'with-heard' : ''} ${success ? 'celebrate ' + grade : ''}"><div id="avatar" class="avatar" role="img"></div><div class="portrait-shade" aria-hidden="true"></div>${sparks}${cueFlash}<div class="talk-overlay-head"><button class="talk-back" data-action="home" aria-label="会話を終了してホームに戻る">←</button><div class="talk-scene"><span class="mode-pill ${state.meta.mode}">${state.meta.mode.toUpperCase()}</span><h1>${escapeHTML(state.meta.emoji)} ${escapeHTML(state.meta.title)}</h1></div><span class="progress-label">${state.turn} / ${turnCount(state.scene)}</span></div><div class="talk-progress"><span style="width:${Math.round(state.turn / turnCount(state.scene) * 100)}%"></span></div>${success ? feedbackHTML() : ''}<div class="speech-card"><span class="speaker">${escapeHTML(profile.name)} says</span><p class="english" ${state.settings.captions ? '' : 'aria-label="字幕は設定で非表示"'}>${state.settings.captions ? escapeHTML(node.prompt) : '•••'}</p><button class="replay" data-action="replay" aria-label="もう一度聞く">🔊 Replay</button>${heard}</div></div></section><section class="reply">${task}${cueStatus}${hint}${!success ? feedbackHTML() : ''}${answer}${entry}</section>`, { immersive: true });
  setAvatar(document.querySelector('#avatar'), profile, mood);
}

function playPrompt() {
  cancelCue();
  const mode = practiceMode().id;
  const token = state.cueToken, epoch = state.epoch, nodeId = state.nodeId;
  const stillHere = () => state.screen === 'talk' && state.epoch === epoch && state.nodeId === nodeId && state.cueToken === token;
  const readyToAnswer = (mayRecord = true) => {
    if (!stillHere()) return;
    clearTimeout(state.cueTimer);
    if (!mayRecord || state.autoAttempted || state.answerShown || !speechSupported()) {
      state.cueStage = 'ready'; renderTalk(); return;
    }
    state.cueStage = 'arming'; renderTalk();
    // Let the device speaker and echo cancellation settle before opening the mic.
    state.cueTimer = setTimeout(() => {
      if (stillHere()) { state.cueStage = 'ready'; startRecording(); }
    }, 850);
  };
  if (mode === 'free') {
    if (!state.settings.autoPlay) return;
    state.cueStage = 'question'; renderTalk();
    const finished = success => {
      if (!stillHere()) return;
      readyToAnswer(success);
    };
    state.cueTimer = setTimeout(() => { if (stillHere()) { stopSpeaking(); finished(false); } }, 12000);
    if (!speak(currentNode().prompt, state.settings, finished)) finished(false);
    return;
  }
  const showFlash = () => {
    if (!stillHere()) return;
    state.cueVisible = true; state.cueStage = 'answer-visible'; renderTalk();
    state.cueTimer = setTimeout(() => {
      if (!stillHere()) return;
      state.cueVisible = false; readyToAnswer();
    }, 2000);
  };
  const showAnswer = () => {
    if (!stillHere()) return;
    if (mode === 'flash') { showFlash(); return; }
    state.cueStage = 'answer-audio'; renderTalk();
    const finishAnswer = success => {
      if (!stillHere()) return;
      clearTimeout(state.cueTimer);
      if (!success) { showFlash(); return; }
      readyToAnswer();
    };
    state.cueTimer = setTimeout(() => { if (stillHere()) { stopSpeaking(); finishAnswer(false); } }, 12000);
    if (!speak(currentNode().examples[0], state.settings, finishAnswer, { example: true })) finishAnswer(false);
  };
  let questionDone = false;
  const afterQuestion = () => {
    if (!stillHere() || questionDone) return;
    questionDone = true; clearTimeout(state.cueTimer);
    state.cueStage = 'pause'; renderTalk();
    state.cueTimer = setTimeout(showAnswer, 650);
  };
  state.cueStage = 'question'; renderTalk();
  state.cueTimer = setTimeout(() => { if (stillHere()) { stopSpeaking(); afterQuestion(); } }, 12000);
  if (!speak(currentNode().prompt, state.settings, afterQuestion)) afterQuestion();
}

function markHintUsed() {
  if (state.hintUsed) return;
  state.hintUsed = true; state.session.hintCount++;
}

function onRecognition(alternatives, typed = false) {
  if (state.screen !== 'talk' || state.status === 'advancing') return;
  cancelCue();
  const result = evaluateAlternatives(currentNode(), alternatives);
  state.status = 'ready'; state.transcript = result.transcript; state.answerSource = typed ? 'typed' : 'voice';
  const decision = classifyAttempt(result, { typed, issues: state.recognitionIssues });
  if (decision === 'wrong') {
    state.session.retryCount++; state.streak = 0; state.wrongAttempts++;
    const action = wrongAttemptAction(state.wrongAttempts);
    if (action !== 'retry') state.answerShown = true;
    state.feedback = { ...result, message: action === 'advance'
      ? `${MAX_WRONG_ATTEMPTS}回試したので、次の問題へ進むよ。`
      : action === 'reveal'
        ? state.wrongAttempts === 3
          ? '3回試したね。答えの文を見ながら、あと2回挑戦できるよ。'
          : '答えの文を見ながら、あと1回挑戦できるよ。'
        : `もう一度話してみよう。あと${3 - state.wrongAttempts}回で答えの文を表示するよ。` };
    if (action === 'advance') {
      state.status = 'advancing'; state.session.skippedCount++;
      renderTalk();
      const epoch = state.epoch;
      state.timer = setTimeout(() => { if (epoch === state.epoch && state.screen === 'talk' && state.status === 'advancing') advance(null); }, 1400);
    } else {
      renderTalk();
      if (state.wrongAttempts === 3) {
        document.querySelector('.answer-card')?.scrollIntoView?.({
          block: 'nearest',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
      }
    }
    return;
  }
  if (decision === 'retry' || decision === 'reveal') {
    recognitionIssue(result.transcript ? '聞き取りが不確かだったので、まだ採点しないよ。' : '声を聞き取れませんでした。', result.transcript);
    return;
  }
  state.feedback = result;
  state.session[`${result.grade}Count`]++; state.streak++;
  renderTalk(); playEffect(result.grade);
  const epoch = state.epoch;
  const reactionTime = result.grade === 'perfect' ? 2700 : result.grade === 'excellent' ? 2300 : result.grade === 'great' ? 1900 : 1550;
  state.timer = setTimeout(() => { if (epoch === state.epoch && state.screen === 'talk') advance(result); }, reactionTime);
}

function recognitionIssue(message, transcript = '') {
  if (state.screen !== 'talk' || state.status === 'advancing') return;
  state.recognitionIssues++;
  state.status = 'ready'; state.transcript = transcript; state.answerSource = 'voice';
  const remaining = MAX_RECOGNITION_ISSUES - state.recognitionIssues;
  if (remaining <= 0) state.answerShown = true;
  state.feedback = { grade: transcript ? 'uncertain' : 'no-speech', message: remaining > 0
    ? `${message} あと${remaining}回、録音ボタンを押して試せるよ。`
    : `${message} 3回試したので答えを表示するね。文字でも答えられるよ。` };
  renderTalk();
}

function startRecording() {
  if (state.screen !== 'talk' || ['connecting', 'listening', 'advancing'].includes(state.status)) return;
  stopListening(); cancelCue();
  state.autoAttempted = true;
  const nodeId = state.nodeId, epoch = state.epoch;
  const stillHere = () => state.screen === 'talk' && state.epoch === epoch && state.nodeId === nodeId;
  state.feedback = null; state.transcript = ''; state.status = 'connecting'; renderTalk();
  listen({ node: currentNode(),
    onStart: () => { if (stillHere()) { state.status = 'listening'; renderTalk(); } },
    onInterim: transcript => { if (stillHere()) { const live = document.querySelector('#speech-live'); if (live) live.textContent = transcript; } },
    onResult: alternatives => { if (stillHere()) onRecognition(alternatives); },
    onNoSpeech: (message, interim) => { if (stillHere()) recognitionIssue(message, interim); },
    onError: message => { if (stillHere()) recognitionIssue(message); }
  });
}

function advance(evaluation) {
  cancelCue();
  const next = nextNode(state.scene, currentNode(), evaluation);
  if (!next) { showClear(); return; }
  state.nodeId = next; state.turn++; state.feedback = null; state.transcript = ''; state.answerSource = 'voice'; state.hintShown = !!state.settings.hintMode; state.hintUsed = state.hintShown; state.answerShown = false; state.wrongAttempts = 0; state.recognitionIssues = 0; state.autoAttempted = false; state.status = 'ready';
  if (state.hintUsed) state.session.hintCount++;
  renderTalk(); playPrompt();
}

async function showClear() {
  stopActivity(); state.session.completed = true; state.session.duration = Math.round((Date.now() - state.startedAt) / 1000);
  state.screen = 'clear'; const epoch = state.epoch; let saved = true;
  try { await saveSession(state.session); } catch { saved = false; }
  if (state.screen !== 'clear' || epoch !== state.epoch) return;
  const s = state.session;
  const confetti = Array.from({ length: 44 }, (_, i) => `<i style="--x:${(i * 67) % 97 + 1}%;--delay:${(i % 11) * .09}s;--drift:${(i % 2 ? 1 : -1) * (25 + i % 5 * 14)}px;--hue:${(i * 61) % 360}deg"></i>`).join('');
  app.innerHTML = layout('', `<section class="clear"><div class="clear-confetti" aria-hidden="true">${confetti}</div><div class="clear-glow" aria-hidden="true"></div><div class="trophy">✦</div><p class="eyebrow">CONGRATULATIONS!</p><h1>SCENE CLEAR <span>🎉</span></h1><p class="clear-message">シーンクリア！ 伝える力がまた一歩アップ 🌟</p><h2>${escapeHTML(state.meta.title)}</h2><p>${state.turn} turns completed · ${Math.max(1, Math.round(s.duration / 60))} min</p><div class="results">${['perfect','excellent','great','good'].map(grade => `<div><span class="grade-dot ${grade}"></span><span>${grade.toUpperCase()}</span><strong>${s[`${grade}Count`]}</strong></div>`).join('')}<div><span>💡</span><span>Hints</span><strong>${s.hintCount}</strong></div><div><span>↪</span><span>Skipped</span><strong>${s.skippedCount}</strong></div></div>${saved ? '' : '<p class="save-warning">端末に履歴を保存できませんでした。設定で保存状態を確認してください。</p>'}<button class="primary wide" data-action="start" data-id="${escapeHTML(state.meta.id)}">もう一度</button><button class="secondary wide" data-action="next-scene">次のシーン</button><button class="plain wide" data-action="home">ホームへ</button></section>`, { active: 'scenes' });
  playClearEffect();
}

async function showHistory() {
  stopActivity(); state.screen = 'history';
  let rows = [], error = false;
  try { rows = await loadSessions(); } catch { error = true; }
  if (state.screen !== 'history') return;
  app.innerHTML = layout('', `<section class="page-head"><p class="eyebrow">YOUR JOURNEY</p><h1>練習の履歴</h1><p>積み重ねた会話を振り返ろう。</p></section>${error ? '<div class="empty">保存データを読み込めませんでした。</div>' : rows.length ? `<div class="history-list">${rows.map(row => { const scene = state.registry.scenes.find(item => item.id === row.sceneId); return `<div class="history-card"><span>${escapeHTML(scene?.emoji || '💬')}</span><div><strong>${escapeHTML(scene?.title || row.sceneId)}</strong><small>${escapeHTML(new Date(row.playedAt).toLocaleString('ja-JP'))}</small></div><span class="history-count">★ ${row.perfectCount || 0}</span></div>`; }).join('')}</div>` : '<div class="empty">まだ履歴はありません。最初のシーンを始めよう！</div>'}<button class="secondary wide" data-action="scenes">シーンを選ぶ</button>`, { active: 'history' });
}

async function showSettings() {
  stopActivity(); state.screen = 'settings';
  try { state.persistent = await persistenceStatus(); } catch { state.persistent = '確認できません'; }
  if (state.screen !== 'settings') return;
  const voices = availableVoices();
  app.innerHTML = layout('', `<section class="page-head"><p class="eyebrow">MAKE IT YOURS</p><h1>設定</h1></section><section class="settings-panel practice-settings"><h2>練習方法を選ぶ</h2><p class="note">ここで選んだ方法が、次に始める会話の全問題に使われるよ。</p>${modePicker()}<p class="practice-help">${practiceMode().help} 例文以外の自然な言い方も正解になるよ。</p></section><section class="settings-panel"><h2>音声と表示</h2><label class="setting-line"><span>Voice<small>端末の英語音声</small></span><select data-setting="voice"><option value="">自動選択</option>${voices.map(item => `<option value="${escapeHTML(item.voiceURI)}" ${state.settings.voice === item.voiceURI ? 'selected' : ''}>${escapeHTML(item.name)} (${escapeHTML(item.lang)})</option>`).join('')}</select></label><p class="note">見本の答えは、端末に男性英語音声があれば優先して読むよ。</p><label class="setting-line"><span>Speech speed</span><select data-setting="speed">${[.8,1,1.2].map(value => `<option value="${value}" ${Number(state.settings.speed) === value ? 'selected' : ''}>${value}×</option>`).join('')}</select></label><label class="setting-line"><span>字幕</span><input type="checkbox" data-setting="captions" ${state.settings.captions ? 'checked' : ''}></label><label class="setting-line"><span>自動読み上げ</span><input type="checkbox" data-setting="autoPlay" ${state.settings.autoPlay ? 'checked' : ''}></label><label class="setting-line"><span>ヒントモード<small>会話中に単語と言い出しを表示</small></span><input type="checkbox" data-setting="hintMode" ${state.settings.hintMode ? 'checked' : ''}></label><div class="setting-line avatar-setting"><span>会話のアバター<small>タップして切り替え。次の会話から表示するよ</small></span></div>${avatarPicker()}</section><p class="note">音声認識はChrome側のサービスを利用する場合があります。学習履歴はこの端末に保存します。</p><section class="settings-panel"><h2>端末保存</h2><div class="setting-line"><span>学習履歴</span><strong>${escapeHTML(state.storage)}</strong></div><div class="setting-line"><span>永続ストレージ</span><strong id="persist-status">${escapeHTML(state.persistent)}</strong></div><div class="setting-line"><span>アプリの使用容量<small>キャッシュ・学習履歴・設定の概算</small></span><strong id="app-storage-usage" role="status">確認中…</strong></div><button class="secondary" data-action="persist">永続ストレージを申請</button><p class="note">容量はこのアプリ専用データの概算です。ブラウザの消去操作で履歴は失われます。</p></section><section class="settings-panel"><h2>リンク</h2>${[['app','App URL'],['repo','Repository URL']].map(([key,label]) => `<div class="link-row"><span><strong>${label}</strong><small>${escapeHTML(URLS[key])}</small></span><button class="copy" data-action="copy" data-key="${key}">コピー</button></div>`).join('')}</section><p class="credit">Made by YUU · v1.9.0</p>`, { active: 'settings' });
  void updateStorageUsage();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function updateStorageUsage() {
  const element = document.querySelector('#app-storage-usage');
  try {
    const usage = await appStorageUsage();
    if (typeof document === 'undefined') return;
    if (state.screen !== 'settings' || element !== document.querySelector('#app-storage-usage')) return;
    element.textContent = usage ? `${usage.partial ? '一部のみ ' : '約'}${formatBytes(usage.cacheBytes + usage.dataBytes)}` : '確認できません';
  } catch {
    if (typeof document !== 'undefined' && state.screen === 'settings' && element === document.querySelector('#app-storage-usage')) element.textContent = '確認できません';
  }
}

app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const { action } = target.dataset;
  if (action === 'home') return showHome();
  if (action === 'scenes') return showScenes();
  if (action === 'history') return showHistory();
  if (action === 'settings') return showSettings();
  if (action === 'filter') return showScenes(target.dataset.mode);
  if (action === 'quick') { prepareEffects(); return startScene('station-guide'); }
  if (action === 'start') { prepareEffects(); return startScene(target.dataset.id); }
  if (action === 'next-scene') { prepareEffects(); const scenes = state.registry.scenes; return startScene(scenes[(scenes.findIndex(s => s.id === state.meta.id) + 1) % scenes.length].id); }
  if (action === 'practice-mode' && state.screen === 'settings') {
    const mode = MODES.find(item => item.id === target.dataset.mode);
    if (!mode || mode.id === practiceMode().id) return;
    state.settings.practiceMode = mode.id;
    try { await saveSettings(state.settings); } catch { toast('練習方法を保存できませんでした'); }
    showSettings();
    return;
  }
  if (action === 'avatar-select' && state.screen === 'settings') {
    const selected = state.registry.avatars.find(item => item.id === target.dataset.id);
    if (!selected || selected.id === avatar().id) return;
    state.settings.selectedAvatar = selected.id;
    try { await saveSettings(state.settings); toast(`${selected.name}を選びました`); }
    catch { toast('アバターの選択を保存できませんでした'); }
    showSettings();
    return;
  }
  if (action === 'cue-replay' && state.screen === 'talk') {
    stopListening(); state.status = 'ready'; playPrompt(); return;
  }
  if ((action === 'replay' || action === 'sample') && state.screen === 'talk') {
    if (state.status === 'listening') { stopListening(); state.status = 'ready'; renderTalk(); }
    if (action === 'replay' && practiceMode().id !== 'free' && !state.answerShown) return playPrompt();
    cancelCue();
    return speak(action === 'replay' ? currentNode().prompt : currentNode().examples[Number(target.dataset.index) || 0], state.settings, undefined, { example: action === 'sample' });
  }
  if (action === 'show-answer' && state.screen === 'talk') { stopListening(); state.status = 'ready'; cancelCue(); markHintUsed(); state.answerShown = true; renderTalk(); return; }
  if (action === 'mic' && state.screen === 'talk') {
    if (state.cueStage !== 'ready' && !state.answerShown) return;
    if (state.status === 'listening') { stopListening(); state.status = 'ready'; renderTalk(); return; }
    prepareEffects();
    return startRecording();
  }
  if (action === 'hint' && state.screen === 'talk') { markHintUsed(); state.hintShown = true; renderTalk(); return; }
  if (action === 'skip' && state.screen === 'talk' && state.status !== 'advancing') { stopListening(); state.session.skippedCount++; state.streak = 0; advance(null); return; }
  if (action === 'copy') { try { await navigator.clipboard.writeText(URLS[target.dataset.key]); toast('コピーしました'); } catch { toast('コピーできませんでした。URLを選択してコピーしてください。'); } return; }
  if (action === 'persist') { try { await requestPersistence(); state.persistent = await persistenceStatus(); document.querySelector('#persist-status').textContent = state.persistent; toast(state.persistent === '有効' ? '永続ストレージが有効です' : '永続ストレージは未取得です'); } catch { toast('状態を確認できませんでした'); } }
});

app.addEventListener('submit', event => {
  if (event.target.id !== 'type-form') return;
  event.preventDefault(); const text = new FormData(event.target).get('typed')?.trim();
  if (state.screen !== 'talk' || state.status === 'advancing') return;
  if (state.cueStage !== 'ready' && !state.answerShown) return toast('アバターの声やお手本が終わってから答えてね。');
  if (!text) return toast('英語で入力してください。');
  prepareEffects();
  stopListening(); onRecognition([{ transcript: text, confidence: 1 }], true);
});

app.addEventListener('change', async event => {
  const key = event.target.dataset.setting; if (!key) return;
  state.settings[key] = event.target.type === 'checkbox' ? event.target.checked : key === 'speed' ? Number(event.target.value) : event.target.value;
  try { await saveSettings(state.settings); toast('設定を保存しました'); } catch { toast('設定を保存できませんでした'); }
});

async function boot() {
  try {
    state.registry = await loadRegistry();
    try { state.settings = await loadSettings(); state.storage = '使用中'; } catch { state.storage = '利用できません'; }
    showHome(); voicesChanged(() => { if (state.screen === 'settings') showSettings(); });
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('./sw.js').catch(() => {});
  } catch (error) { app.innerHTML = `<div class="empty">起動できませんでした。ページを再読み込みしてください。<small>${escapeHTML(error.message)}</small></div>`; }
}
boot();
