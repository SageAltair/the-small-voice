import { CalendarDays, CheckCircle2, Download, ExternalLink, FileText, Tag, X } from "lucide-react";

import { getImageUrl, getResourceDownloadUrl, getResourceUrl } from "../services/api";
import ResourceCarousel from "./ResourceCarousel";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(date);
}

/**
 * Read-only preview of a submitted story or resource, rendered in the same
 * readable format visitors will see on the public website once the item is
 * approved. Used in the admin Approvals queue and the author workspace.
 */
export default function SubmissionReview({ item, onClose, onApprove }) {
  if (!item) return null;

  const kind = item._type || (item.content !== undefined ? "stories" : "resources");
  const isStory = kind === "stories";
  const pending = item.published === false;
  const cover = isStory ? getImageUrl(item.image_url) : getImageUrl(item.cover_url);

  return (
    <div className="cms-modal-backdrop" onMouseDown={onClose}>
      <section className="cms-modal review-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Review submission</p>
            <h2>{isStory ? "Story preview" : "Resource preview"}</h2>
          </div>
          <span className={`review-status ${pending ? "review-status--pending" : "review-status--published"}`}>{pending ? "Pending review" : "Published"}</span>
          <button className="icon-button" onClick={onClose} aria-label="Close review"><X size={19} /></button>
        </header>

        <div className="review-body">
          {isStory ? (
            <article className="story review-story">
              <p className="category">{item.category || "Story"}</p>
              <h1>{item.title}</h1>
              <div className="story-meta">
                <span><CalendarDays size={15} aria-hidden="true" /><time dateTime={item.published_at || item.created_at}>{formatDate(item.published_at || item.created_at)}</time></span>
                <span>By {item.author}</span>
              </div>
              {item.tags?.length > 0 && (
                <div className="story-tags">
                  <Tag size={15} aria-hidden="true" />
                  {item.tags.map((tag) => <span key={tag.id} className="review-tag">{tag.name}</span>)}
                </div>
              )}
              {cover && <img src={cover} alt={item.title} className="story-image" />}
              <div className="story-content" dangerouslySetInnerHTML={{ __html: item.content || "<p>(No content written yet.)</p>" }} />
            </article>
          ) : (
            <article className="review-resource">
              <div className="review-resource-visual">
                {item.carousel_urls?.length ? (
                  <ResourceCarousel images={item.carousel_urls} title={item.title} />
                ) : cover ? (
                  <img src={cover} alt={item.title} />
                ) : (
                  <div className="resource-cover resource-cover-fallback" aria-hidden="true">
                    <FileText size={26} />
                    <span>{(item.resource_type || "file").toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="review-resource-body">
                <p className="category">{item.resource_type || "Resource"}</p>
                <h1>{item.title}</h1>
                <div className="story-meta">
                  <span><CalendarDays size={15} aria-hidden="true" /><time dateTime={item.created_at}>{formatDate(item.created_at)}</time></span>
                  {item.downloadable && <span>Downloadable file</span>}
                </div>
                <p className="review-resource-description">{item.description}</p>
                <div className="review-resource-links">
                  {getResourceUrl(item.url) && (
                    <a className="button secondary" href={getResourceUrl(item.url)} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} aria-hidden="true" /> Open resource
                    </a>
                  )}
                  {item.downloadable && getResourceDownloadUrl(item) && (
                    <a className="button secondary" href={getResourceDownloadUrl(item)}>
                      <Download size={15} aria-hidden="true" /> Download
                    </a>
                  )}
                </div>
              </div>
            </article>
          )}
        </div>

        {onApprove && pending && (
          <footer className="review-footer">
            <p>This is exactly how the submission will appear to visitors once approved.</p>
            <button className="button" onClick={onApprove}>
              <CheckCircle2 size={16} aria-hidden="true" /> Approve and publish
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
