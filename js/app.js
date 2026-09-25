import { loadRegistry, loadScene, nextNode, turnCount } from './scene-engine.js';
import { evaluate } from './evaluator.js';
import { avatarStyle, setAvatar } from './avatar.js';
import { availableVoices, voicesChanged, speak, stopSpeaking, listen, stopListening, speechSupported } from './speech.js';
import { playEffect } from './effects.js';
import { loadSettings, saveSettings, saveSession, loadSessions, persistenceStatus, requestPersistence, DEFAULT_SETTINGS } from './storage.js';

const app = document.querySelector('#app');
const toastElement = document.querySelector('#toast');
const URLS = { app: 'https://yuuuh26.github.io/machitalk/', repo: 'https://github.com/yuuuh26/machitalk' };
const state = { screen: 'home', registry: null, settings: { ...DEFAULT_SETTINGS }, storage: '確認中', persistent: '確認中', filter: 'all', scene: null, meta: null, avatar: null, nodeId: null, turn: 0, feedback: null, transcript: '', status: 'ready', hintShown: false, session: null, streak: 0, timer: null, epoch: 0 };
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const avatar = () => state.registry.avatars.find(item => item.id === state.settings.selectedAvatar) || state.registry.avatars.find(item => item.id === state.scene?.avatar) || state.registry.avatars.find(item => item.default) || state.registry.avatars[0];
const currentNode = () => state.scene?.nodes[state.nodeId];

function toast(message) {
  toastElement.textContent = message; toastElement.classList.add('show');
  clearTimeout(toastElement.timer); toastElement.timer = setTimeout(() => toastElement.classList.remove('show'), 2500);
}

function stopActivity() {
  state.epoch++; clearTimeout(state.timer); stopListening(); stopSpeaking();
}

function layout(title, content, { back = false, active = '', immersive = false } = {}) {
  app.classList.toggle('talk-active', immersive);
  if (immersive) return `<main class="talk-main">${content}</main>`;
  return `<header class="topbar"><button class="brand" data-action="home" aria-label="ホーム">Machi<span>Talk</span><small>街で使う英会話</small></button>${back ? '<button class="icon-button" data-action="home" aria-label="ホームに戻る">⌂</button>' : '<button class="icon-button" data-action="settings" aria-label="設定">⚙</button>'}</header><main>${content}</main><nav class="bottom-nav" aria-label="メインメニュー"><button data-action="home" class="${active === 'home' ? 'active' : ''}"><span>⌂</span>ホーム</button><button data-action="scenes" class="${active === 'scenes' ? 'active' : ''}"><span>▦</span>シーン</button><button data-action="history" class="${active === 'history' ? 'active' : ''}"><span>◷</span>履歴</button><button data-action="settings" class="${active === 'settings' ? 'active' : ''}"><span>⚙</span>設定</button></nav>`;
}

function sceneCards(items) {
  return `<div class="scene-grid">${items.map((item, index) => `<button class="scene-card ${escapeHTML(item.category)}" data-action="start" data-id="${escapeHTML(item.id)}"><span class="scene-emoji">${escapeHTML(item.emoji)}</span><span class="scene-details"><span class="scene-number">${String(index + 1).padStart(2, '0')} · ${item.mode.toUpperCase()}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.subtitle)}</small></span><span class="arrow">↗</span></button>`).join('')}</div>`;
}

