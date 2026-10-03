import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Award, BarChart3, CheckCircle2, Copy, Eye, Gauge, Layers,
  ListChecks, Plus, RefreshCw, Save, Settings as SettingsIcon, Target, Trash2, X,
} from "lucide-react";
import PracticeQuestion from "../components/PracticeQuestion";
import {
  createAdminChallenge, createAdminConcept, createAdminQuestion, createAdminSet,
  deleteAdminChallenge, deleteAdminConcept, deleteAdminQuestion, deleteAdminSet,
  duplicateAdminQuestion, getAdminConcept, getAdminPracticeAnalytics, getAdminPracticeSettings,
  getAdminQuestion, getAdminSet, getPracticeAdminOverview, getPracticeCatalog,
  listAdminChallenges, listAdminConcepts, listAdminQuestions, listAdminSets,
  publishAdminChallenge, publishAdminConcept, publishAdminQuestion, publishAdminSet,
  saveAdminChallenge, saveAdminConcept, saveAdminPracticeSettings, saveAdminQuestion,
  saveAdminSet, unpublishAdminChallenge, unpublishAdminConcept, unpublishAdminQuestion,
  unpublishAdminSet,
} from "../services/practiceApi";
import { useLanguage } from "../i18n/LanguageContext";
import "../learn-admin.css";

// ===========================================================================
// PRACTICE STUDIO
//
// The authoring half of Practice. It edits the same documents the API returns,
// which means what an author previews is exactly what a learner is served - the
// preview panel renders the real PracticeQuestion component, not a mock-up.
// Publishing is never implicit: saving keeps something a draft until Publish is
// pressed, and the server's validation report is shown field by field.
// ===========================================================================

const LANGUAGES = ["en", "sw"];
const LANGUAGE_LABELS = { en: "English", sw: "Swahili" };
const LEVELS = [
  { value: 1, label: "1 · Recognition" },
  { value: 2, label: "2 · Recall" },
  { value: 3, label: "3 · Understanding" },
  { value: 4, label: "4 · Application" },
  { value: 5, label: "5 · Reflection" },
];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const STATUS_LABELS = { published: "Published", draft: "Draft", unpublished: "Archived" };
const SET_MODES = ["manual", "automatic", "hybrid"];

const TABS = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "concepts", label: "Concepts", icon: Layers },
  { id: "questions", label: "Questions", icon: ListChecks },
  { id: "sets", label: "Sets", icon: Award },
  { id: "challenges", label: "Challenges", icon: Target },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "insights", label: "Insights", icon: BarChart3 },
];

const messageOf = (err) => err?.message || "Something went wrong.";

const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** A textarea is the friendliest editor for a short list of strings. */
const linesToArray = (text) =>
  String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const arrayToLines = (list) => (Array.isArray(list) ? list.join("\n") : "");

function StatusPill({ status }) {
  return (
    <span className={`cms-status ${status === "published" ? "published" : "draft"}`}>
      {STATUS_LABELS[status] || status || "Draft"}
    </span>
  );
}
// ---------------------------------------------------------------------------
// Document builders
//
// The API stores questions as documents (metadata + both languages + the answer
// key). These functions translate between that shape and the flat text an author
// actually types, so the form never has to know about the storage detail.
// ---------------------------------------------------------------------------

function conceptPayload(draft) {
  const translation = (language) => ({
    name: draft.translations?.[language]?.name || "",
    description: draft.translations?.[language]?.description || "",
    prep: draft.translations?.[language]?.prep || "",
  });
  return {
    slug: draft.slug || slugify(translation("en").name),
    category: draft.category || "",
    difficulty: draft.difficulty || "beginner",
    learn_lesson_id: draft.learn_lesson_id || null,
    learn_path_id: draft.learn_path_id || null,
    display_order: Number(draft.display_order) || 0,
    status: draft.status || "draft",
    translations: { en: translation("en"), sw: translation("sw") },
  };
}

/** Matching options are stored as {left, right}; the editor types "left | right". */
function optionsToLines(options, type) {
  if (!Array.isArray(options)) return "";
  return options
    .map((option) => {
      if (type === "matching" && option && typeof option === "object") {
        return `${option.left} | ${option.right}`;
      }
      return typeof option === "object" && option ? option.text ?? "" : String(option ?? "");
    })
    .join("\n");
}

function keyFor(document) {
  const config = document?.question?.config || {};
  return {
    correct_index: config.correct_index === undefined ? "" : String(config.correct_index),
    correct: Boolean(config.correct),
    correct_indexes: (config.correct_indexes || []).join("\n"),
    order: (config.correct_order || []).map((n) => Number(n) + 1).join(", "),
    pairs: (config.correct_pairs || [])
      .map((pair) => `${Number(pair.left) + 1}-${Number(pair.right) + 1}`)
      .join(", "),
  };
}

/** The answer key, rebuilt from the form. Defaults assume "typed in order". */
function configFor(type, key, optionCount) {
  if (type === "true_false") return { correct: Boolean(key.correct) };
  if (type === "multiple_choice" || type === "scenario") {
    return { correct_index: key.correct_index === "" ? -1 : Number(key.correct_index) };
  }
  if (type === "multiple_select") {
    return {
      correct_indexes: linesToArray(key.correct_indexes)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item)),
    };
  }
  if (type === "ordering") {
    const typed = linesToArray(key.order.replace(/,/g, "\n")).map((item) => Number(item) - 1);
    const identity = Array.from({ length: optionCount }, (_, index) => index);
    const clean = typed.filter((item) => Number.isInteger(item) && item >= 0 && item < optionCount);
    return { correct_order: clean.length === identity.length ? clean : identity };
  }
  if (type === "matching") {
    const typed = linesToArray(key.pairs.replace(/,/g, "\n"))
      .map((item) => item.split("-").map(Number))
      .filter(([left, right]) => Number.isInteger(left) && Number.isInteger(right))
      .map(([left, right]) => ({ left: left - 1, right: right - 1 }));
    const identity = Array.from({ length: optionCount }, (_, index) => ({
      left: index,
      right: index,
    }));
    return { correct_pairs: typed.length === identity.length ? typed : identity };
  }
  return {};
}

function questionPayload(draft) {
  const type = draft.question.question_type;
  const build = (language) => {
    const entry = draft.translations?.[language] || {};
    const options = linesToArray(entry.options);
    return {
      prompt: entry.prompt || "",
      options:
        type === "matching"
          ? options.map((line) => {
              const [left, right] = line.split("|").map((part) => part.trim());
              return { left, right };
            })
          : options,
      accepted: linesToArray(entry.accepted),
      explanation: entry.explanation || "",
      takeaway: entry.takeaway || "",
      application_prompt: entry.application_prompt || "",
      media_url: entry.media_url || "",
      media_alt: entry.media_alt || "",
    };
  };
  const optionCount = linesToArray(draft.translations?.en?.options).length;
  return {
    question: {
      concept_id: draft.question.concept_id || null,
      question_type: type,
      difficulty: draft.question.difficulty || "beginner",
      level: Number(draft.question.level) || 1,
      weight: Number(draft.question.weight) || 1,
      display_order: Number(draft.question.display_order) || 0,
      learn_lesson_id: draft.question.learn_lesson_id || null,
      story_id: draft.question.story_id || null,
      resource_id: draft.question.resource_id || null,
      scripture_reference: draft.question.scripture_reference || "",
      scripture_translation: draft.question.scripture_translation || "",
      tags: linesToArray(draft.question.tags),
      status: draft.question.status || "draft",
      config: configFor(type, draft.key || {}, optionCount),
    },
    translations: { en: build("en"), sw: build("sw") },
  };
}

