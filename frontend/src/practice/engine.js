// ===========================================================================
// PRACTICE ENGINE - pure helpers.
//
// Everything here is deliberately side-effect free and framework free so it
// can be unit tested directly (frontend/src/practice/__tests__/engine.test.js)
// and reused by the admin preview as well as the learner session.
// ===========================================================================

/** A stable shuffle: options vary per question but never jump while reading. */
export function shuffle(items, seed) {
  const list = [...items];
  let value = seed || 1;
  for (let index = list.length - 1; index > 0; index -= 1) {
    // A small deterministic PRNG rather than Math.random, so a preview and a
    // resumed session show the same order for the same question.
    value = (value * 9301 + 49297) % 233280;
    const target = Math.floor((value / 233280) * (index + 1));
    [list[index], list[target]] = [list[target], list[index]];
  }
  return list;
}

/**
 * Has the learner committed to an answer?
 *
 * The Check button stays disabled until they have, except for ordering and
 * matching, where the interaction itself is the answer.
 */
export function hasAnswer(type, value) {
  if (!value) return false;
  switch (type) {
    case "multiple_select":
      return Array.isArray(value.indexes) && value.indexes.length > 0;
    case "ordering":
    case "matching":
      return false;
    case "true_false":
      return value.value !== undefined;
    case "fill_blank":
    case "reflection":
      return Boolean(value.text && value.text.trim());
    default:
      return value.index !== undefined && value.index !== null;
  }
}

/** Percentage complete in a session, for the progress bar. */
export function sessionPercent(answered, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((answered / total) * 100)));
}

/** "Question 2 of 5" - one place so the two languages never disagree. */
export function questionLabel(t, index, total) {
  return t.questionOf
    .replace("{current}", String(index))
    .replace("{total}", String(total));
}

/** The concept list the dashboard shows first: what needs attention, then rest. */
export function orderConceptsForDashboard(concepts) {
  const practised = (concepts || []).filter((concept) => concept.practised);
  const fresh = (concepts || []).filter((concept) => !concept.practised);
  const weak = practised.filter((concept) => concept.mastery < 61);
  const solid = practised.filter((concept) => concept.mastery >= 61);
  weak.sort((a, b) => a.mastery - b.mastery);
  return [...weak, ...solid, ...fresh];
}

/**
 * The warm, never-shaming streak line.
 *
 * A broken streak is a new beginning, not a failure - so the wording says so.
 */
export function streakMessage(t, progress) {
  if (!progress || !progress.streak) return "";
  if (progress.practiced_today) return t.doneToday;
  if (progress.last_practice_date) return t.streakBroken;
  return t.welcomeBack;
}

/**
 * Turn the server's revealed answer into readable lines.
 *
 * The shape differs per question type (an index, a set of indexes, an order, a
 * set of pairs), and the session, the summary and the admin preview all need to
 * print it - so the translation from answer to words lives here, once.
 */
export function correctAnswerLines(feedback, t) {
  const answer = feedback?.correct_answer;
  if (!answer || typeof answer !== "object") return [];

  // Ordering carries an explicit order, so number the lines; multiple select
  // carries only the texts.
  if (Array.isArray(answer.texts) && answer.texts.length) {
    const numbered = Array.isArray(answer.order);
    return answer.texts.map((text, index) =>
      numbered ? `${index + 1}. ${text}` : String(text),
    );
  }

  if (Array.isArray(answer.pairs) && answer.pairs.length) {
    return answer.pairs.map((pair) => `${pair.left} \u2192 ${pair.right}`);
  }

  if (typeof answer.value === "boolean") {
    return [answer.value ? t.answerLabels.true : t.answerLabels.false];
  }

  if (answer.text) return [String(answer.text)];
  return [];
}
