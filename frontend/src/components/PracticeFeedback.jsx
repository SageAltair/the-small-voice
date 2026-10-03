import { ArrowRight, BookOpen, CheckCircle2, ExternalLink, HelpCircle, Lightbulb } from "lucide-react";
import { Link } from "react-router-dom";
import { correctAnswerLines } from "../practice/engine";

// ===========================================================================
// THE TEACHING MOMENT
//
// After an answer, a learner should read *why* rather than only whether. The
// panel is an aria-live region so the verdict is announced, and it never says
// "wrong" - it says "not quite" and then teaches.
// ===========================================================================

export default function PracticeFeedback({
  feedback,
  t,
  onContinue,
  continueLabel,
  lesson,
}) {
  if (!feedback) return null;

  const state =
    feedback.correct === true ? "is-correct" : feedback.correct === false ? "is-not-quite" : "";
  const heading =
    feedback.correct === true
      ? t.correct
      : feedback.correct === false
        ? t.notQuite
        : t.reflectionThanks;
  const revealed = correctAnswerLines(feedback, t);

  return (
    <section className={`practice-feedback ${state}`} aria-live="polite">
      <h3>
        {feedback.correct === true ? (
          <CheckCircle2 size={20} aria-hidden="true" />
        ) : (
          <HelpCircle size={20} aria-hidden="true" />
        )}
        {heading}
      </h3>

      {revealed.length > 0 ? (
        <div className="practice-feedback-block">
          <strong>{t.answer}</strong>
          {revealed.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}

      {feedback.explanation ? (
        <div className="practice-feedback-block">
          <strong>{t.why}</strong>
          <p>{feedback.explanation}</p>
        </div>
      ) : null}

      {feedback.takeaway ? (
        <div className="practice-feedback-block">
          <strong>
            <Lightbulb size={12} aria-hidden="true" /> {t.takeaway}
          </strong>
          <p>{feedback.takeaway}</p>
        </div>
      ) : null}

      {feedback.scripture?.reference ? (
        <div className="practice-feedback-block">
          <strong>
            <BookOpen size={12} aria-hidden="true" /> {t.scripture}
          </strong>
          <p>
            {feedback.scripture.reference}
            {feedback.scripture.translation ? ` (${feedback.scripture.translation})` : ""}
          </p>
        </div>
      ) : null}

      <div className="practice-feedback-actions">
        {onContinue ? (
          <button type="button" className="button" onClick={onContinue}>
            {continueLabel || t.continueButton} <ArrowRight size={15} aria-hidden="true" />
          </button>
        ) : null}

        {lesson?.id ? (
          <Link className="btn-secondary" to={`/learn/lesson/${lesson.id}`}>
            <ExternalLink size={14} aria-hidden="true" /> {t.learnMore}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