/** The question exactly as the learner will receive it, for the preview. */
function previewQuestion(document, { conceptName, graded } = {}) {
  const question = document?.question || {};
  const translation = document?.translations?.en || {};
  const type = question.question_type || "multiple_choice";
  const raw = linesToArray(translation.options);
  let options = raw;
  if (type === "ordering") options = raw.map((text, index) => ({ id: index, text }));
  if (type === "matching") {
    options = raw.map((line, index) => {
      const [left, right] = line.split("|").map((part) => part.trim());
      return { id: index, left, right };
    });
  }
  return {
    id: question.id || 1,
    type,
    prompt: translation.prompt || "Your prompt appears here.",
    options,
    graded: graded !== false,
    concept: conceptName ? { name: conceptName } : null,
    scripture: question.scripture_reference
      ? { reference: question.scripture_reference, translation: question.scripture_translation }
      : null,
  };
}

export default function PracticeAdmin() {
  const { t } = useLanguage();
  const p = t.practice;

  const [tab, setTab] = useState("overview");
  const [catalog, setCatalog] = useState(null);
  const [overview, setOverview] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  const [concepts, setConcepts] = useState([]);
  const [conceptFilters, setConceptFilters] = useState({ status: "", q: "" });
  const [conceptDraft, setConceptDraft] = useState(null);
  const [newConcept, setNewConcept] = useState(null);

  const [questions, setQuestions] = useState([]);
  const [questionFilters, setQuestionFilters] = useState({
    conceptId: "",
    status: "",
    questionType: "",
    q: "",
  });
  const [questionDraft, setQuestionDraft] = useState(null);
  const [newQuestion, setNewQuestion] = useState(null);
  const [preview, setPreview] = useState(false);

  const [sets, setSets] = useState([]);
  const [setDraft, setSetDraft] = useState(null);

  const [challenges, setChallenges] = useState([]);
  const [challengeDraft, setChallengeDraft] = useState(null);

  const [settingsDraft, setSettingsDraft] = useState(null);

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // ---- loading -----------------------------------------------------------
  const loadConcepts = useCallback(async () => {
    const result = await listAdminConcepts({
      status: conceptFilters.status || undefined,
      q: conceptFilters.q.trim() || undefined,
    });
    setConcepts(result.items || []);
  }, [conceptFilters]);

  const loadQuestions = useCallback(async () => {
    const result = await listAdminQuestions({
      conceptId: questionFilters.conceptId || undefined,
      status: questionFilters.status || undefined,
      questionType: questionFilters.questionType || undefined,
      q: questionFilters.q.trim() || undefined,
    });
    setQuestions(result.items || []);
  }, [questionFilters]);

  const loadSets = () => listAdminSets().then((result) => setSets(result.items || []));

  const loadChallenges = () =>
    listAdminChallenges().then((result) => setChallenges(result.items || []));

  const loadOverview = () =>
    getPracticeAdminOverview().then((result) => setOverview(result));

  const loadInsights = () =>
    getAdminPracticeAnalytics().then((result) => setAnalytics(result));

  useEffect(() => {
    getPracticeCatalog().then((result) => setCatalog(result)).catch((err) => setError(messageOf(err)));
  }, []);

  useEffect(() => {
    let stale = false;
    if (tab === "concepts") {
      listAdminConcepts({
        status: conceptFilters.status || undefined,
        q: conceptFilters.q.trim() || undefined,
      })
        .then((result) => {
          if (!stale) setConcepts(result.items || []);
        })
        .catch((err) => {
          if (!stale) setError(messageOf(err));
        });
    } else if (tab === "questions") {
      listAdminQuestions({
        conceptId: questionFilters.conceptId || undefined,
        status: questionFilters.status || undefined,
        questionType: questionFilters.questionType || undefined,
        q: questionFilters.q.trim() || undefined,
      })
        .then((result) => {
          if (!stale) setQuestions(result.items || []);
        })
        .catch((err) => {
          if (!stale) setError(messageOf(err));
        });
    } else if (tab === "overview") {
      getPracticeAdminOverview().then((result) => {
        if (!stale) setOverview(result);
      }).catch((err) => { if (!stale) setError(messageOf(err)); });
    } else if (tab === "insights") {
      getAdminPracticeAnalytics().then((result) => {
        if (!stale) setAnalytics(result);
      }).catch((err) => { if (!stale) setError(messageOf(err)); });
    } else if (tab === "sets") {
      listAdminSets().then((result) => {
        if (!stale) setSets(result.items || []);
      }).catch((err) => { if (!stale) setError(messageOf(err)); });
    } else if (tab === "challenges") {
      listAdminChallenges().then((result) => {
        if (!stale) setChallenges(result.items || []);
      }).catch((err) => { if (!stale) setError(messageOf(err)); });
    }
    return () => {
      stale = true;
    };
  }, [tab, conceptFilters, questionFilters]);

  useEffect(() => {
    if (tab === "settings" && !settingsDraft) {
      getAdminPracticeSettings()
        .then((result) => setSettingsDraft(result.settings))
        .catch((err) => setError(messageOf(err)));
    }
  }, [tab, settingsDraft]);

  const questionTypes = useMemo(() => catalog?.question_types || [], [catalog]);
  const typeById = useMemo(
    () => Object.fromEntries(questionTypes.map((item) => [item.id, item])),
    [questionTypes],
  );
  const conceptNames = useMemo(
    () => Object.fromEntries(concepts.map((item) => [item.id, item.name])),
    [concepts],
  );

  // ---- shared helpers ----------------------------------------------------
  async function run(key, action, successNote) {
    if (busy) return null;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const result = await action();
      setNotice(successNote || "");
      return result;
    } catch (err) {
      setError(messageOf(err));
      return null;
    } finally {
      setBusy("");
    }
  }
