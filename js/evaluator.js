export const THRESHOLDS = Object.freeze({ good: 60, great: 75, excellent: 85, perfect: 95 });

export function normalize(input) {
  return String(input || '').normalize('NFKC').toLowerCase()
    .replace(/’/g, "'")
    .replace(/\b(can't|cannot)\b/g, 'cannot')
    .replace(/\b(won't|wont)\b/g, 'will not')
    .replace(/\b(don't|dont)\b/g, 'do not')
    .replace(/\b(doesn't|doesnt)\b/g, 'does not')
    .replace(/\b(isn't|isnt)\b/g, 'is not')
    .replace(/\b(aren't|arent)\b/g, 'are not')
    .replace(/\b(i'll|ill)\b/g, 'i will')
    .replace(/\bi'd\b/g, 'i would')
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\b(you're|youre)\b/g, 'you are')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\b(there's|theres)\b/g, 'there is')
    .replace(/\b(that's|thats)\b/g, 'that is')
    .replace(/\bwe're\b/g, 'we are')
    .replace(/\b(3rd|3)\b/g, 'three')
    .replace(/\b(2nd|2)\b/g, 'two')
    .replace(/\b(15)\b/g, 'fifteen')
    .replace(/\b(10)\b/g, 'ten')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function includesPhrase(text, phrase) {
  const needle = normalize(phrase);
  return needle && (` ${text} `).includes(` ${needle} `);
}

const CRITICAL = new Set('yes no not never cannot left right straight front rear back small medium large hot cold iced warm zero one two three four five six seven eight nine ten twelve fifteen twenty thirty first second third fourth fifth osaka tokyo kyoto umeda namba city hall train bus taxi subway car curry soup coffee tea water juice'.split(' '));
const words = value => normalize(value).split(' ').filter(Boolean);

function spellingDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = next;
  }
  return previous[b.length];
}

function tokenCost(a, b) {
  if (a === b) return 0;
  if (CRITICAL.has(a) || CRITICAL.has(b)) return 2;
  return a.length >= 5 && b.length >= 5 && spellingDistance(a, b) === 1 ? .5 : 1;
}

function wordDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + tokenCost(left[i - 1], right[j - 1]));
    previous = next;
  }
  return previous[right.length];
}

function similarity(a, b) {
  const left = words(a), right = words(b);
  if (!left.length || !right.length) return 0;
  return Math.max(0, 1 - wordDistance(left, right) / Math.max(left.length, right.length));
}

function expressionMatch(text, phrase) {
  if (includesPhrase(text, phrase)) return true;
  const target = words(phrase), heard = words(text);
  if (!target.length || !heard.length) return false;
  if (target.length === 1) return !CRITICAL.has(target[0]) && heard.some(word => tokenCost(target[0], word) === .5);
  // A nearby ASR word may differ, but a number, place, direction or negation cannot.
  const maxErrors = target.length >= 7 ? 2 : 1;
  for (let size = Math.max(1, target.length - maxErrors); size <= Math.min(heard.length, target.length + maxErrors); size++) {
    for (let start = 0; start + size <= heard.length; start++) {
      const slice = heard.slice(start, start + size);
      if (target.some(word => CRITICAL.has(word) && !slice.includes(word))) continue;
      if (slice.some(word => CRITICAL.has(word) && !target.includes(word))) continue;
      if (wordDistance(target, slice) <= maxErrors && similarity(slice.join(' '), target.join(' ')) >= .65) return true;
    }
  }
  return false;
}

export function evaluate(node, transcript, confidence) {
  const text = normalize(transcript);
  if (!text) return { grade: 'no-speech', score: 0, matched: [], missing: [] };
  if ((node.contradictions || []).some(phrase => includesPhrase(text, phrase))) {
    return { grade: 'try-again', score: 0, matched: [], missing: ['contradiction'] };
  }
  const intents = node.acceptedIntents || [];
  const matched = intents.filter(intent => intent.expressions.some(phrase => expressionMatch(text, phrase))).map(intent => intent.id);
  const missing = intents.filter(intent => intent.required && !matched.includes(intent.id)).map(intent => intent.id);
  if (missing.length) return { grade: 'try-again', score: 0, matched, missing };
  const optional = intents.filter(intent => !intent.required);
  const optionalRatio = optional.length ? optional.filter(intent => matched.includes(intent.id)).length / optional.length : 0;
  const modelMatch = Math.max(0, ...(node.examples || []).map(example => similarity(text, example)));
  const exactModel = (node.examples || []).some(example => normalize(example) === text);
  // This measures registered content, not pronunciation. Recognition confidence is deliberately not a score multiplier.
  let score = Math.round(68 + optionalRatio * 8 + modelMatch * 32);
  if (exactModel) score = 100;
  // Device confidence is often missing or zero; recognized words determine the grade.
  score = Math.min(100, Math.max(THRESHOLDS.good, score));
  const grade = score >= THRESHOLDS.perfect ? 'perfect' : score >= THRESHOLDS.excellent ? 'excellent' : score >= THRESHOLDS.great ? 'great' : 'good';
  return { grade, score, matched, missing };
}

// Recognition services can return several plausible interpretations of one utterance.
// Compare plausible alternatives for the best answer, even when the first also passes.
export function evaluateAlternatives(node, alternatives) {
  const candidates = (alternatives || []).filter(item => item?.transcript?.trim()).slice(0, 5);
  if (!candidates.length) return { ...evaluate(node, ''), transcript: '', confidence: undefined };
  const topConfidence = candidates[0].confidence;
  let chosen = { ...evaluate(node, candidates[0].transcript, topConfidence), ...candidates[0], usedAlternative: false };
  for (const [index, item] of candidates.entries()) {
    if (index === 0) continue;
    if (Number.isFinite(topConfidence) && topConfidence > 0 && Number.isFinite(item.confidence) && item.confidence > 0 && topConfidence - item.confidence > .2) continue;
    const result = evaluate(node, item.transcript, item.confidence);
    if (result.score > chosen.score && result.grade !== 'try-again' && result.grade !== 'no-speech') {
      chosen = { ...result, ...item, usedAlternative: true };
    }
  }
  return chosen;
}
