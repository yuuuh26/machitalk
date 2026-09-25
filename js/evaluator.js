export const THRESHOLDS = Object.freeze({ good: 60, great: 75, excellent: 85, perfect: 95 });

export function normalize(input) {
  return String(input || '').normalize('NFKC').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function includesPhrase(text, phrase) {
  const needle = normalize(phrase);
  return needle && (` ${text} `).includes(` ${needle} `);
}

function similarity(a, b) {
  const left = new Set(normalize(a).split(' ').filter(Boolean));
  const right = new Set(normalize(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  const common = [...left].filter(word => right.has(word)).length;
  return 2 * common / (left.size + right.size);
}

export function evaluate(node, transcript, confidence) {
  const text = normalize(transcript);
  if (!text) return { grade: 'no-speech', score: 0, matched: [], missing: [] };
  if ((node.contradictions || []).some(phrase => includesPhrase(text, phrase))) {
    return { grade: 'try-again', score: 0, matched: [], missing: ['contradiction'] };
  }
  const intents = node.acceptedIntents || [];
  const matched = intents.filter(intent => intent.expressions.some(phrase => includesPhrase(text, phrase))).map(intent => intent.id);
  const missing = intents.filter(intent => intent.required && !matched.includes(intent.id)).map(intent => intent.id);
  if (missing.length) return { grade: 'try-again', score: 0, matched, missing };
  const optional = intents.filter(intent => !intent.required);
  const optionalRatio = optional.length ? optional.filter(intent => matched.includes(intent.id)).length / optional.length : 0;
  const modelMatch = Math.max(0, ...(node.examples || []).map(example => similarity(text, example)));
  const exactModel = (node.examples || []).some(example => normalize(example) === text);
  // This measures registered content, not pronunciation. Recognition confidence is deliberately not a score multiplier.
  let score = Math.round(64 + optionalRatio * 12 + modelMatch * 24);
  if (exactModel) score = 100;
  if (Number.isFinite(confidence) && confidence < 0.25) score = Math.min(score, 84);
  score = Math.min(100, Math.max(THRESHOLDS.good, score));
  const grade = score >= THRESHOLDS.perfect ? 'perfect' : score >= THRESHOLDS.excellent ? 'excellent' : score >= THRESHOLDS.great ? 'great' : 'good';
  return { grade, score, matched, missing };
}