// ---- documents ---------------------------------------------------------
  /** Turn an API document into the flat form shape the editors work in. */
  function toConceptDraft(document) {
    return {
      ...document.concept,
      translations: LANGUAGES.reduce((rows, language) => {
        rows[language] = {
          name: document.translations?.[language]?.name || "",
          description: document.translations?.[language]?.description || "",
          prep: document.translations?.[language]?.prep || "",
        };
        return rows;
      }, {}),
    };
  }

  function toQuestionDraft(document) {
    const type = document.question?.question_type || "multiple_choice";
    const translations = LANGUAGES.reduce((rows, language) => {
      const entry = document.translations?.[language] || {};
      rows[language] = {
        prompt: entry.prompt || "",
        options: optionsToLines(entry.options, type),
        accepted: arrayToLines(entry.accepted),
        explanation: entry.explanation || "",
        takeaway: entry.takeaway || "",
        application_prompt: entry.application_prompt || "",
        media_url: entry.media_url || "",
        media_alt: entry.media_alt || "",
      };
      return rows;
    }, {});
    return {
      question: { ...document.question, tags: arrayToLines(document.question?.tags) },
      translations,
      validation: document.validation,
      key: keyFor(document),
    };
  }

  function blankConcept() {
    return toConceptDraft({ concept: {}, translations: {} });
  }

  function blankQuestion(conceptId) {
    return toQuestionDraft({
      question: { concept_id: conceptId || null, question_type: "multiple_choice", level: 1 },
      translations: {},
    });
  }

  function patchConcept(patch) {
    setConceptDraft((draft) => ({ ...draft, ...patch }));
  }

  function patchConceptTranslation(language, patch) {
    setConceptDraft((draft) => ({
      ...draft,
      translations: {
        ...draft.translations,
        [language]: { ...draft.translations[language], ...patch },
      },
    }));
  }

  function patchQuestion(patch) {
    setQuestionDraft((draft) => ({ ...draft, question: { ...draft.question, ...patch } }));
  }

  function patchQuestionTranslation(language, patch) {
    setQuestionDraft((draft) => ({
      ...draft,
      translations: {
        ...draft.translations,
        [language]: { ...draft.translations[language], ...patch },
      },
    }));
  }

  function patchKey(patch) {
    setQuestionDraft((draft) => ({ ...draft, key: { ...draft.key, ...patch } }));
  }

  // ---- concept actions ---------------------------------------------------
  async function openConcept(id) {
    const document = await run("concept", () => getAdminConcept(id));
    if (document) setConceptDraft(toConceptDraft(document));
  }

  async function saveConcept() {
    const saved = await run("concept", () =>
      saveAdminConcept(conceptDraft.id, conceptPayload(conceptDraft)),
    );
    if (saved) {
      setConceptDraft(toConceptDraft(saved));
      await loadConcepts();
    }
  }

  async function publishConcept(document, id) {
    const saved = await run("publish-concept", () =>
      publishAdminConcept(id, conceptPayload(document)),
    );
    if (saved) {
      setConceptDraft(toConceptDraft(saved));
      await loadConcepts();
    }
  }

  async function removeConcept(id) {
    const done = await run("delete-concept", () => deleteAdminConcept(id));
    if (done) {
      setConceptDraft(null);
      await loadConcepts();
    }
  }

  async function createConcept() {
    const created = await run("create-concept", () => createAdminConcept(newConcept));
    if (created) {
      setNewConcept(null);
      setConceptDraft(toConceptDraft(created));
      await loadConcepts();
    }
  }

  // ---- question actions --------------------------------------------------
  async function openQuestion(id) {
    const document = await run("question", () => getAdminQuestion(id));
    if (document) setQuestionDraft(toQuestionDraft(document));
  }

  async function saveQuestion() {
    const saved = await run("question", () =>
      saveAdminQuestion(questionDraft.question.id, questionPayload(questionDraft)),
    );
    if (saved) {
      setQuestionDraft(toQuestionDraft(saved));
      await loadQuestions();
    }
  }

  async function publishQuestion(document, id) {
    const saved = await run("publish-question", () =>
      publishAdminQuestion(id, questionPayload(document)),
    );
    if (saved) {
      setQuestionDraft(toQuestionDraft(saved));
      await loadQuestions();
    }
  }

  async function setQuestionStatus(id, published) {
    const action = published ? unpublishAdminQuestion : publishAdminQuestion;
    const saved = await run("status-question", () => action(id));
    if (saved) {
      setQuestionDraft(toQuestionDraft(saved));
      await loadQuestions();
    }
  }

  async function duplicateQuestion(id) {
    const saved = await run("duplicate", () => duplicateAdminQuestion(id));
    if (saved) {
      setQuestionDraft(toQuestionDraft(saved));
      await loadQuestions();
    }
  }

  async function removeQuestion(id) {
    const done = await run("delete-question", () => deleteAdminQuestion(id));
    if (done) {
      setQuestionDraft(null);
      await loadQuestions();
    }
  }

  async function createQuestion() {
    const created = await run("create-question", () => createAdminQuestion(newQuestion));
    if (created) {
      setNewQuestion(null);
      setQuestionDraft(toQuestionDraft(created));
      await loadQuestions();
    }
  }
// ---- set actions -------------------------------------------------------
  function toSetDraft(document) {
    const row = document.practice_set;
    return {
      ...row,
      rules: { count: 0, weak_concepts: 0, new_concepts: 0, review: 0, ...(row.rules || {}) },
      concept_ids_text: arrayToLines(row.concept_ids),
      questions_text: arrayToLines(row.question_ids),
      translations: LANGUAGES.reduce((rows, language) => {
        rows[language] = {
          title: document.translations?.[language]?.title || "",
          description: document.translations?.[language]?.description || "",
        };
        return rows;
      }, {}),
    };
  }

  function setPayload(draft) {
    const payload = {
      slug: draft.slug || slugify(draft.translations.en.title),
      practice_set: {
        mode: draft.mode || "manual",
        difficulty: draft.difficulty || "beginner",
        estimated_minutes: Number(draft.estimated_minutes) || 10,
        display_order: Number(draft.display_order) || 0,
        status: draft.status || "draft",
        rules: {
          count: Number(draft.rules?.count) || 0,
          weak_concepts: Number(draft.rules?.weak_concepts) || 0,
          new_concepts: Number(draft.rules?.new_concepts) || 0,
          review: Number(draft.rules?.review) || 0,
        },
        concept_ids: linesToArray(draft.concept_ids_text)
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0),
      },
      translations: LANGUAGES.reduce((rows, language) => {
        rows[language] = {
          title: draft.translations[language].title,
          description: draft.translations[language].description,
        };
        return rows;
      }, {}),
    };
    // Membership is only sent for manual sets, where the editor is the point:
    // sending an empty list elsewhere would silently drop a hand-built order.
    if (draft.mode === "manual") {
      payload.questions = linesToArray(draft.questions_text)
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);
    }
    return payload;
  }

  async function openSet(id) {
    const document = await run("set", () => getAdminSet(id));
    if (document) setSetDraft(toSetDraft(document));
  }

  async function saveSet() {
    const saved = await run("set", () => saveAdminSet(setDraft.id, setPayload(setDraft)));
    if (saved) {
      setSetDraft(toSetDraft(saved));
      await loadSets();
    }
  }

  async function publishSet(id) {
    const saved = await run("publish-set", () => publishAdminSet(id));
    if (saved) {
      setSetDraft(toSetDraft(saved));
      await loadSets();
    }
  }

  async function removeSet(id) {
    const done = await run("delete-set", () => deleteAdminSet(id));
    if (done) {
      setSetDraft(null);
      await loadSets();
    }
  }

  async function createSet() {
    const created = await run("create-set", () =>
      createAdminSet(setPayload(toSetDraft({ practice_set: {}, translations: {} }))),
    );
    if (created) {
      setSetDraft(toSetDraft(created));
      await loadSets();
    }
  }
