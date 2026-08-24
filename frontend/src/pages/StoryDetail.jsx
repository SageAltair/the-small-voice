import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Link,
  useParams,
} from "react-router-dom";

import {
  commentOnStory,
  getImageUrl,
  getStory,
  getRelatedStories,
  likeStory,
} from "../services/api";
import { CalendarDays, Heart, Send, Tag } from "lucide-react";

import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import StoryList from "../components/StoryList";
import { useLanguage } from "../i18n/LanguageContext";
import useReveal from "../hooks/useReveal";

function reflectionQuestions(story) {
  const focus = story.tags?.[0]?.name || story.category || "this story";
  return [
    `What part of ${focus.toLowerCase()} stays with you?`,
    "Where does this connect with your own life right now?",
    "What is one small, honest next step you could take?",
  ];
}

const storyFallbackImage = "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=85";


export default function StoryDetail() {
  const { t } = useLanguage();
  const { id } = useParams();

  const [story, setStory] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);
  const [comment, setComment] = useState({ author: "", content: "" });
  const [relatedStories, setRelatedStories] = useState([]);
  const page = useRef(null);

  useReveal(page);


  useEffect(() => {
    async function loadStory() {
      setLoading(true);
      setError(null);

      try {
        const data =
          await getStory(id);

        setStory(data);
        getRelatedStories(id).then(setRelatedStories).catch(() => setRelatedStories([]));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadStory();
  }, [id]);


  if (loading) {
    return (
      <main className="container page">
        <Loading
          message={t.loadingStory}
        />
      </main>
    );
  }


  if (error) {
    return (
      <main className="container page">
        <ErrorMessage
          message={error}
        />
      </main>
    );
  }


  if (!story) {
    return (
      <main className="container page">
        <p>
          {t.storyNotFound}
        </p>
      </main>
    );
  }

  const storyImage = getImageUrl(story.image_url) || storyFallbackImage;

  async function handleLike() {
    try {
      setStory(await likeStory(story.id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleComment(event) {
    event.preventDefault();
    try {
      setStory(await commentOnStory(story.id, comment.author, comment.content));
      setComment({ author: "", content: "" });
    } catch (err) {
      setError(err.message);
    }
  }


  return (
    <main className="container page" ref={page}>
      <article className="story">
        <p className="category" data-reveal>
          {story.category || t.story}
        </p>

        <h1 data-reveal>
          {story.title}
        </h1>

        <div className="story-meta" data-reveal>
          <span><CalendarDays size={15} aria-hidden="true" /><time dateTime={story.published_at || story.created_at}>{new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(new Date(story.published_at || story.created_at))}</time></span>
          <span>By {story.author}</span>
        </div>

        {story.tags?.length > 0 && <div className="story-tags" data-reveal><Tag size={15} aria-hidden="true" />{story.tags.map((tag) => <Link key={tag.id} to={`/tags/${tag.slug}`}>{tag.name}</Link>)}</div>}

        <img
          src={storyImage}
          alt={story.image_url ? story.title : t.natureAlt}
          className="story-image"
          data-reveal
        />

        <div
          className="story-content"
          data-reveal
          dangerouslySetInnerHTML={{ __html: story.content }}
        />

        <aside className="story-reflection" data-reveal>
          <p className="eyebrow">Reflect</p>
          <h2>Questions to carry with you</h2>
          <ol>{reflectionQuestions(story).map((question) => <li key={question}>{question}</li>)}</ol>
        </aside>

        <div className="story-engagement" data-reveal>
          <button className="button" type="button" onClick={handleLike}>
            <Heart size={16} aria-hidden="true" /> {t.like} ({story.likes_count || 0})
          </button>
          <h2>{t.comments} ({story.comments?.length || 0})</h2>
          {story.comments?.map((item) => (
            <blockquote key={item.id}>
              <strong>{item.author}</strong>
              <p>{item.content}</p>
            </blockquote>
          ))}
          <form className="comment-form" onSubmit={handleComment}>
            <input aria-label={t.yourName} placeholder={t.yourName} value={comment.author} onChange={(event) => setComment({ ...comment, author: event.target.value })} required />
            <textarea aria-label={t.writeComment} placeholder={t.writeComment} value={comment.content} onChange={(event) => setComment({ ...comment, content: event.target.value })} required />
            <button className="button secondary" type="submit"><Send size={16} aria-hidden="true" /> {t.addComment}</button>
          </form>
        </div>
      </article>


      <section className="next-step">
        <p className="eyebrow">
          {t.keepGoing}
        </p>

        <h2>
          {t.exploreDeeper}
        </h2>

        <p>
          {t.deeperDescription}
        </p>

        <div className="hero-actions">
          <Link
            to="/resources"
            className="button"
          >
            {t.exploreResources}
          </Link>

          <Link
            to="/stories"
            className="button secondary"
          >
            {t.discoverMoreStories}
          </Link>
        </div>
      </section>

      {relatedStories.length > 0 && (
        <section className="related-stories">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t.explore}</p>
              <h2>{t.discoverMoreStories}</h2>
            </div>
            <Link to="/stories" className="text-link">{t.viewAll} <span aria-hidden="true">→</span></Link>
          </div>
          <StoryList stories={relatedStories} />
        </section>
      )}
    </main>
  );
}
