import { describe, expect, it } from "vitest";
import {
  correctAnswerLines,
  hasAnswer,
  orderConceptsForDashboard,
  questionLabel,
  sessionPercent,
  shuffle,
  streakMessage,
} from "../engine.js";

// These helpers sit under the whole Practice feature: the learner session, the
// dashboard and the admin preview all read from them. They are pure, so they
// are tested directly rather than through a rendered component.

describe("shuffle", () => {
  const items = [0, 1, 2, 3, 4, 5, 6, 7];

  it("keeps every item exactly once", () => {
    const result = shuffle(items, 42);
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });

  it("does not mutate the list it was given", () => {
    const original = [...items];
    shuffle(original, 7);
    expect(original).toEqual(items);
  });

  it("is deterministic, so options do not reorder while a learner reads", () => {
    // The same question id must always produce the same order - a preview and a
    // resumed session have to match, and re-rendering must not reshuffle.
    expect(shuffle(items, 7919)).toEqual(shuffle(items, 7919));
  });

  it("produces a different order for a different seed (usually)", () => {
    // Not a guarantee for every pair of seeds, but these two must differ or the
    // seed is doing nothing at all.
    expect(shuffle(items, 1)).not.toEqual(shuffle(items, 2));
  });

  it("handles empty and single-item lists without throwing", () => {
    expect(shuffle([], 3)).toEqual([]);
    expect(shuffle(["only"], 3)).toEqual(["only"]);
  });

  it("falls back to a usable seed when none is given", () => {
    expect(shuffle(items, 0)).toEqual(shuffle(items, 0));
    expect([...shuffle(items)].sort((a, b) => a - b)).toEqual(items);
  });
});

