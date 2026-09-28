import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import { getLearnLessonById, recordLearnEvent, saveLearnProgress } from "../services/learnApi";
import { getImageUrl } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import "../learn.css";

/** Turn a plain video URL into something an <iframe> can play. */
function toEmbedUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if ((host === "youtube.com" || host === "m.youtube.com") && parsed.searchParams.get("v")) {
      return `https://www.youtube-nocookie.com/embed/${parsed.searchParams.get("v")}`;
    }
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed${parsed.pathname}`;
    if (host === "vimeo.com") return `https://player.vimeo.com/video${parsed.pathname}`;
    return url;
  } catch {
    return url;
  }
}

/** Hosts with a real embed player; everything else prefers a native file. */
function isEmbedProvider(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return ["youtube.com", "m.youtube.com", "youtu.be", "vimeo.com"].includes(host);
  } catch {
    return false;
  }
}

/** True for URLs a native <video>/<audio> element can play directly. */
function isDirectMediaUrl(url) {
  if (!url) return false;
  if (url.startsWith("/uploads/")) return true;
  const path = url.split("?")[0].toLowerCase();
  return /\.(mp4|webm|ogv|ogg|mov|m4v|mp3|wav|oga|m4a|aac|flac)$/.test(path);
}

/**
 * The lesson viewer: renders one published lesson's blocks, keeps answers and
 * reading position saved (debounced), and marks completion.
 *
 * Progress is written through the same endpoints whether the visitor is
 * signed in or anonymous - the X-Learn-Client header carries their identity -
 * so nothing is lost when they later create an account.
 */
