import { normalize } from './evaluator.js';

export const MAX_RECOGNITION_ISSUES = 3;

export function classifyAttempt(result, { typed = false, issues = 0 } = {}) {
  if (!['try-again', 'no-speech'].includes(result.grade)) return 'success';
  if (result.grade === 'try-again') {
    const words = normalize(result.transcript).split(' ').filter(Boolean).length;
    const reliable = typed || (Number.isFinite(result.confidence) && result.confidence > 0
      ? result.confidence >= .55 : words >= 3);
    if (reliable) return 'wrong';
  }
  return issues + 1 >= MAX_RECOGNITION_ISSUES ? 'reveal' : 'retry';
}
