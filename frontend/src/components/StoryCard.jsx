import { Link } from "react-router-dom";
import { getImageUrl } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";

const fallbackImages = [
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=85",
];


export default function StoryCard({
  story,
}) {
  const { t } = useLanguage();
  const image = getImageUrl(story.image_url) ||
    fallbackImages[
      (Number(story.id) || 0) % fallbackImages.length
    ];
  const preview = story.content
    ? new DOMParser().parseFromString(story.content, "text/html").body.textContent
    : "";
  const postedAt = story.published_at || story.created_at;

  return (
    <article className="card">
      <img src={image}
        alt={story.image_url ? story.title : t.natureAlt}
        className="card-image"
      />

      <div className="card-content">
        <p className="category">
          {story.category || t.story}
        </p>

        {(postedAt || story.author) && <div className="story-card-meta">{postedAt && <time dateTime={postedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(postedAt))}</time>}{story.author && <span>By {story.author}</span>}</div>}

        <h2>
          {story.title}
        </h2>

        <p>
          {preview
            ? preview.length > 180
              ? `${preview.slice(0, 180)}...`
              : preview
            : t.storyPreview}
        </p>

        <Link
          to={`/stories/${story.id}`}
          className="text-link"
        >
          {t.readStory} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
