import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Minus,
  Moon,
  Plus,
  Sun,
} from "lucide-react";

/**
 * A reading experience, not a card with a file link.
 *
 * A book here is an ordered set of chapters, each of which may carry reading
 * text, a file, or both. Text is preferred when it exists because it is far
 * more accessible than a scanned page; a chapter with only a file falls back
 * to the document pane rather than being unreadable.
 *
 * Text size and reading mode are the two preferences every reader wants and
 * almost no site offers. Both are remembered, because setting a comfortable
 * size once and losing it on the next chapter is worse than not offering it.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { fill } from "../i18n/resourceCopy";
import { getImageUrl } from "../services/api";
import DocumentViewer from "./DocumentViewer";

const SIZES = [16, 18, 20, 22, 25];
const MODES = ["light", "warm", "dark"];
const DEFAULT_SIZE_INDEX = 1;

/** The reading-mode preference, kept verbatim. */
function readMode() {
  try {
    const value = localStorage.getItem("res-book-mode");
    return MODES.includes(value) ? value : "light";
  } catch {
    // Private browsing can refuse localStorage; reading still works.
    return "light";
  }
}

/**
 * The text-size preference, stored as the size in pixels rather than the string
 * an <option> would give. Keeping it numeric means the button that increases
 * the size can ask "am I already at the top?" with a comparison rather than
 * with a string sort.
 */
function readSizeIndex() {
  try {
    const value = Number(localStorage.getItem("res-book-size"));
    const index = SIZES.indexOf(value);
    return index >= 0 ? index : DEFAULT_SIZE_INDEX;
  } catch {
    return DEFAULT_SIZE_INDEX;
  }
}

function remember(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // The preference simply will not persist; reading is unaffected.
  }
}

export default function BookReader({ resource }) {
  const { t } = useLanguage();

  // The chapters come from the server as one ordered array, so no
  // memoisation is needed to keep the identity stable.
  const chapters =
    Array.isArray(resource?.chapters) ? resource.chapters : [];

  const [index, setIndex] = useState(0);
  const [sizeIndex, setSizeIndex] = useState(readSizeIndex);
  const [mode, setMode] = useState(readMode);

  const chapter = chapters[index] || null;
  const cover = getImageUrl(resource?.cover_url || null);

  useEffect(() => {
    remember("res-book-size", SIZES[sizeIndex]);
  }, [sizeIndex]);

  useEffect(() => {
    remember("res-book-mode", mode);
  }, [mode]);

  const body = chapter?.body;
  const file = chapter?.file_url
    ? {
        external: /^https?:\/\//.test(chapter.file_url),
        url: chapter.file_url,
        kind: /\.pdf($|\?)/i.test(chapter.file_url) ? "pdf" : "document",
      }
    : null;

  // A chapter with no text but a file falls back to the document viewer; a
  // chapter with neither says so rather than showing an empty page.
  const canReadText = Boolean(body);
  const canReadFile = Boolean(file) && (file.kind === "pdf" || file.external);

  const size = SIZES[sizeIndex];

  return (
    <div className="res-viewer">
      <div className="res-book">
        <aside className="res-book-aside">
          <div className="res-book-cover">
            {cover ? (
              <img src={cover} alt="" loading="lazy" />
            ) : (
              <div className="res-card-placeholder">
                <BookOpen size={30} strokeWidth={1.3} aria-hidden="true" />
              </div>
            )}
          </div>

          {chapters.length > 0 && (
            <nav aria-label={t.resources.bookContents}>
              <h3 className="res-panel-heading">{t.resources.bookContents}</h3>
              <ul className="res-toc">
                {chapters.map((item, itemIndex) => (
                  <li key={item.id ?? itemIndex}>
                    <button
                      type="button"
                      onClick={() => setIndex(itemIndex)}
                      aria-current={itemIndex === index}
                    >
                      {item.title || `${itemIndex + 1}`}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>

        <div className="res-reading" data-mode={mode}>
          <div className="res-reading-bar">
            <h2>{chapter?.title || resource?.title}</h2>

            {chapters.length > 1 && (
              <span className="res-text-size">
                {fill(t.resources.chapterProgress, {
                  current: index + 1,
                  total: chapters.length,
                })}
              </span>
            )}

            <div className="res-text-size">
              <button
                type="button"
                onClick={() =>
                  setSizeIndex((value) => Math.max(0, value - 1))
                }
                disabled={sizeIndex <= 0}
                aria-label={t.resources.decreaseText}
              >
                <Minus size={14} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() =>
                  setSizeIndex((value) =>
                    Math.min(SIZES.length - 1, value + 1),
                  )
                }
                disabled={sizeIndex >= SIZES.length - 1}
                aria-label={t.resources.increaseText}
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>

            {/* One control cycles the three reading surfaces rather than three
                buttons competing for the same row. The current mode is in the
                label, so the state is never conveyed by the icon alone. */}
            <button
              type="button"
              className="res-icon-btn"
              onClick={() =>
                setMode((current) =>
                  MODES[(MODES.indexOf(current) + 1) % MODES.length],
                )
              }
              aria-label={`${t.resources.readingMode}: ${
                mode === "light"
                  ? t.resources.lightMode
                  : mode === "warm"
                    ? t.resources.sepiaMode
                    : t.resources.darkMode
              }`}
            >
              {mode === "light" ? (
                <Sun size={15} aria-hidden="true" />
              ) : mode === "warm" ? (
                <BookOpen size={15} aria-hidden="true" />
              ) : (
                <Moon size={15} aria-hidden="true" />
              )}
            </button>
          </div>

          {canReadText ? (
            /*
             * Chapter bodies are authored by an administrator in the editor,
             * so this is trusted HTML rather than anything a visitor can
             * submit. .res-reading-body scopes its typography so it cannot
             * escape the reader.
             */
            <div
              className="res-reading-body"
              style={{ fontSize: `${size}px` }}
              lang={resource?.language || "en"}
              dangerouslySetInnerHTML={{ __html: body }}
            />
          ) : canReadFile ? (
            <DocumentViewer file={file} resource={resource} compact />
          ) : (
            <div className="res-reading-body">
              <p>{t.resources.bookContentsEmpty}</p>
            </div>
          )}

          {chapters.length > 1 && (
            <div className="res-reading-foot">
              <button
                type="button"
                className="res-btn"
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
                disabled={index === 0}
              >
                <ChevronLeft size={15} aria-hidden="true" />
                {t.resources.previous}
              </button>

              <span
                className="res-pagination-info"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={chapters.length}
                aria-valuenow={index + 1}
                aria-label={t.resources.readingProgress}
              >
                {index + 1} / {chapters.length}
              </span>

              <button
                type="button"
                className="res-btn"
                onClick={() =>
                  setIndex((value) =>
                    Math.min(chapters.length - 1, value + 1),
                  )
                }
                disabled={index === chapters.length - 1}
              >
                {t.resources.next}
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