function showHome() {
  stopActivity(); state.screen = 'home'; state.scene = null;
  const cover = avatar();
  app.innerHTML = layout('MachiTalk', `<section class="hero"><div class="hero-copy"><p class="eyebrow">ASK & GUIDE ENGLISH</p><h1>街で使う<span>英会話。</span></h1><p>聞いて、声に出して、伝わる楽しさを。</p><button class="primary" data-action="quick">▶ QUICK START <span>2〜4分の会話へ</span></button></div><div class="hero-person" role="img" aria-label="Aiko" style="${avatarStyle(cover, 'neutral')}"></div></section><div class="welcome"><strong>話せるって、もっと楽しい。</strong><span>一緒に練習しよう！</span></div><section class="section"><div class="section-heading"><div><p class="eyebrow">CHOOSE YOUR ROLE</p><h2>今日はどちらで話す？</h2></div></div><div class="mode-row"><button class="mode-card ask" data-action="filter" data-mode="ask"><span>↗</span><strong>ASK</strong><small>自分から尋ねる・注文する</small></button><button class="mode-card guide" data-action="filter" data-mode="guide"><span>↖</span><strong>GUIDE</strong><small>外国人を案内する</small></button></div></section><section class="section"><div class="section-heading"><div><p class="eyebrow">REAL SITUATIONS</p><h2>8つのシーン</h2></div><button class="text-link" data-action="scenes">すべて見る →</button></div>${sceneCards(state.registry.scenes.slice(0, 4))}</section><p class="credit">Made by YUU · v1.1.0</p>`, { active: 'home' });
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
    state.feedback = null; state.transcript = ''; state.status = 'ready'; state.hintShown = false; state.streak = 0;
    state.session = { sceneId: meta.id, contentVersion: scene.contentVersion || 1, playedAt: new Date().toISOString(), completed: false, goodCount: 0, greatCount: 0, excellentCount: 0, perfectCount: 0, retryCount: 0, hintCount: 0, skippedCount: 0, duration: 0 };
    state.startedAt = Date.now(); state.screen = 'talk'; renderTalk(); playPrompt();
  } catch (error) { if (epoch === state.epoch) { showScenes(); toast(`読み込み失敗：${error.message}`); } }
}

function feedbackHTML() {
  if (!state.feedback) return '';
  const grade = state.feedback.grade;
  if (['good','great','excellent','perfect'].includes(grade)) return `<div class="feedback ${grade}" role="status"><div class="particles" aria-hidden="true">${Array.from({length: grade === 'perfect' ? 9 : grade === 'excellent' ? 6 : 3}, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div><strong>${grade === 'perfect' ? '✨ ' : ''}${grade.toUpperCase()}!${grade === 'perfect' ? ' ✨' : ''}</strong><small>伝わった！</small></div>`;
  return `<div class="feedback gentle" role="status"><strong>${grade === 'no-speech' ? 'うまく聞き取れませんでした' : 'TRY AGAIN'}</strong><small>${escapeHTML(state.feedback.message || '別の言い方で試してみよう。')}</small></div>`;
}

function renderTalk() {
  const node = currentNode(), profile = avatar();
  const mood = state.status === 'listening' ? 'listening' : state.status === 'checking' ? 'thinking' : state.feedback && ['good','great','excellent','perfect'].includes(state.feedback.grade) ? state.feedback.grade : state.feedback ? 'encourage' : 'neutral';
  const success = state.feedback && ['good','great','excellent','perfect'].includes(state.feedback.grade);
  app.innerHTML = layout('', `<section class="conversation"><div class="scene-backdrop ${escapeHTML(state.meta.category)}"><div id="avatar" class="avatar" role="img"></div><div class="portrait-shade" aria-hidden="true"></div><div class="talk-overlay-head"><button class="talk-back" data-action="home" aria-label="会話を終了してホームに戻る">←</button><div class="talk-scene"><span class="mode-pill ${state.meta.mode}">${state.meta.mode.toUpperCase()}</span><h1>${escapeHTML(state.meta.emoji)} ${escapeHTML(state.meta.title)}</h1></div><span class="progress-label">${state.turn} / ${turnCount(state.scene)}</span></div><div class="talk-progress"><span style="width:${Math.round(state.turn / turnCount(state.scene) * 100)}%"></span></div>${success ? feedbackHTML() : ''}<div class="speech-card"><span class="speaker">${escapeHTML(profile.name)} says</span><p class="english" ${state.settings.captions ? '' : 'aria-label="字幕は設定で非表示"'}>${state.settings.captions ? escapeHTML(node.prompt) : '•••'}</p><button class="replay" data-action="replay" aria-label="もう一度聞く">🔊 Replay</button></div></div></section><section class="reply"><div class="reply-title"><span>YOUR TURN</span><p>${escapeHTML(node.task)}</p></div>${state.transcript ? `<div class="transcript"><small>聞き取った英語</small><p>${escapeHTML(state.transcript)}</p></div>` : ''}${!success ? feedbackHTML() : ''}${state.status === 'checking' ? '<p class="checking">⏳ Checking...</p>' : ''}${!success ? `<button class="mic-button ${state.status === 'listening' ? 'recording' : ''}" data-action="mic" ${state.status === 'checking' ? 'disabled' : ''}>${state.status === 'listening' ? '🔴 Listening...' : '🎤 話す'}</button><form id="type-form" class="type-form"><label for="typed">${speechSupported() ? '声が使えないときは文字入力' : '文字入力で練習'}</label><div><input id="typed" name="typed" type="text" lang="en" autocapitalize="sentences" autocomplete="off" placeholder="Type your reply in English"><button type="submit">判定</button></div></form><div class="help-row"><button data-action="retry">もう一度</button><button data-action="hint">回答例を見る</button><button data-action="skip">このまま進む</button></div>${state.hintShown ? `<div class="hint">例：${escapeHTML(node.examples[0])}</div>` : ''}` : '<p class="moving">次の会話へ…</p>'}</section>`, { immersive: true });
  setAvatar(document.querySelector('#avatar'), profile, mood);
}