export default function LessonRunner() {
  const { lessonId } = useParams();
  const { language } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [responses, setResponses] = useState({});
  const [doneBlocks, setDoneBlocks] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [savingComplete, setSavingComplete] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    let stale = false;
    getLearnLessonById(Number(lessonId), language)
      .then((payload) => {
        if (stale) return;
        setError("");
        setData(payload);
        setResponses(payload.my_progress?.responses || {});
        setDoneBlocks(payload.my_progress?.completed_blocks || []);
        setCompleted(Boolean(payload.my_progress?.completed));
        setSaveNote("");
        recordLearnEvent({
          eventType: "lesson_view",
          lessonId: payload.lesson.id,
          pathId: payload.path.id,
          language,
        });
      })
      .catch((err) => {
        if (stale) return;
        setError(err.message || "Could not load this lesson.");
      });
    return () => {
      stale = true;
    };
  }, [lessonId, language]);

  // Flush any pending debounced save when the learner leaves the lesson.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const patchProgress = useCallback(
    (patch) => {
      if (!data) return Promise.resolve(null);
      setSaveNote("Saving…");
      return saveLearnProgress(data.lesson.id, patch, language)
        .then(() => setSaveNote("Saved"))
        .catch(() => setSaveNote("Could not save - check your connection"));
    },
    [data, language]
  );

  const scheduleSave = useCallback(
    (patch) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => patchProgress(patch), 650);
    },
    [patchProgress]
  );

  /** A reflection/discussion answer (or a quiz choice - always an int there). */
  const saveResponse = (blockId, value) => {
    const next = { ...responses, [blockId]: value };
    setResponses(next);
    scheduleSave({ responses: next, completed_blocks: doneBlocks });
  };

  const togglePractice = (blockId) => {
    const wasDone = doneBlocks.includes(blockId);
    const next = wasDone
      ? doneBlocks.filter((id) => id !== blockId)
      : [...doneBlocks, blockId];
    setDoneBlocks(next);
    scheduleSave({ responses, completed_blocks: next });
    if (!wasDone) {
      recordLearnEvent({
        eventType: "practice_done",
        lessonId: data.lesson.id,
        pathId: data.path.id,
        language,
        metadata: { block_id: blockId },
      });
    }
  };

  const markComplete = async () => {
    if (!data) return;
    clearTimeout(timerRef.current);
    setSavingComplete(true);
    try {
      const result = await saveLearnProgress(
        data.lesson.id,
        {
          responses,
          completed_blocks: doneBlocks,
          completed: true,
          block_position: Math.max(doneBlocks.length, 1),
        },
        language
      );
      setCompleted(true);
      setSaveNote("Completed");
      recordLearnEvent({
        eventType: "lesson_complete",
        lessonId: data.lesson.id,
        pathId: data.path.id,
        language,
      });
      if (result?.progress?.completed_path) {
        recordLearnEvent({ eventType: "path_complete", pathId: data.path.id, language });
      }
    } catch (err) {
      setSaveNote(err.message || "Could not save completion");
    } finally {
      setSavingComplete(false);
    }
  };

  const markIncomplete = async () => {
    if (!data) return;
    clearTimeout(timerRef.current);
    setSavingComplete(true);
    try {
      await saveLearnProgress(
        data.lesson.id,
        { completed: false, block_position: Math.max(doneBlocks.length, 1) },
        language
      );
      setCompleted(false);
      setSaveNote("");
    } catch (err) {
      setSaveNote(err.message || "Could not save");
    } finally {
      setSavingComplete(false);
    }
  };

  /** Blocks grouped so each section change gets its own label divider. */
  const sections = useMemo(() => {
    const groups = [];
    for (const block of data?.lesson?.blocks || []) {
      const last = groups[groups.length - 1];
      if (!last || last.section !== block.section) {
        groups.push({
          section: block.section,
          label: block.section_label || block.section,
          blocks: [block],
        });
      } else {
        last.blocks.push(block);
      }
    }
    return groups;
  }, [data]);

  /** One published block -> its rendered (and where needed, interactive) form. */
  const renderBlock = (block) => {
    const d = block.data || {};
    const cfg = block.config || {};
    const ref = block.reference;

    switch (block.block_type) {
      case "heading":
        return (
          <h2 className="lb lb-heading" key={block.id}>
            {d.text}
          </h2>
        );

      case "text":
        return (
          <p className="lb lb-text" key={block.id}>
            {d.text}
          </p>
        );

      case "scripture":
        return (
          <blockquote className="lb lb-scripture" key={block.id}>
            <p>{d.text}</p>
            <footer>{[d.reference, d.version].filter(Boolean).join(" · ")}</footer>
          </blockquote>
        );

      case "quote":
        return (
          <figure className="lb lb-quote" key={block.id}>
            <p>“{d.text}”</p>
            {d.attribution ? <cite>{d.attribution}</cite> : null}
          </figure>
        );

      case "image": {
        const url = getImageUrl(cfg.url) || cfg.url;
        if (!url) return null;
        return (
          <figure className="lb lb-figure" key={block.id}>
            <img src={url} alt={d.alt || ""} loading="lazy" />
            {d.caption ? <figcaption>{d.caption}</figcaption> : null}
          </figure>
        );
      }

      case "video": {
        if (!cfg.url) return null;
        // Uploaded files and direct media links play in a native <video>;
        // only real embed providers (YouTube/Vimeo) need the iframe.
        const fileUrl = getImageUrl(cfg.url) || cfg.url;
        const useFrame = isEmbedProvider(cfg.url) || !isDirectMediaUrl(cfg.url);
        return (
          <div className="lb" key={block.id}>
            <div className="lb-media-frame">
              {useFrame ? (
                <iframe
                  src={toEmbedUrl(cfg.url)}
                  title={d.caption || "Lesson video"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              ) : (
                <video
                  className="lb-video"
                  controls
                  preload="metadata"
                  playsInline
                  src={fileUrl}
                  aria-label={d.caption || "Lesson video"}
                />
              )}
            </div>
            {d.caption ? <p className="lb-caption">{d.caption}</p> : null}
          </div>
        );
      }

      case "audio":
        if (!cfg.url) return null;
        return (
          <div className="lb" key={block.id}>
            <audio className="lb-audio" controls preload="metadata" src={getImageUrl(cfg.url) || cfg.url} />
            {d.caption ? <p className="lb-caption">{d.caption}</p> : null}
          </div>
        );

      case "story": {
        const title = d.title || ref?.title || "Story";
        if (ref && !ref.available) {
          return (
            <div className="lb lb-story" key={block.id}>
              <h4>{title}</h4>
              <p>This story is not available right now.</p>
            </div>
          );
        }
        if (ref) {
          return (
            <Link className="lb lb-story" key={block.id} to={`/stories/${ref.id}`}>
              <h4>{title}</h4>
              <p>{d.note || "Open the story →"}</p>
            </Link>
          );
        }
        return (
          <div className="lb lb-story" key={block.id}>
            <h4>{title}</h4>
            {d.note ? <p>{d.note}</p> : null}
          </div>
        );
      }

      case "reflection":
      case "discussion":
        return (
          <div className="lb lb-reflect" key={block.id}>
            <h4>{d.prompt}</h4>
            <textarea
              value={typeof responses[block.id] === "string" ? responses[block.id] : ""}
              maxLength={2000}
              placeholder={d.placeholder || "Write as much or as little as you like…"}
              aria-label={d.prompt || "Your answer"}
              onChange={(event) => saveResponse(block.id, event.target.value)}
            />
            {d.notes ? <p className="lb-note">{d.notes}</p> : null}
            <p className="lb-note">Saved as you go - only you will see this.</p>
          </div>
        );

      case "quiz": {
        const rawOptions = Array.isArray(d.options)
          ? d.options
          : String(d.options || "").split("\n");
        const options = rawOptions.map((option) => String(option).trim()).filter(Boolean);
        const correct = Number.isInteger(cfg.correct_index) ? cfg.correct_index : -1;
        const chosen = Number(responses[block.id] ?? -1);
        const answered = chosen >= 0 && chosen < options.length;
        const isCorrect = answered && chosen === correct;

        return (
          <div className="lb lb-quiz" key={block.id}>
            <h4>{d.question}</h4>
            <div className="lb-options" role="radiogroup" aria-label={d.question}>
              {options.map((option, index) => (
                <label
                  key={`${block.id}-${index}`}
                  className={`lb-option ${answered && chosen === index ? "is-picked" : ""} ${
                    answered && index === correct ? "is-correct" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name={`quiz-${block.id}`}
                    checked={chosen === index}
                    onChange={() => saveResponse(block.id, index)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            {answered ? (
              <p className={`lb-feedback ${isCorrect ? "is-correct" : ""}`}>
                {isCorrect ? <Check size={15} /> : <HelpCircle size={15} />}
                <span>
                  {isCorrect
                    ? `Right. ${d.explanation || ""}`
                    : `Not quite. ${d.explanation || "Take another look above and try again."}`}
                </span>
              </p>
            ) : null}
          </div>
        );
      }

      case "practice": {
        const done = doneBlocks.includes(block.id);
        return (
          <div className="lb lb-practice" key={block.id}>
            <h4>{d.title}</h4>
            <p>{d.instructions}</p>
            <label className="lb-check">
              <input
                type="checkbox"
                checked={done}
                onChange={() => togglePractice(block.id)}
              />
              <span>{done ? "Done - nice work." : "I have done this"}</span>
            </label>
          </div>
        );
      }

      case "prayer":
        return (
          <div className="lb lb-prayer" key={block.id}>
            <p>{d.text}</p>
          </div>
        );

      case "callout":
        return (
          <aside
            className={`lb lb-callout ${cfg.tone === "warning" ? "is-warning" : ""}`}
            key={block.id}
          >
            {d.title ? <h4>{d.title}</h4> : null}
            <p>{d.text}</p>
          </aside>
        );

      case "next_step":
        return (
          <div className="lb lb-nextstep" key={block.id}>
            <h4>{d.title || "Next step"}</h4>
            <p>{d.text}</p>
          </div>
        );

      case "resource": {
        const url = (ref && !ref.available ? null : ref?.url) || cfg.url;
        return (
          <div className="lb lb-resource" key={block.id}>
            <div>
              <h4>{d.title || ref?.title || "Resource"}</h4>
              <p>{d.description || "Open this resource in a new tab."}</p>
            </div>
            {url ? (
              <a className="learn-chip" href={url} target="_blank" rel="noreferrer">
                Open <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : (
              <span className="lb-note">Not available right now</span>
            )}
          </div>
        );
      }

      case "divider":
        return <hr className="lb lb-divider" key={block.id} />;

      default:
        return null;
    }
  };

  if (error) {
    return (
      <div className="learn-lesson-shell">
        <div className="cms-alert">{error}</div>
        <p style={{ marginTop: 16 }}>
          <Link to="/learn">
            <ArrowLeft size={14} aria-hidden="true" /> Back to all learning paths
          </Link>
        </p>
      </div>
    );
  }

  if (!data || data.lesson.id !== Number(lessonId)) {
    return (
      <div className="learn-lesson-shell">
        <p style={{ color: "var(--text-muted)" }}>Loading lesson…</p>
      </div>
    );
  }

  const { path, lesson, navigation, completion } = data;
  const objective = lesson.objective || {};
  const hasObjective = objective.before || objective.after || objective.action;

  return (
    <div className="learn-lesson-shell">
      <nav className="learn-lesson-breadcrumb" aria-label="Where you are">
        <Link to="/learn">
          <ArrowLeft size={13} aria-hidden="true" /> Learn
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/learn/paths/${path.slug}`}>{path.title}</Link>
        <span aria-hidden="true">/</span>
        <span>
          Lesson {navigation.index} of {navigation.total}
        </span>
        {lesson.estimated_minutes ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Clock size={12} aria-hidden="true" /> {lesson.estimated_minutes} min
          </span>
        ) : null}
      </nav>

      <header className="learn-lesson-head">
        <p className="eyebrow">
          Lesson {navigation.index} of {navigation.total}
        </p>
        <h1>{lesson.title}</h1>
        {lesson.summary ? <p className="learn-lesson-summary-text">{lesson.summary}</p> : null}
      </header>

      {hasObjective ? (
        <section className="learn-objective" aria-label="What this lesson covers">
          {objective.before ? (
            <article>
              <small>Before</small>
              <p>{objective.before}</p>
            </article>
          ) : null}
          {objective.after ? (
            <article>
              <small>After</small>
              <p>{objective.after}</p>
            </article>
          ) : null}
          {objective.action ? (
            <article>
              <small>Practice</small>
              <p>{objective.action}</p>
            </article>
          ) : null}
        </section>
      ) : null}

      {sections.map((group) => (
        <section key={`${group.section}-${group.blocks[0].id}`} aria-label={group.label}>
          <p className="learn-section-label">{group.label}</p>
          <div className="learn-blocks">{group.blocks.map(renderBlock)}</div>
        </section>
      ))}

      <p className="learn-save-state" aria-live="polite">
        {saveNote}
      </p>

      {completed ? (
        <section className="learn-completion">
          <h2>
            <CheckCircle2 size={22} aria-hidden="true" /> Lesson complete
          </h2>
          <p>
            {navigation.is_last && completion?.message
              ? completion.message
              : "Nicely done - your place in the path is saved."}
          </p>
          {navigation.is_last && completion?.path_completed && completion.next_path ? (
            <p>
              Keep going with{" "}
              <Link to={`/learn/paths/${completion.next_path.slug}`}>
                {completion.next_path.title}
              </Link>
              .
            </p>
          ) : null}
          <div className="learn-actions" style={{ border: 0, paddingTop: 0, marginTop: 4 }}>
            {navigation.next ? (
              <Link className="button" to={`/learn/lesson/${navigation.next.id}`}>
                Next lesson <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ) : (
              <Link className="button" to={`/learn/paths/${path.slug}`}>
                Back to path <ArrowRight size={15} aria-hidden="true" />
              </Link>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={markIncomplete}
              disabled={savingComplete}
            >
              Mark as in progress
            </button>
          </div>
        </section>
      ) : (
        <div className="learn-actions">
          <button
            type="button"
            className="button"
            onClick={markComplete}
            disabled={savingComplete}
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            {savingComplete ? "Saving…" : "Mark lesson complete"}
          </button>
          <span className="lb-note">
            Your answers and place are saved as you go - with or without an account.
          </span>
        </div>
      )}

      <nav className="learn-footer-nav" aria-label="Previous and next lesson">
        {navigation.previous ? (
          <Link to={`/learn/lesson/${navigation.previous.id}`}>
            <ArrowLeft size={15} aria-hidden="true" />
            <span>{navigation.previous.title}</span>
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        {navigation.next ? (
          <Link to={`/learn/lesson/${navigation.next.id}`} style={{ textAlign: "right" }}>
            <span>{navigation.next.title}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        ) : (
          <Link to={`/learn/paths/${path.slug}`} style={{ textAlign: "right" }}>
            <span>Finish the path</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      </nav>
    </div>
  );
}