// ---- challenge actions -------------------------------------------------
  function toChallengeDraft(document) {
    return {
      ...document.challenge,
      translations: LANGUAGES.reduce((rows, language) => {
        rows[language] = {
          title: document.translations?.[language]?.title || "",
          prompt: document.translations?.[language]?.prompt || "",
        };
        return rows;
      }, {}),
    };
  }

  function challengePayload(draft) {
    return {
      slug: draft.slug || slugify(draft.translations.en.title),
      challenge: {
        concept_id: draft.concept_id || null,
        difficulty: draft.difficulty || "beginner",
        display_order: Number(draft.display_order) || 0,
        status: draft.status === "published" ? "published" : "draft",
      },
      translations: LANGUAGES.reduce((rows, language) => {
        rows[language] = {
          title: draft.translations[language].title,
          prompt: draft.translations[language].prompt,
        };
        return rows;
      }, {}),
    };
  }

  async function saveChallenge() {
    const saved = await run("challenge", () =>
      saveAdminChallenge(challengeDraft.id, challengePayload(challengeDraft)),
    );
    if (saved) {
      setChallengeDraft(toChallengeDraft(saved));
      await loadChallenges();
    }
  }

  async function setChallengeStatus(id, published) {
    const action = published ? unpublishAdminChallenge : publishAdminChallenge;
    const saved = await run("status-challenge", () => action(id));
    if (saved) {
      setChallengeDraft(toChallengeDraft(saved));
      await loadChallenges();
    }
  }

  async function removeChallenge(id) {
    const done = await run("delete-challenge", () => deleteAdminChallenge(id));
    if (done) {
      setChallengeDraft(null);
      await loadChallenges();
    }
  }

  async function createChallenge() {
    const created = await run("create-challenge", () =>
      createAdminChallenge(challengePayload(toChallengeDraft({ challenge: {}, translations: {} }))),
    );
    if (created) {
      setChallengeDraft(toChallengeDraft(created));
      await loadChallenges();
    }
  }

  // ---- settings ----------------------------------------------------------
  async function saveSettings() {
    const saved = await run("settings", () =>
      saveAdminPracticeSettings({
        mastery_thresholds: settingsDraft.mastery_thresholds,
        xp_values: settingsDraft.xp_values,
        review_intervals: settingsDraft.review_intervals,
        session_sizes: settingsDraft.session_sizes,
        streak_settings: settingsDraft.streak_settings,
        question_limit: settingsDraft.question_limit,
        enabled_types: settingsDraft.enabled_types,
        reminder_defaults: settingsDraft.reminder_defaults,
      }),
    );
    if (saved) setSettingsDraft(saved.settings);
  }

  function patchSettings(patch) {
    setSettingsDraft((draft) => ({ ...draft, ...patch }));
  }

  function patchBand(stage, index, value) {
    setSettingsDraft((draft) => {
      const band = [...(draft.mastery_thresholds?.[stage] || [0, 100])];
      band[index] = Number(value);
      return { ...draft, mastery_thresholds: { ...draft.mastery_thresholds, [stage]: band } };
    });
  }

  function patchXp(key, value) {
    setSettingsDraft((draft) => ({ ...draft, xp_values: { ...draft.xp_values, [key]: Number(value) } }));
  }

  function toggleType(id) {
    setSettingsDraft((draft) => {
      const enabled = draft.enabled_types || [];
      return {
        ...draft,
        enabled_types: enabled.includes(id)
          ? enabled.filter((item) => item !== id)
          : [...enabled, id],
      };
    });
  }