function playPrompt() { if (state.settings.autoPlay) speak(currentNode().prompt, state.settings); }

function onRecognition(transcript, confidence) {
  if (state.screen !== 'talk') return;
  state.status = 'checking'; state.transcript = transcript; renderTalk();
  const result = evaluate(currentNode(), transcript, confidence);
  state.feedback = result; state.status = 'ready';
  if (result.grade === 'try-again') { state.session.retryCount++; state.streak = 0; result.message = '意味が伝わる表現をもう一度試してみよう。'; renderTalk(); return; }
  if (result.grade === 'no-speech') { result.message = 'マイクを押してもう一度話してみよう。'; renderTalk(); return; }
  state.session[`${result.grade}Count`]++; state.streak++;
  renderTalk(); playEffect(result.grade);
  const epoch = state.epoch;
  const reactionTime = result.grade === 'perfect' ? 1900 : result.grade === 'excellent' ? 1600 : 1250;
  state.timer = setTimeout(() => { if (epoch === state.epoch && state.screen === 'talk') advance(result); }, reactionTime);
}

function advance(evaluation) {
  const next = nextNode(state.scene, currentNode(), evaluation);
  if (!next) { showClear(); return; }
  state.nodeId = next; state.turn++; state.feedback = null; state.transcript = ''; state.hintShown = false; state.status = 'ready';
  renderTalk(); playPrompt();
}

