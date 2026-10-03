import { useMemo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { hasAnswer as answerGiven, shuffle } from "../practice/engine";

// ===========================================================================
// PRACTICE QUESTION RENDERER
//
// One component renders every question type, and both the learner session and
// the admin preview use it - so what an author previews is exactly what a
// learner sees (section 28).
//
// Accessibility notes, because this is the most interactive part of the app:
//   - Choice questions are real radio/checkbox inputs inside labels, so they
//     work from a keyboard and announce their group.
//   - Ordering uses move up/down buttons rather than drag-and-drop: dragging
//     cannot be done from a keyboard and is unusable on a phone.
//   - Matching uses <select> for the same reason.
//   - Nothing is conveyed by colour alone; each state also carries an icon and
//     a word, and the feedback panel is an aria-live region.
// ===========================================================================

/** A stable shuffle so options do not reorder while a learner is reading. */
function OptionRow({ text, checked, onChange, name, type, state, mark }) {
  return (
    <label className={`practice-option ${state || ""}`}>
      <input type={type} name={name} checked={Boolean(checked)} onChange={onChange} />
      <span className="practice-option-text">{text}</span>
      {mark ? <span className="practice-option-mark">{mark}</span> : null}
    </label>
  );
}

/**
 * Render one question.
 *
 * props: question, value (the learner's answer), onChange, locked (already
 *        answered), feedback (the server's verdict), t (Practice copy).
 */
export default function PracticeQuestion({
  question,
  value,
  onChange,
  locked = false,
  feedback,
  t,
}) {
  const options = question.options || [];
  const type = question.type;
  const seed = useMemo(() => (question.id || 1) * 7919, [question.id]);

  // After answering, the server reveals what was right so a miss teaches.
  const correctIndex = feedback?.correct_answer?.index;
  const correctIndexes = feedback?.correct_answer?.indexes || [];

  const markFor = (index) => {
    if (!feedback) return "";
    if (type === "multiple_select") {
      if (correctIndexes.includes(index)) return t.correct;
      if ((value?.indexes || []).includes(index) && !correctIndexes.includes(index)) {
        return t.notQuite;
      }
      return "";
    }
    if (index === correctIndex) return t.correct;
    if (index === value?.index && index !== correctIndex) return t.notQuite;
    return "";
  };

  const stateFor = (index) => {
    if (!feedback) return "";
    if (type === "multiple_select") {
      if (correctIndexes.includes(index)) return "is-correct";
      if ((value?.indexes || []).includes(index)) return "is-wrong";
      return "";
    }
    if (index === correctIndex) return "is-correct";
    if (index === value?.index) return "is-wrong";
    return "";
  };

  const body = () => {
    switch (type) {
      case "true_false":
        return (
          <div className="practice-options" role="radiogroup" aria-label={question.prompt}>
            {[true, false].map((choice) => (
              <OptionRow
                key={String(choice)}
                name={`question-${question.id}`}
                type="radio"
                text={choice ? t.answerLabels.true : t.answerLabels.false}
                checked={value?.value === choice}
                onChange={() => onChange({ value: choice })}
                state={
                  feedback
                    ? feedback.correct_answer?.value === choice
                      ? "is-correct"
                      : value?.value === choice
                        ? "is-wrong"
                        : ""
                    : value?.value === choice
                      ? "is-picked"
                      : ""
                }
                mark={feedback && feedback.correct_answer?.value === choice ? t.correct : ""}
              />
            ))}
          </div>
        );

      case "multiple_select":
        return (
          <div className="practice-options">
            <p className="practice-inline-note">{t.selectAllThatApply}</p>
            {options.map((option, index) => (
              <OptionRow
                key={index}
                name={`question-${question.id}`}
                type="checkbox"
                text={String(option)}
                checked={(value?.indexes || []).includes(index)}
                onChange={() => {
                  const current = value?.indexes || [];
                  const next = current.includes(index)
                    ? current.filter((item) => item !== index)
                    : [...current, index].sort((a, b) => a - b);
                  onChange({ indexes: next });
                }}
                state={stateFor(index)}
                mark={markFor(index)}
              />
            ))}
          </div>
        );

      case "fill_blank":
        return (
          <input
            className="practice-text-answer"
            type="text"
            value={value?.text || ""}
            disabled={locked}
            onChange={(event) => onChange({ text: event.target.value })}
            placeholder={t.typeYourAnswer}
            aria-label={t.yourAnswer}
          />
        );

      case "ordering": {
        // Options arrive in canonical order with ids; we show a shuffled copy
        // so the stored order is not a giveaway.
        const items = options.map((option, index) => ({
          id: option.id ?? index,
          text: option.text ?? String(option),
        }));
        const shown = shuffle(items, seed);
        const order = value?.order?.length ? value.order : shown.map((item) => item.id);
        const ordered = order.map((id) => items.find((item) => item.id === id)).filter(Boolean);
        const remaining = items.filter((item) => !order.includes(item.id));
        const current = [...ordered, ...remaining];

        const move = (index, delta) => {
          const target = index + delta;
          if (target < 0 || target >= current.length) return;
          const next = [...current];
          [next[index], next[target]] = [next[target], next[index]];
          onChange({ order: next.map((item) => item.id) });
        };

        return (
          <div>
            <p className="practice-inline-note">{t.dragIntoOrder}</p>
            <ol className="practice-order-list">
              {current.map((item, index) => {
                const position = (feedback?.correct_answer?.order || []).indexOf(item.id);
                return (
                  <li className="practice-order-item" key={item.id}>
                    <span>
                      {index + 1}. {item.text}
                      {feedback && position >= 0 && position !== index ? (
                        <span className="practice-inline-note">
                          {" "}
                          ({position + 1})
                        </span>
                      ) : null}
                    </span>
                    <span className="practice-order-actions">
                      <button
                        type="button"
                        className="practice-mini-button"
                        onClick={() => move(index, -1)}
                        disabled={locked || index === 0}
                        aria-label={`Move ${item.text} up`}
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="practice-mini-button"
                        onClick={() => move(index, 1)}
                        disabled={locked || index === current.length - 1}
                        aria-label={`Move ${item.text} down`}
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      }

      case "matching": {
        const pairs = options.map((option, index) => ({
          id: option.id ?? index,
          left: option.left,
          right: option.right,
        }));
        // Rights are shuffled so the pairing cannot be read off the page.
        const rights = shuffle(pairs, seed + 17).map((pair) => ({
          id: pair.id,
          text: pair.right,
        }));
        const chosen = value?.pairs || {};

        return (
          <div>
            <p className="practice-inline-note">{t.matchEach}</p>
            <ul className="practice-match-list">
              {pairs.map((pair, index) => {
                const expected = (feedback?.correct_answer?.pairs || []).find(
                  (row) => row.left === pair.left,
                );
                return (
                  <li className="practice-match-row" key={pair.id}>
                    <label htmlFor={`match-${question.id}-${pair.id}`}>{pair.left}</label>
                    <select
                      id={`match-${question.id}-${pair.id}`}
                      value={chosen[index] ?? ""}
                      disabled={locked}
                      onChange={(event) =>
                        onChange({ pairs: { ...chosen, [index]: Number(event.target.value) } })
                      }
                      aria-label={pair.left}
                    >
                      <option value="">{"\u2014"}</option>
                      {rights.map((right) => (
                        <option key={right.id} value={right.id}>
                          {right.text}
                        </option>
                      ))}
                    </select>
                    {feedback && expected ? (
                      <span className="practice-inline-note">
                        {t.correct}: {expected.right}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      }

      case "reflection":
        return (
          <textarea
            className="practice-reflection-area"
            value={value?.text || ""}
            onChange={(event) => onChange({ text: event.target.value })}
            placeholder={t.yourAnswer}
            aria-label={t.yourAnswer}
          />
        );

      default:
        return (
          <div className="practice-options" role="radiogroup" aria-label={question.prompt}>
            {options.map((option, index) => (
              <OptionRow
                key={index}
                name={`question-${question.id}`}
                type="radio"
                text={String(option)}
                checked={value?.index === index}
                onChange={() => onChange({ index })}
                state={stateFor(index)}
                mark={markFor(index)}
              />
            ))}
          </div>
        );
    }
  };

  return (
    <section className="practice-card-question" aria-labelledby={`prompt-${question.id}`}>
      {question.concept?.name ? (
        <p className="practice-session-concept">{question.concept.name}</p>
      ) : null}
      <h2 className="practice-prompt" id={`prompt-${question.id}`}>
        {question.prompt}
      </h2>
      {question.scripture?.reference ? (
        <p className="practice-scripture">
          {question.scripture.reference}
          {question.scripture.translation ? ` (${question.scripture.translation})` : ""}
        </p>
      ) : null}
      {body()}
      {/* Screen readers hear the instruction once the option list is shown. */}
      <p className="practice-sr-only" aria-live="polite">
        {answerGiven(type, value) ? "" : t.selectAnswer}
      </p>
    </section>
  );
}