// ---- panels -----------------------------------------------------------
  function metric(label, value) {
    return (
      <div key={label}>
        <b>{value ?? 0}</b>
        <span>{label}</span>
      </div>
    );
  }

  function overviewPanel() {
    const totals = overview?.totals || {};
    const learners = overview?.learners || {};
    return (
      <div className="learn-grid">
        <section className="learn-panel">
          <h3>
            Content <span>{totals.questions ?? 0} questions</span>
          </h3>
          <div className="learn-metric-grid">
            {metric("Questions", totals.questions)}
            {metric("Published", totals.published_questions)}
            {metric("Drafts", totals.draft_questions)}
            {metric("Concepts", totals.concepts)}
            {metric("Published concepts", totals.published_concepts)}
            {metric("Sets", totals.published_sets)}
            {metric("Challenges", totals.challenges)}
          </div>
        </section>

        <section className="learn-panel">
          <h3>Learners</h3>
          <div className="learn-metric-grid">
            {metric("Sessions", learners.sessions)}
            {metric("Completed", learners.completed_sessions)}
            {metric("Attempts", learners.attempts)}
            {metric("Challenges taken", learners.applications)}
            {metric("Completion rate %", overview?.completion_rate)}
          </div>
          <div className="learn-usage-languages">
            {Object.entries(overview?.languages || {}).map(([language, counts]) => (
              <p key={language}>
                <b>{LANGUAGE_LABELS[language] || language}</b>
                <span>
                  {counts.concepts} concepts · {counts.questions} questions
                </span>
              </p>
            ))}
          </div>
        </section>

        <section className="learn-panel">
          <h3>Hardest concepts</h3>
          <ul className="learn-top-list">
            {(overview?.hardest_concepts || []).map((item) => (
              <li key={item.concept_id || item.id}>
                <strong>{item.name}</strong>
                <span>{item.accuracy}% correct</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="learn-panel">
          <h3>Needs attention</h3>
          <ul className="learn-attention-list">
            {(overview?.attention || []).map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <strong>{item.title}</strong>
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  function conceptsPanel() {
    return (
      <div>
        <div className="learn-toolbar">
          <select
            className="learn-filter"
            value={conceptFilters.status}
            onChange={(event) =>
              setConceptFilters((row) => ({ ...row, status: event.target.value }))
            }
          >
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <input
            className="learn-filter"
            placeholder="Search concepts"
            value={conceptFilters.q}
            onChange={(event) => setConceptFilters((row) => ({ ...row, q: event.target.value }))}
          />
          <button
            type="button"
            className="learn-refresh"
            onClick={() => setNewConcept(blankConcept())}
          >
            <Plus size={14} aria-hidden="true" /> New concept
          </button>
        </div>

        <ul className="learn-lesson-list">
          {concepts.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => openConcept(item.id)}>
                <b>{item.name}</b>
              </button>
              <span className="learn-lesson-info">
                <strong>{item.question_count} questions</strong>
                <small>{item.category || item.difficulty}</small>
              </span>
              <StatusPill status={item.status} />
            </li>
          ))}
        </ul>

        {newConcept ? (
          <section className="learn-new-form">
            <h3>New concept</h3>
            {LANGUAGES.map((language) => (
              <label key={language}>
                {LANGUAGE_LABELS[language]} name
                <input
                  value={newConcept.translations[language].name}
                  onChange={(event) =>
                    setNewConcept((row) => ({
                      ...row,
                      translations: {
                        ...row.translations,
                        [language]: { ...row.translations[language], name: event.target.value },
                      },
                    }))
                  }
                />
              </label>
            ))}
            <footer>
              <button type="button" className="button" onClick={createConcept}>
                <Save size={14} aria-hidden="true" /> Create draft
              </button>
              <button type="button" className="btn-secondary" onClick={() => setNewConcept(null)}>
                Cancel
              </button>
            </footer>
          </section>
        ) : null}

        {conceptDraft ? conceptEditor() : null}
      </div>
    );
  }
function conceptEditor() {
    const published = conceptDraft.status === "published";
    return (
      <section className="learn-editor">
        <header className="learn-editor-head">
          <div className="learn-editor-title">
            <h2>{conceptDraft.translations.en.name || "Untitled concept"}</h2>
            <p className="learn-editor-meta">
              <StatusPill status={conceptDraft.status} /> {conceptDraft.slug || "no slug yet"}
            </p>
          </div>
          <div className="learn-editor-actions">
            <button type="button" className="button" onClick={saveConcept} disabled={Boolean(busy)}>
              <Save size={14} aria-hidden="true" /> Save
            </button>
            {published ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  run("publish-concept", () => unpublishAdminConcept(conceptDraft.id)).then(loadConcepts)
                }
                disabled={Boolean(busy)}
              >
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => publishConcept(conceptDraft, conceptDraft.id)}
                disabled={Boolean(busy)}
              >
                Publish
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => removeConcept(conceptDraft.id)}
              disabled={Boolean(busy)}
            >
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConceptDraft(null)}
              aria-label="Close editor"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="learn-grid">
          <section className="learn-panel">
            <h3>Settings</h3>
            <label>
              Slug
              <input
                value={conceptDraft.slug || ""}
                onChange={(event) => patchConcept({ slug: event.target.value })}
              />
            </label>
            <label>
              Category
              <input
                value={conceptDraft.category || ""}
                onChange={(event) => patchConcept({ category: event.target.value })}
              />
            </label>
            <label>
              Difficulty
              <select
                value={conceptDraft.difficulty || "beginner"}
                onChange={(event) => patchConcept({ difficulty: event.target.value })}
              >
                {DIFFICULTIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Display order
              <input
                type="number"
                value={conceptDraft.display_order ?? 0}
                onChange={(event) => patchConcept({ display_order: event.target.value })}
              />
            </label>
            <label>
              Linked lesson id
              <input
                type="number"
                value={conceptDraft.learn_lesson_id ?? ""}
                onChange={(event) => patchConcept({ learn_lesson_id: event.target.value })}
              />
            </label>
            <label>
              Linked learning path id
              <input
                type="number"
                value={conceptDraft.learn_path_id ?? ""}
                onChange={(event) => patchConcept({ learn_path_id: event.target.value })}
              />
            </label>
          </section>

          <section className="learn-panel">
            <h3>
              Languages <span>English is required to publish</span>
            </h3>
            {LANGUAGES.map((language) => (
              <div className="learn-lang" key={language}>
                <span className="learn-lang-label">{LANGUAGE_LABELS[language]}</span>
                <input
                  placeholder="Name"
                  value={conceptDraft.translations[language].name}
                  onChange={(event) =>
                    patchConceptTranslation(language, { name: event.target.value })
                  }
                />
                <textarea
                  rows={2}
                  placeholder="Short description"
                  value={conceptDraft.translations[language].description}
                  onChange={(event) =>
                    patchConceptTranslation(language, { description: event.target.value })
                  }
                />
                <textarea
                  rows={4}
                  placeholder="Remember this before you begin (shown once, to new learners)"
                  value={conceptDraft.translations[language].prep}
                  onChange={(event) =>
                    patchConceptTranslation(language, { prep: event.target.value })
                  }
                />
              </div>
            ))}
          </section>
        </div>
      </section>
    );
  }
function questionsPanel() {
    return (
      <div>
        <div className="learn-toolbar">
          <select
            className="learn-filter"
            value={questionFilters.conceptId}
            onChange={(event) =>
              setQuestionFilters((row) => ({ ...row, conceptId: event.target.value }))
            }
          >
            <option value="">All concepts</option>
            {concepts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            className="learn-filter"
            value={questionFilters.questionType}
            onChange={(event) =>
              setQuestionFilters((row) => ({ ...row, questionType: event.target.value }))
            }
          >
            <option value="">All types</option>
            {questionTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="learn-filter"
            value={questionFilters.status}
            onChange={(event) =>
              setQuestionFilters((row) => ({ ...row, status: event.target.value }))
            }
          >
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <input
            className="learn-filter"
            placeholder="Search prompts"
            value={questionFilters.q}
            onChange={(event) => setQuestionFilters((row) => ({ ...row, q: event.target.value }))}
          />
          <button
            type="button"
            className="learn-refresh"
            onClick={() => setNewQuestion(blankQuestion(Number(questionFilters.conceptId) || null))}
          >
            <Plus size={14} aria-hidden="true" /> New question
          </button>
        </div>

        <ul className="learn-lesson-list">
          {questions.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => openQuestion(item.id)}>
                <b>{(item.prompt || `Question ${item.id}`).slice(0, 70)}</b>
              </button>
              <span className="learn-lesson-info">
                <strong>{item.concept_name || typeById[item.question_type]?.label}</strong>
                <small>
                  {typeById[item.question_type]?.label || item.question_type}
                  {item.accuracy === null ? "" : ` · ${item.accuracy}%`}
                </small>
              </span>
              <StatusPill status={item.status} />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => duplicateQuestion(item.id)}
                aria-label="Duplicate question"
              >
                <Copy size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => removeQuestion(item.id)}
                aria-label="Delete question"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        {newQuestion ? (
          <section className="learn-new-form">
            <h3>New question</h3>
            <label>
              Concept
              <select
                value={newQuestion.question.concept_id ?? ""}
                onChange={(event) =>
                  setNewQuestion((row) => ({
                    ...row,
                    question: {
                      ...row.question,
                      concept_id: Number(event.target.value) || null,
                    },
                  }))
                }
              >
                <option value="">Unassigned</option>
                {concepts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="wide">
              English prompt
              <textarea
                rows={2}
                value={newQuestion.translations.en.prompt}
                onChange={(event) =>
                  setNewQuestion((row) => ({
                    ...row,
                    translations: {
                      ...row.translations,
                      en: { ...row.translations.en, prompt: event.target.value },
                    },
                  }))
                }
              />
            </label>
            <footer>
              <button type="button" className="button" onClick={createQuestion}>
                <Save size={14} aria-hidden="true" /> Create draft
              </button>
              <button type="button" className="btn-secondary" onClick={() => setNewQuestion(null)}>
                Cancel
              </button>
            </footer>
          </section>
        ) : null}

        {questionDraft ? questionEditor() : null}
      </div>
    );
  }
function optionHint(type) {
    if (type === "matching") return "One pair per line: left | right";
    if (type === "ordering") return "One step per line, already in the correct order";
    return "One option per line";
  }

  function answerKeyPanel() {
    const type = questionDraft.question.question_type;
    if (type === "reflection") {
      return <p className="learn-panel-hint">Reflections are never marked right or wrong.</p>;
    }
    if (type === "true_false") {
      return (
        <label>
          The statement is
          <select
            value={questionDraft.key.correct ? "true" : "false"}
            onChange={(event) => patchKey({ correct: event.target.value === "true" })}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </label>
      );
    }
    if (type === "multiple_choice" || type === "scenario") {
      return (
        <label>
          Correct option (counting from 0)
          <input
            type="number"
            min={0}
            value={questionDraft.key.correct_index}
            onChange={(event) => patchKey({ correct_index: event.target.value })}
          />
        </label>
      );
    }
    if (type === "multiple_select") {
      return (
        <label>
          Correct options (one index per line, counting from 0)
          <textarea
            rows={3}
            value={questionDraft.key.correct_indexes}
            onChange={(event) => patchKey({ correct_indexes: event.target.value })}
          />
        </label>
      );
    }
    if (type === "ordering") {
      return (
        <label>
          Correct sequence (positions in order, e.g. 1, 3, 2 - blank means as typed)
          <textarea
            rows={2}
            value={questionDraft.key.order}
            onChange={(event) => patchKey({ order: event.target.value })}
          />
        </label>
      );
    }
    if (type === "matching") {
      return (
        <label>
          Correct pairs (left-right positions, e.g. 1-2, 2-1 - blank means as typed)
          <textarea
            rows={2}
            value={questionDraft.key.pairs}
            onChange={(event) => patchKey({ pairs: event.target.value })}
          />
        </label>
      );
    }
    return (
      <p className="learn-panel-hint">
        List the accepted words in the language panel below; they are matched ignoring
        punctuation and capitalisation.
      </p>
    );
  }

  function validationPanel() {
    const report = questionDraft.validation;
    if (!report) return null;
    const rows = [
      ...(report.errors || []).map((row) => ({ ...row, level: "error" })),
      ...(report.warnings || []).map((row) => ({ ...row, level: "warning" })),
    ];
    if (rows.length === 0) {
      return (
        <div className="learn-validation learn-ready">
          <span className="learn-validation-title">Ready to publish</span>
        </div>
      );
    }
    return (
      <div className="learn-validation">
        <span className="learn-validation-title">
          {report.ready ? "Ready to publish" : "Not ready to publish"}
        </span>
        {rows.map((row, index) => (
          <p className={`learn-issue ${row.level}`} key={`${row.code}-${index}`}>
            <AlertTriangle size={14} aria-hidden="true" /> {row.message}
          </p>
        ))}
      </div>
    );
  }
function questionEditor() {
    const question = questionDraft.question;
    const type = question.question_type;
    const published = question.status === "published";

    return (
      <section className="learn-editor">
        <header className="learn-editor-head">
          <div className="learn-editor-title">
            <h2>{questionDraft.translations.en.prompt || "Untitled question"}</h2>
            <p className="learn-editor-meta">
              <StatusPill status={question.status} /> {typeById[type]?.label || type}
              {question.version > 1 ? ` · v${question.version}` : ""}
            </p>
          </div>
          <div className="learn-editor-actions">
            <button type="button" className="button" onClick={saveQuestion} disabled={Boolean(busy)}>
              <Save size={14} aria-hidden="true" /> Save
            </button>
            {published ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setQuestionStatus(question.id, false)}
                disabled={Boolean(busy)}
              >
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => publishQuestion(questionDraft, question.id)}
                disabled={Boolean(busy)}
              >
                Publish
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPreview((open) => !open)}
              aria-pressed={preview}
            >
              <Eye size={14} aria-hidden="true" /> Preview
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => removeQuestion(question.id)}
              disabled={Boolean(busy)}
            >
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setQuestionDraft(null)}
              aria-label="Close editor"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </header>

        {validationPanel()}

        <div className="learn-grid">
          <section className="learn-panel">
            <h3>Settings</h3>
            <label>
              Concept
              <select
                value={question.concept_id ?? ""}
                onChange={(event) =>
                  patchQuestion({ concept_id: Number(event.target.value) || null })
                }
              >
                <option value="">Unassigned</option>
                {concepts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={type}
                onChange={(event) => patchQuestion({ question_type: event.target.value })}
              >
                {questionTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cognitive level
              <select
                value={question.level}
                onChange={(event) => patchQuestion({ level: Number(event.target.value) })}
              >
                {LEVELS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Difficulty
              <select
                value={question.difficulty || "beginner"}
                onChange={(event) => patchQuestion({ difficulty: event.target.value })}
              >
                {DIFFICULTIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Weight
              <input
                type="number"
                min={1}
                value={question.weight ?? 1}
                onChange={(event) => patchQuestion({ weight: event.target.value })}
              />
            </label>
            <label>
              Scripture reference
              <input
                value={question.scripture_reference || ""}
                onChange={(event) => patchQuestion({ scripture_reference: event.target.value })}
              />
            </label>
            <label>
              Scripture translation
              <input
                value={question.scripture_translation || ""}
                onChange={(event) => patchQuestion({ scripture_translation: event.target.value })}
              />
            </label>
            <label>
              Tags (one per line)
              <textarea
                rows={2}
                value={question.tags || ""}
                onChange={(event) => patchQuestion({ tags: event.target.value })}
              />
            </label>
            <label>
              Linked lesson id
              <input
                type="number"
                value={question.learn_lesson_id ?? ""}
                onChange={(event) => patchQuestion({ learn_lesson_id: event.target.value })}
              />
            </label>
          </section>

          <section className="learn-panel">
            <h3>Answer key</h3>
            {answerKeyPanel()}
          </section>
{LANGUAGES.map((language) => (
            <section className="learn-panel" key={language}>
              <h3>
                {LANGUAGE_LABELS[language]}{" "}
                <span>{questionDraft.translations[language].prompt ? "written" : "missing"}</span>
              </h3>
              <label>
                Prompt
                <textarea
                  rows={2}
                  value={questionDraft.translations[language].prompt}
                  onChange={(event) =>
                    patchQuestionTranslation(language, { prompt: event.target.value })
                  }
                />
              </label>
              {type !== "true_false" && type !== "reflection" ? (
                <label>
                  Options - {optionHint(type)}
                  <textarea
                    rows={4}
                    value={questionDraft.translations[language].options}
                    onChange={(event) =>
                      patchQuestionTranslation(language, { options: event.target.value })
                    }
                  />
                </label>
              ) : null}
              {type === "fill_blank" ? (
                <label>
                  Accepted answers (one per line)
                  <textarea
                    rows={3}
                    value={questionDraft.translations[language].accepted}
                    onChange={(event) =>
                      patchQuestionTranslation(language, { accepted: event.target.value })
                    }
                  />
                </label>
              ) : null}
              <label>
                Why this is the answer
                <textarea
                  rows={3}
                  value={questionDraft.translations[language].explanation}
                  onChange={(event) =>
                    patchQuestionTranslation(language, { explanation: event.target.value })
                  }
                />
              </label>
              <label>
                Takeaway (try this)
                <textarea
                  rows={2}
                  value={questionDraft.translations[language].takeaway}
                  onChange={(event) =>
                    patchQuestionTranslation(language, { takeaway: event.target.value })
                  }
                />
              </label>
              <label>
                Application prompt
                <textarea
                  rows={2}
                  value={questionDraft.translations[language].application_prompt}
                  onChange={(event) =>
                    patchQuestionTranslation(language, {
                      application_prompt: event.target.value,
                    })
                  }
                />
              </label>
            </section>
          ))}

          {preview ? (
            <section className="learn-panel">
              <h3>
                Preview <span>exactly what a learner sees</span>
              </h3>
              <PracticeQuestion
                question={previewQuestion(questionDraft, {
                  conceptName: conceptNames[question.concept_id],
                  graded: typeById[type]?.graded,
                })}
                value={null}
                onChange={() => {}}
                t={p}
              />
            </section>
          ) : null}
        </div>
      </section>
    );
  }
function patchSet(patch) {
    setSetDraft((draft) => ({ ...draft, ...patch }));
  }

  function patchSetTranslation(language, patch) {
    setSetDraft((draft) => ({
      ...draft,
      translations: {
        ...draft.translations,
        [language]: { ...draft.translations[language], ...patch },
      },
    }));
  }

  function patchRule(key, value) {
    setSetDraft((draft) => ({ ...draft, rules: { ...draft.rules, [key]: value } }));
  }

  function setsPanel() {
    return (
      <div>
        <div className="learn-toolbar">
          <button type="button" className="learn-refresh" onClick={createSet}>
            <Plus size={14} aria-hidden="true" /> New set
          </button>
          <button type="button" className="learn-refresh" onClick={loadSets}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        </div>

        <ul className="learn-lesson-list">
          {sets.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => openSet(item.id)}>
                <b>{item.title || `Set ${item.id}`}</b>
              </button>
              <span className="learn-lesson-info">
                <strong>
                  {item.question_count} questions · {item.concept_count} concepts
                </strong>
                <small>
                  {item.mode} · {item.estimated_minutes} min
                </small>
              </span>
              <StatusPill status={item.status} />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => removeSet(item.id)}
                aria-label="Delete set"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        {setDraft ? (
          <section className="learn-editor">
            <header className="learn-editor-head">
              <div className="learn-editor-title">
                <h2>{setDraft.translations.en.title || "Untitled set"}</h2>
                <p className="learn-editor-meta">
                  <StatusPill status={setDraft.status} /> {setDraft.mode}
                </p>
              </div>
              <div className="learn-editor-actions">
                <button type="button" className="button" onClick={saveSet} disabled={Boolean(busy)}>
                  <Save size={14} aria-hidden="true" /> Save
                </button>
                {setDraft.status === "published" ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      run("publish-set", () => unpublishAdminSet(setDraft.id)).then(loadSets)
                    }
                    disabled={Boolean(busy)}
                  >
                    Unpublish
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => publishSet(setDraft.id)}
                    disabled={Boolean(busy)}
                  >
                    Publish
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSetDraft(null)}
                  aria-label="Close editor"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </header>
<div className="learn-grid">
              <section className="learn-panel">
                <h3>Rules</h3>
                <label>
                  Mode
                  <select
                    value={setDraft.mode || "manual"}
                    onChange={(event) => patchSet({ mode: event.target.value })}
                  >
                    {SET_MODES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Estimated minutes
                  <input
                    type="number"
                    value={setDraft.estimated_minutes ?? 10}
                    onChange={(event) => patchSet({ estimated_minutes: event.target.value })}
                  />
                </label>
                <label>
                  Question count
                  <input
                    type="number"
                    value={setDraft.rules?.count ?? 0}
                    onChange={(event) => patchRule("count", event.target.value)}
                  />
                </label>
                <label>
                  From weak concepts
                  <input
                    type="number"
                    value={setDraft.rules?.weak_concepts ?? 0}
                    onChange={(event) => patchRule("weak_concepts", event.target.value)}
                  />
                </label>
                <label>
                  From new concepts
                  <input
                    type="number"
                    value={setDraft.rules?.new_concepts ?? 0}
                    onChange={(event) => patchRule("new_concepts", event.target.value)}
                  />
                </label>
                <label>
                  From reviews
                  <input
                    type="number"
                    value={setDraft.rules?.review ?? 0}
                    onChange={(event) => patchRule("review", event.target.value)}
                  />
                </label>
                <label>
                  Concept ids (one per line)
                  <textarea
                    rows={4}
                    value={setDraft.concept_ids_text || ""}
                    onChange={(event) => patchSet({ concept_ids_text: event.target.value })}
                  />
                </label>
              </section>

              <section className="learn-panel">
                <h3>Languages</h3>
                {LANGUAGES.map((language) => (
                  <div className="learn-lang" key={language}>
                    <span className="learn-lang-label">{LANGUAGE_LABELS[language]}</span>
                    <input
                      placeholder="Title"
                      value={setDraft.translations[language].title}
                      onChange={(event) =>
                        patchSetTranslation(language, { title: event.target.value })
                      }
                    />
                    <textarea
                      rows={3}
                      placeholder="Description"
                      value={setDraft.translations[language].description}
                      onChange={(event) =>
                        patchSetTranslation(language, { description: event.target.value })
                      }
                    />
                  </div>
                ))}
                {setDraft.mode === "manual" ? (
                  <label>
                    Questions in order (one id per line)
                    <textarea
                      rows={6}
                      value={setDraft.questions_text || ""}
                      onChange={(event) => patchSet({ questions_text: event.target.value })}
                    />
                  </label>
                ) : (
                  <p className="learn-panel-hint">
                    This set draws its own questions from the rules above, so there is no
                    manual order to keep.
                  </p>
                )}
              </section>
            </div>
          </section>
        ) : null}
      </div>
    );
  }
