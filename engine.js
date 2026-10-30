export const VERSION = 1;
export const STORAGE_KEY = 'clearstep-progress-v1';
export const complete = (q, answer) => q.type === 'agree'
  ? Number.isInteger(answer) && answer >= -2 && answer <= 2
  : !!answer && Number.isInteger(answer.most) && Number.isInteger(answer.least) &&
    answer.most >= 0 && answer.least >= 0 && answer.most < q.options.length &&
    answer.least < q.options.length && answer.most !== answer.least;
export function points(q, answer) {
  if (!complete(q, answer)) return 0;
  if (q.type === 'agree') return answer === 0 ? 0.5 : Math.sign(answer) === q.key ? 1 : 0;
  return (Number(answer.most === q.key[0]) + Number(answer.least === q.key[1])) / 2;
}
export function score(set, attempt) {
  const categories = ['agree', 'triad', 'scenario'].map(type => {
    const items = set.questions.filter(q => q.type === type);
    return { type, earned: items.reduce((sum, q) => sum + points(q, attempt.answers[q.id]), 0), total: items.length };
  });
  const earned = categories.reduce((sum, c) => sum + c.earned, 0);
  return { categories, earned, total: set.questions.length, percent: Math.round(100 * earned / set.questions.length) };
}
export function freshState() { return { version: VERSION, sets: {} }; }
export function freshAttempt() { return { answers: {}, flags: [], index: 0, submitted: false }; }
export function validateState(input, bank) {
  if (!input || input.version !== VERSION || !input.sets || typeof input.sets !== 'object' ||
      Array.isArray(input.sets) || Object.keys(input.sets).some(id => !bank.sets.some(s => s.id === id)))
    throw new Error('This is not a compatible Clearstep backup.');
  const result = freshState();
  for (const set of bank.sets) {
    const value = input.sets[set.id];
    if (value === undefined) continue;
    if (!value || typeof value !== 'object' || !value.answers || typeof value.answers !== 'object' ||
        Array.isArray(value.answers) || !Array.isArray(value.flags) || typeof value.submitted !== 'boolean' ||
        !Number.isInteger(value.index) || value.index < 0 || value.index >= set.questions.length)
      throw new Error(`Invalid saved progress for ${set.id}.`);
    const attempt = freshAttempt();
    for (const [id, answer] of Object.entries(value.answers)) {
      const q = set.questions.find(q => q.id === id);
      if (!q) throw new Error('Backup contains an unknown question.');
      if (q.type === 'agree') {
        if (!complete(q, answer)) throw new Error('Backup contains an invalid rating.');
        attempt.answers[id] = answer;
      } else {
        if (!answer || typeof answer !== 'object' || Array.isArray(answer) ||
            Object.keys(answer).some(k => !['most', 'least'].includes(k)) ||
            !Object.keys(answer).length ||
            Object.values(answer).some(v => !Number.isInteger(v) || v < 0 || v >= q.options.length) ||
            (answer.most !== undefined && answer.most === answer.least))
          throw new Error('Backup contains invalid MOST/LEAST choices.');
        attempt.answers[id] = { ...answer };
      }
    }
    if (value.flags.some(id => !set.questions.some(q => q.id === id))) throw new Error('Backup has an unknown bookmark.');
    attempt.flags = [...new Set(value.flags)];
    attempt.index = value.index;
    attempt.submitted = value.submitted;
    if (attempt.submitted && !set.questions.every(q => complete(q, attempt.answers[q.id])))
      throw new Error('A submitted set must contain all 60 answers.');
    result.sets[set.id] = attempt;
  }
  return result;
}