describe("hasAnswer", () => {
  it("is false for every type before anything is chosen", () => {
    expect(hasAnswer("multiple_choice", undefined)).toBe(false);
    expect(hasAnswer("multiple_choice", {})).toBe(false);
    expect(hasAnswer("fill_blank", { text: "   " })).toBe(false);
  });

  it("waits for a whole set on multiple select", () => {
    expect(hasAnswer("multiple_select", { indexes: [] })).toBe(false);
    expect(hasAnswer("multiple_select", { indexes: [0] })).toBe(true);
  });

  it("never settles ordering or matching: the interaction is the answer", () => {
    // The Check button stays reachable because the arrangement itself carries
    // the answer; there is no separate "picked" state to detect.
    expect(hasAnswer("ordering", { order: [2, 0, 1] })).toBe(false);
    expect(hasAnswer("matching", { pairs: { 0: 1 } })).toBe(false);
  });

  it("accepts either boolean for true or false", () => {
    expect(hasAnswer("true_false", { value: false })).toBe(true);
    expect(hasAnswer("true_false", { value: true })).toBe(true);
  });

describe("sessionPercent", () => {
  it("is 0 when there is nothing to answer yet", () => {
    expect(sessionPercent(0, 0)).toBe(0);
    expect(sessionPercent(3, 0)).toBe(0);
  });

  it("rounds to whole percent", () => {
    expect(sessionPercent(1, 3)).toBe(33);
    expect(sessionPercent(2, 3)).toBe(67);
  });

  it("never goes below 0 or above 100", () => {
    expect(sessionPercent(-2, 5)).toBe(0);
    expect(sessionPercent(9, 5)).toBe(100);
  });
});

describe("questionLabel", () => {
  it("fills both placeholders", () => {
    const t = { questionOf: "Question {current} of {total}" };
    expect(questionLabel(t, 2, 6)).toBe("Question 2 of 6");
  });

  it("works with the Swahili copy shape too", () => {
    const t = { questionOf: "Swali {current} kati ya {total}" };
    expect(questionLabel(t, 1, 4)).toBe("Swali 1 kati ya 4");
  });
});

describe("orderConceptsForDashboard", () => {
  const concepts = [
    { id: 1, mastery: 90, practised: true },
    { id: 2, mastery: 10, practised: true },
    { id: 3, mastery: 55, practised: true },
    { id: 4, mastery: 0, practised: false },
    { id: 5, mastery: 70, practised: true },
  ];

  it("puts what needs attention first, weakest first", () => {
    // The dashboard answers "what should I do next?", so a weak concept beats a
    // strong one even if the strong one was practised more recently.
    expect(orderConceptsForDashboard(concepts).map((item) => item.id)).toEqual([
      2, 3, 1, 5, 4,
    ]);
  });

  it("does not mutate the list it was given", () => {
    const original = concepts.map((item) => item.id);
    orderConceptsForDashboard(concepts);
    expect(concepts.map((item) => item.id)).toEqual(original);
  });

  it("returns an empty list for missing data", () => {
    expect(orderConceptsForDashboard(null)).toEqual([]);
    expect(orderConceptsForDashboard([])).toEqual([]);
  });
});

describe("correctAnswerLines", () => {
  const t = { answerLabels: { true: "True", false: "False" } };

  it("reveals a single choice as one line", () => {
    expect(
      correctAnswerLines({ correct_answer: { index: 1, text: "Grace" } }, t),
    ).toEqual(["Grace"]);
  });

  it("reveals true and false in the learner's own words", () => {
    expect(correctAnswerLines({ correct_answer: { value: false } }, t)).toEqual(["False"]);
    expect(correctAnswerLines({ correct_answer: { value: true } }, t)).toEqual(["True"]);
  });

  it("lists every correct option for select all that apply", () => {
    expect(
      correctAnswerLines(
        { correct_answer: { indexes: [0, 2], texts: ["Faith", "Hope"] } },
        t,
      ),
    ).toEqual(["Faith", "Hope"]);
  });

  it("numbers an ordering, because the sequence is the answer", () => {
    expect(
      correctAnswerLines(
        { correct_answer: { order: [1, 0], texts: ["First", "Second"] } },
        t,
      ),
    ).toEqual(["1. First", "2. Second"]);
  });

  it("pairs up a matching answer", () => {
    expect(
      correctAnswerLines(
        { correct_answer: { pairs: [{ left: "Prayer", right: "Listening" }] } },
        t,
      ),
    ).toEqual(["Prayer \u2192 Listening"]);
  });

  it("reveals an accepted word for fill in the blank", () => {
    expect(correctAnswerLines({ correct_answer: { text: "relationship" } }, t)).toEqual([
      "relationship",
    ]);
  });

  it("says nothing when there is nothing to reveal", () => {
    // Reflections are never marked, and a missed API call can leave this empty.
    expect(correctAnswerLines({ correct_answer: null }, t)).toEqual([]);
    expect(correctAnswerLines({}, t)).toEqual([]);
    expect(correctAnswerLines(null, t)).toEqual([]);
  });
});

describe("streakMessage", () => {
  const t = {
    doneToday: "You have practised today. Well done.",
    streakBroken: "Your streak starts again today. No rush.",
    welcomeBack: "Welcome back. Let's continue.",
  };

  it("says nothing when there is no streak to speak of", () => {
    expect(streakMessage(t, null)).toBe("");
    expect(streakMessage(t, { streak: 0 })).toBe("");
  });

  it("congratulates a learner who has already practised today", () => {
    expect(streakMessage(t, { streak: 4, practiced_today: true })).toBe(t.doneToday);
  });

  it("treats a missed day as a new beginning, not a failure", () => {
    expect(
      streakMessage(t, { streak: 3, last_practice_date: "2026-01-01" }),
    ).toBe(t.streakBroken);
  });

  it("welcomes a learner back when they return", () => {
    expect(streakMessage(t, { streak: 1 })).toBe(t.welcomeBack);
  });
});


  it("needs non-blank text for fill in the blank and reflection", () => {
    expect(hasAnswer("fill_blank", { text: "grace" })).toBe(true);
    expect(hasAnswer("reflection", { text: "\n  " })).toBe(false);
    expect(hasAnswer("reflection", { text: "I will listen first." })).toBe(true);
  });

  it("treats option 0 as a real answer for choice questions", () => {
    expect(hasAnswer("multiple_choice", { index: 0 })).toBe(true);
    expect(hasAnswer("scenario", { index: 0 })).toBe(true);
  });
});