async function showClear() {
  stopActivity(); state.session.completed = true; state.session.duration = Math.round((Date.now() - state.startedAt) / 1000);
  state.screen = 'clear'; let saved = true;
  try { await saveSession(state.session); } catch { saved = false; }
  const s = state.session;
  app.innerHTML = layout('', `<section class="clear"><div class="trophy">✦</div><p class="eyebrow">WELL DONE!</p><h1>SCENE CLEAR <span>🎉</span></h1><h2>${escapeHTML(state.meta.title)}</h2><p>${state.turn} turns completed · ${Math.max(1, Math.round(s.duration / 60))} min</p><div class="results">${['perfect','excellent','great','good'].map(grade => `<div><span class="grade-dot ${grade}"></span><span>${grade.toUpperCase()}</span><strong>${s[`${grade}Count`]}</strong></div>`).join('')}<div><span>💡</span><span>Hints</span><strong>${s.hintCount}</strong></div><div><span>↪</span><span>Skipped</span><strong>${s.skippedCount}</strong></div></div>${saved ? '' : '<p class="save-warning">端末に履歴を保存できませんでした。設定で保存状態を確認してください。</p>'}<button class="primary wide" data-action="start" data-id="${escapeHTML(state.meta.id)}">もう一度</button><button class="secondary wide" data-action="next-scene">次のシーン</button><button class="plain wide" data-action="home">ホームへ</button></section>`, { active: 'scenes' });
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
  app.innerHTML = layout('', `<section class="page-head"><p class="eyebrow">MAKE IT YOURS</p><h1>設定</h1></section><section class="settings-panel"><h2>音声と表示</h2><label class="setting-line"><span>Voice<small>端末の英語音声</small></span><select data-setting="voice"><option value="">自動選択</option>${voices.map(item => `<option value="${escapeHTML(item.voiceURI)}" ${state.settings.voice === item.voiceURI ? 'selected' : ''}>${escapeHTML(item.name)} (${escapeHTML(item.lang)})</option>`).join('')}</select></label><label class="setting-line"><span>Speech speed</span><select data-setting="speed">${[.8,1,1.2].map(value => `<option value="${value}" ${Number(state.settings.speed) === value ? 'selected' : ''}>${value}×</option>`).join('')}</select></label><label class="setting-line"><span>字幕</span><input type="checkbox" data-setting="captions" ${state.settings.captions ? 'checked' : ''}></label><label class="setting-line"><span>自動読み上げ</span><input type="checkbox" data-setting="autoPlay" ${state.settings.autoPlay ? 'checked' : ''}></label><label class="setting-line"><span>Avatar</span><select data-setting="selectedAvatar">${state.registry.avatars.map(item => `<option value="${escapeHTML(item.id)}" ${state.settings.selectedAvatar === item.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></label></section><p class="note">音声認識はChrome側のサービスを利用する場合があります。学習履歴はこの端末に保存します。</p><section class="settings-panel"><h2>端末保存</h2><div class="setting-line"><span>学習履歴</span><strong>${escapeHTML(state.storage)}</strong></div><div class="setting-line"><span>永続ストレージ</span><strong id="persist-status">${escapeHTML(state.persistent)}</strong></div><button class="secondary" data-action="persist">永続ストレージを申請</button><p class="note">ブラウザの判断で未取得になる場合があります。端末内のデータもブラウザの消去操作で失われます。</p></section><section class="settings-panel"><h2>リンク</h2>${[['app','App URL'],['repo','Repository URL']].map(([key,label]) => `<div class="link-row"><span><strong>${label}</strong><small>${escapeHTML(URLS[key])}</small></span><button class="copy" data-action="copy" data-key="${key}">コピー</button></div>`).join('')}</section><p class="credit">Made by YUU · v1.1.0</p>`, { active: 'settings' });
}

app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const { action } = target.dataset;
  if (action === 'home') return showHome();
  if (action === 'scenes') return showScenes();
  if (action === 'history') return showHistory();
  if (action === 'settings') return showSettings();
  if (action === 'filter') return showScenes(target.dataset.mode);
  if (action === 'quick') return startScene('station-guide');
  if (action === 'start') return startScene(target.dataset.id);
  if (action === 'next-scene') { const scenes = state.registry.scenes; return startScene(scenes[(scenes.findIndex(s => s.id === state.meta.id) + 1) % scenes.length].id); }
  if (action === 'replay' && state.screen === 'talk') return speak(currentNode().prompt, state.settings);
  if (action === 'mic' && state.screen === 'talk') {
    if (state.status === 'listening') { stopListening(); state.status = 'ready'; renderTalk(); return; }
    const nodeId = state.nodeId; state.feedback = null; state.status = 'listening'; renderTalk();
    return listen({ onStart: () => {}, onResult: (transcript, confidence) => { if (state.screen === 'talk' && state.nodeId === nodeId) onRecognition(transcript, confidence); }, onNoSpeech: () => { if (state.screen === 'talk' && state.nodeId === nodeId) { state.status = 'ready'; state.feedback = { grade: 'no-speech' }; renderTalk(); } }, onError: message => { if (state.screen === 'talk' && state.nodeId === nodeId) { state.status = 'ready'; state.feedback = { grade: 'no-speech', message }; renderTalk(); } } });
  }
  if (action === 'retry' && state.screen === 'talk') { stopListening(); state.feedback = null; state.transcript = ''; state.status = 'ready'; renderTalk(); return; }
  if (action === 'hint' && state.screen === 'talk') { if (!state.hintShown) state.session.hintCount++; state.hintShown = true; renderTalk(); return; }
  if (action === 'skip' && state.screen === 'talk') { stopListening(); state.session.skippedCount++; state.streak = 0; advance(null); return; }
  if (action === 'copy') { try { await navigator.clipboard.writeText(URLS[target.dataset.key]); toast('コピーしました'); } catch { toast('コピーできませんでした。URLを選択してコピーしてください。'); } return; }
  if (action === 'persist') { try { await requestPersistence(); state.persistent = await persistenceStatus(); document.querySelector('#persist-status').textContent = state.persistent; toast(state.persistent === '有効' ? '永続ストレージが有効です' : '永続ストレージは未取得です'); } catch { toast('状態を確認できませんでした'); } }
});

app.addEventListener('submit', event => {
  if (event.target.id !== 'type-form') return;
  event.preventDefault(); const text = new FormData(event.target).get('typed')?.trim();
  if (!text) return toast('英語で入力してください。');
  stopListening(); onRecognition(text);
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
