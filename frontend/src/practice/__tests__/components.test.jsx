import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import PracticeQuestion from "../../components/PracticeQuestion.jsx";
import PracticeProgress from "../../components/PracticeProgress.jsx";
import PracticeFeedback from "../../components/PracticeFeedback.jsx";
import PracticeSummary from "../../components/PracticeSummary.jsx";
import { practiceCopy } from "../../i18n/practiceCopy.js";

// The Practice screens are mostly server-decided data with one interactive
// component. Rendering them against the real copy catches the mistakes unit
// tests cannot: a missing translation key, a wrong option shape for a question
// type, a component that throws before it renders.

const t = practiceCopy.en;
const render = (element) => renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);

const base = { id: 12, level: 3, concept_id: 4, concept: { name: "Prayer" } };

describe("PracticeQuestion", () => {
  const types = [
    { type: "multiple_choice", options: ["One", "Two", "Three"], value: { index: 1 } },
    { type: "scenario", options: ["Speak", "Stay silent"], value: { index: 0 } },
    { type: "true_false", options: [], value: { value: true } },
    { type: "multiple_select", options: ["A", "B", "C"], value: { indexes: [0, 2] } },
    { type: "fill_blank", options: [], value: { text: "grace" } },
    {
      type: "ordering",
      options: [
        { id: 0, text: "Listen" },
        { id: 1, text: "Respond" },
      ],
      value: { order: [1, 0] },
    },
    {
      type: "matching",
      options: [{ id: 0, left: "Prayer", right: "Listening" }],
      value: { pairs: { 0: 0 } },
    },
    { type: "reflection", options: [], value: { text: "I will listen first." } },
  ];

  it.each(types)("renders a $type question", ({ type, options, value }) => {
    const html = render(
      <PracticeQuestion
        question={{ ...base, type, prompt: `A ${type} prompt`, options }}
        value={value}
        onChange={() => {}}
        t={t}
      />,
    );
    expect(html).toContain(`A ${type} prompt`);
    expect(html).toContain("Prayer");
  });

  it("marks the right answer after the server has graded it", () => {
    const html = render(
      <PracticeQuestion
        question={{ ...base, type: "multiple_choice", prompt: "Pick one", options: ["One", "Two"] }}
        value={{ index: 0 }}
        onChange={() => {}}
        locked
        feedback={{ correct: false, correct_answer: { index: 1, text: "Two" } }}
        t={t}
      />,
    );
    expect(html).toContain("is-wrong");
    expect(html).toContain("is-correct");
  });
});

describe("PracticeProgress", () => {
  it("reports the percentage in text as well as in the bar", () => {
    const html = render(<PracticeProgress answered={3} total={6} label="Practice" />);
    expect(html).toContain("50%");
    expect(html).toContain('aria-valuenow="50"');
  });
});

describe("PracticeFeedback", () => {
  it("teaches rather than just marking: why, takeaway and the answer", () => {
    const html = render(
      <PracticeFeedback
        feedback={{
          correct: false,
          correct_answer: { index: 1, text: "Listening" },
          explanation: "Prayer is not asking for words.",
          takeaway: "Try sitting in silence for one minute today.",
          scripture: { reference: "Psalm 46:10" },
        }}
        t={t}
      />,
    );
    expect(html).toContain("Listening");
    expect(html).toContain("Prayer is not asking for words.");
    expect(html).toContain("Psalm 46:10");
    expect(html).toContain("aria-live");
  });

  it("renders nothing before an answer has been graded", () => {
    expect(render(<PracticeFeedback feedback={null} t={t} />)).toBe("");
  });
});

describe("PracticeSummary", () => {
  it("shows the score, what was reviewed and the challenge to act on", () => {
    const html = render(
      <PracticeSummary
        summary={{
          session: { id: 3, total: 6, answered: 6, correct: 4, xp_earned: 55, status: "completed" },
          reviewed: [{ concept_id: 4, name: "Prayer", mastery: 70, stage: "strong" }],
          next_review: { concept_id: 4, name: "Prayer", next_review: "2026-01-01T00:00:00" },
          challenge: { id: 9, state: "learned", title: "Pray for five minutes", prompt: "Today" },
          progress: {},
          achievements: [{ key: "first_session", title: "First steps" }],
        }}
        t={t}
        onUpdateApplication={() => {}}
        onSaveCommitment={() => {}}
      />,
    );
    expect(html).toContain("4 / 6");
    expect(html).toContain("Prayer");
    expect(html).toContain("Pray for five minutes");
    expect(html).toContain("First steps");
  });
});