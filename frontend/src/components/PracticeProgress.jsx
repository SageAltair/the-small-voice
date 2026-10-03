import { sessionPercent } from "../practice/engine";

/**
 * The session progress bar.
 *
 * The percentage is also written as text, because a bar alone tells a screen
 * reader nothing and tells a colour-blind learner nothing either.
 */
export default function PracticeProgress({ answered, total, label }) {
  const percent = sessionPercent(answered, total);

  return (
    <div className="practice-bar">
      <div
        className="practice-bar-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <div className="practice-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="practice-bar-meta">
        <span>{label}</span>
        <span>{percent}%</span>
      </p>
    </div>
  );
}