function patchChallenge(patch) {
    setChallengeDraft((draft) => ({ ...draft, ...patch }));
  }

  function patchChallengeTranslation(language, patch) {
    setChallengeDraft((draft) => ({
      ...draft,
      translations: {
        ...draft.translations,
        [language]: { ...draft.translations[language], ...patch },
      },
    }));
  }

  function challengesPanel() {
    return (
      <div>
        <div className="learn-toolbar">
          <button type="button" className="learn-refresh" onClick={createChallenge}>
            <Plus size={14} aria-hidden="true" /> New challenge
          </button>
          <button type="button" className="learn-refresh" onClick={loadChallenges}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
          <span className="learn-panel-hint">
            Existing challenges can be published or removed here. Their text is edited in
            the database until the API can return a single challenge document.
          </span>
        </div>

        <ul className="learn-lesson-list">
          {challenges.map((item) => (
            <li key={item.id}>
              <b>{item.title || `Challenge ${item.id}`}</b>
              <span className="learn-lesson-info">
                <strong>{item.concept_name || "Any concept"}</strong>
                <small>{item.swahili_title ? "Also in Swahili" : "English only"}</small>
              </span>
              <StatusPill status={item.status} />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setChallengeStatus(item.id, item.status === "published")}
                aria-label={item.status === "published" ? "Unpublish challenge" : "Publish challenge"}
              >
                {item.status === "published" ? (
                  <X size={13} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={13} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => removeChallenge(item.id)}
                aria-label="Delete challenge"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        {challengeDraft ? (
          <section className="learn-editor">
            <header className="learn-editor-head">
              <div className="learn-editor-title">
                <h2>{challengeDraft.translations.en.title || "Untitled challenge"}</h2>
                <p className="learn-editor-meta">
                  <StatusPill status={challengeDraft.status} />
                </p>
              </div>
              <div className="learn-editor-actions">
                <button type="button" className="button" onClick={saveChallenge} disabled={Boolean(busy)}>
                  <Save size={14} aria-hidden="true" /> Save
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setChallengeStatus(challengeDraft.id, challengeDraft.status === "published")}
                  disabled={Boolean(busy)}
                >
                  {challengeDraft.status === "published" ? "Unpublish" : "Publish"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setChallengeDraft(null)}
                  aria-label="Close editor"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </header>
<div className="learn-grid">
              <section className="learn-panel">
                <h3>Settings</h3>
                <label>
                  Concept
                  <select
                    value={challengeDraft.concept_id ?? ""}
                    onChange={(event) =>
                      patchChallenge({ concept_id: Number(event.target.value) || null })
                    }
                  >
                    <option value="">Any concept</option>
                    {concepts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Difficulty
                  <select
                    value={challengeDraft.difficulty || "beginner"}
                    onChange={(event) => patchChallenge({ difficulty: event.target.value })}
                  >
                    {DIFFICULTIES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Display order
                  <input
                    type="number"
                    value={challengeDraft.display_order ?? 0}
                    onChange={(event) => patchChallenge({ display_order: event.target.value })}
                  />
                </label>
              </section>

              <section className="learn-panel">
                <h3>Languages</h3>
                {LANGUAGES.map((language) => (
                  <div className="learn-lang" key={language}>
                    <span className="learn-lang-label">{LANGUAGE_LABELS[language]}</span>
                    <input
                      placeholder="Title"
                      value={challengeDraft.translations[language].title}
                      onChange={(event) =>
                        patchChallengeTranslation(language, { title: event.target.value })
                      }
                    />
                    <textarea
                      rows={4}
                      placeholder="What should the learner actually do?"
                      value={challengeDraft.translations[language].prompt}
                      onChange={(event) =>
                        patchChallengeTranslation(language, { prompt: event.target.value })
                      }
                    />
                  </div>
                ))}
              </section>
            </div>
          </section>
        ) : null}
      </div>
    );
  }
const XP_KEYS = ["correct", "reflection", "session", "review", "application", "achievement"];
  const STAGES = ["new", "learning", "developing", "strong", "mastered"];

  function settingsPanel() {
    if (!settingsDraft) return <p className="learn-panel-hint">Loading settings…</p>;
    const sizes = settingsDraft.session_sizes || {};
    const minuteRows = Object.entries(sizes.minutes || {});

    return (
      <div>
        <div className="learn-editor-actions">
          <button type="button" className="button" onClick={saveSettings} disabled={Boolean(busy)}>
            <Save size={14} aria-hidden="true" /> {busy === "settings" ? "Saving…" : "Save settings"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setSettingsDraft(null)}>
            Discard changes
          </button>
        </div>

        <div className="learn-grid">
          <section className="learn-panel">
            <h3>Mastery thresholds</h3>
            {STAGES.map((stage) => (
              <label key={stage}>
                {stage}
                <span className="learn-block-fields">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settingsDraft.mastery_thresholds?.[stage]?.[0] ?? 0}
                    onChange={(event) => patchBand(stage, 0, event.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settingsDraft.mastery_thresholds?.[stage]?.[1] ?? 100}
                    onChange={(event) => patchBand(stage, 1, event.target.value)}
                  />
                </span>
              </label>
            ))}
          </section>

          <section className="learn-panel">
            <h3>Experience</h3>
            {XP_KEYS.map((key) => (
              <label key={key}>
                {key}
                <input
                  type="number"
                  min={0}
                  value={settingsDraft.xp_values?.[key] ?? 0}
                  onChange={(event) => patchXp(key, event.target.value)}
                />
              </label>
            ))}
            <label>
              Question limit per session
              <input
                type="number"
                min={1}
                value={settingsDraft.question_limit ?? 40}
                onChange={(event) => patchSettings({ question_limit: event.target.value })}
              />
            </label>
          </section>

          <section className="learn-panel">
            <h3>Review ladder and streaks</h3>
            <label>
              Days between reviews (one per rung)
              <textarea
                rows={2}
                value={(settingsDraft.review_intervals || []).join(", ")}
                onChange={(event) =>
                  patchSettings({
                    review_intervals: linesToArray(event.target.value.replace(/,/g, "\n")).map(
                      Number,
                    ),
                  })
                }
              />
            </label>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={Boolean(settingsDraft.streak_settings?.enabled)}
                  onChange={(event) =>
                    patchSettings({
                      streak_settings: {
                        ...settingsDraft.streak_settings,
                        enabled: event.target.checked,
                      },
                    })
                  }
                />{" "}
                Streaks enabled
              </span>
            </label>
            <label>
              Grace days
              <input
                type="number"
                min={0}
                max={7}
                value={settingsDraft.streak_settings?.grace_days ?? 0}
                onChange={(event) =>
                  patchSettings({
                    streak_settings: {
                      ...settingsDraft.streak_settings,
                      grace_days: event.target.value,
                    },
                  })
                }
              />
            </label>
          </section>
<section className="learn-panel">
            <h3>Session sizes</h3>
            {["quick", "normal", "deep"].map((key) => (
              <label key={key}>
                {key}
                <input
                  type="number"
                  min={1}
                  value={sizes[key] ?? 0}
                  onChange={(event) =>
                    patchSettings({ session_sizes: { ...sizes, [key]: event.target.value } })
                  }
                />
              </label>
            ))}
            {minuteRows.map(([minutes, count]) => (
              <label key={minutes}>
                {minutes} minutes
                <input
                  type="number"
                  min={1}
                  value={count}
                  onChange={(event) =>
                    patchSettings({
                      session_sizes: {
                        ...sizes,
                        minutes: { ...sizes.minutes, [minutes]: Number(event.target.value) },
                      },
                    })
                  }
                />
              </label>
            ))}
          </section>

          <section className="learn-panel">
            <h3>Question types offered</h3>
            {questionTypes.map((item) => (
              <label key={item.id}>
                <span>
                  <input
                    type="checkbox"
                    checked={(settingsDraft.enabled_types || []).includes(item.id)}
                    onChange={() => toggleType(item.id)}
                  />{" "}
                  {item.label}
                </span>
              </label>
            ))}
          </section>

          <section className="learn-panel">
            <h3>Reminder defaults</h3>
            <label>
              Frequency
              <select
                value={settingsDraft.reminder_defaults?.frequency || "daily"}
                onChange={(event) =>
                  patchSettings({
                    reminder_defaults: {
                      ...settingsDraft.reminder_defaults,
                      frequency: event.target.value,
                    },
                  })
                }
              >
                <option value="daily">daily</option>
                <option value="weekdays">weekdays</option>
                <option value="weekly">weekly</option>
              </select>
            </label>
            <label>
              Time
              <input
                type="time"
                value={settingsDraft.reminder_defaults?.time || "08:00"}
                onChange={(event) =>
                  patchSettings({
                    reminder_defaults: {
                      ...settingsDraft.reminder_defaults,
                      time: event.target.value,
                    },
                  })
                }
              />
            </label>
          </section>
        </div>
      </div>
    );
  }
function insightsPanel() {
    const totals = analytics?.totals || {};
    return (
      <div className="learn-grid">
        <section className="learn-panel">
          <h3>Attempts</h3>
          <div className="learn-metric-grid">
            {metric("Attempts", totals.attempts)}
            {metric("Graded", totals.graded)}
            {metric("Correct %", totals.accuracy)}
            {metric("Reflections", totals.reflections)}
            {metric("Sessions", totals.sessions)}
            {metric("Completed", totals.completed_sessions)}
            {metric("Completion %", totals.completion_rate)}
            {metric("Avg questions reached", totals.average_position)}
            {metric("Challenges done", totals.applications_done)}
          </div>
        </section>

        <section className="learn-panel">
          <h3>Most missed</h3>
          <ul className="learn-top-list">
            {(analytics?.most_missed || []).map((item) => (
              <li key={item.question_id}>
                <strong>{(item.prompt || `Question ${item.question_id}`).slice(0, 60)}</strong>
                <span>
                  {item.accuracy}% · {item.attempts} attempts
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="learn-panel">
          <h3>Most practised</h3>
          <ul className="learn-top-list">
            {(analytics?.most_practiced || []).map((item) => (
              <li key={item.question_id}>
                <strong>{(item.prompt || `Question ${item.question_id}`).slice(0, 60)}</strong>
                <span>{item.attempts} attempts</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="learn-panel">
          <h3>Strongest concepts</h3>
          <ul className="learn-top-list">
            {(analytics?.strongest_concepts || []).map((item) => (
              <li key={item.concept_id}>
                <strong>{item.name}</strong>
                <span>{item.mastery}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="learn-panel">
          <h3>Question types</h3>
          <ul className="learn-top-list">
            {(analytics?.question_types || []).map((item) => (
              <li key={item.type}>
                <strong>{typeById[item.type]?.label || item.type}</strong>
                <span>{item.attempts}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="learn-panel">
          <h3>Languages in use</h3>
          <ul className="learn-top-list">
            {(analytics?.language_usage || []).map((item) => (
              <li key={item.language}>
                <strong>{LANGUAGE_LABELS[item.language] || item.language}</strong>
                <span>{item.events} events</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }
// ---- shell ------------------------------------------------------------
  return (
    <div className="learn-admin learn-admin--page">
      <header className="learn-editor-head">
        <div className="learn-editor-title">
          <h1>{p.adminTitle}</h1>
          <p className="learn-editor-meta">
            <Link to="/admin">
              <ArrowLeft size={13} aria-hidden="true" /> Back to the workspace
            </Link>
          </p>
        </div>
        <div className="learn-editor-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (tab === "overview") loadOverview();
              else if (tab === "insights") loadInsights();
              else if (tab === "sets") loadSets();
              else if (tab === "challenges") loadChallenges();
              else if (tab === "concepts") loadConcepts();
              else if (tab === "questions") loadQuestions();
              setNotice("");
            }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>

      <nav className="learn-tabs" aria-label="Practice studio sections">
        {TABS.map(({ id, label, icon: TabIcon }) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              setNotice("");
            }}
          >
            <TabIcon size={14} aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>

      {error ? <div className="cms-alert">{error}</div> : null}
      {notice ? <p className="learn-dirty">{notice}</p> : null}

      {tab === "overview" ? overviewPanel() : null}
      {tab === "concepts" ? conceptsPanel() : null}
      {tab === "questions" ? questionsPanel() : null}
      {tab === "sets" ? setsPanel() : null}
      {tab === "challenges" ? challengesPanel() : null}
      {tab === "settings" ? settingsPanel() : null}
      {tab === "insights" ? insightsPanel() : null}
    </div>
  );
}
