import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { gsap } from "gsap";

import NewsletterSignup from "../components/NewsletterSignup";
import StoryCard from "../components/StoryCard";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import ResourceCard from "../resources/ResourceCard";
import { getImageUrl, getStories, getTags, listResources } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import useReveal from "../hooks/useReveal";
import "../resources/resources.css";

/* Two reels is the whole point of the box: enough to show the format is worth
   opening, not enough to turn the homepage into a feed. Topics get six, which
   fills the right-hand column without a scrollbar. */
const REEL_COUNT = 2;
const TOPIC_COUNT = 6;

/**
 * A teaser, not the story.
 *
 * The featured story's HTML held every word, so the home page printed the whole
 * piece and buried the "read story" link underneath it. Clipped to a few
 * sentences at a word boundary, with the ellipsis the reader expects.
 */
function storyTeaser(html, limit = 240) {
  if (!html) return "";
  const text = new DOMParser()
    .parseFromString(html, "text/html")
    .body.textContent.replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf(" ", limit);
  return `${text.slice(0, cut > 0 ? cut : limit).trim()}…`;
}

export default function Home() {
  const { t, language } = useLanguage();
  const [stories, setStories] = useState([]);
  const [tags, setTags] = useState([]);
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const page = useRef(null);

  useReveal(page);

  useLayoutEffect(() => {
    if (!page.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const context = gsap.context(() => {
      const intro = gsap.timeline({ delay: 0.16 });
      intro
        .fromTo(".home-motion-orbit", { autoAlpha: 0, scale: 0.75, rotation: -18 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: 1.15, ease: "power3.out" })
        .fromTo(".home-motion-rays", { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 0.8, scale: 1, duration: 1.1, ease: "power3.out" }, "<0.1")
        .fromTo(".home-motion-blob", { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.8, stagger: 0.12, ease: "back.out(1.4)" }, "<0.18")
        .fromTo(".hero-eyebrow", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: "power2.out" }, "<0.05")
        .fromTo(".hero-title-word > span", { autoAlpha: 0, yPercent: 115, rotate: 4 }, { autoAlpha: 1, yPercent: 0, rotate: 0, duration: 0.85, stagger: 0.085, ease: "power4.out" }, "<0.08")
        .fromTo(".hero-text", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.65, ease: "power3.out" }, "<0.18")
        .fromTo(".hero-actions", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out" }, "<0.1");

      gsap.set(".home-motion-wave", { scale: 0.2, opacity: 0.5 });
      gsap.to(".home-motion-wave", { scale: 4, opacity: 0, duration: 3.5, ease: "power1.out", stagger: 0.9, repeat: -1 });
      gsap.to(".home-motion-rays", { rotation: -360, duration: 90, ease: "none", repeat: -1 });
      gsap.to(".home-motion-blob-a", { x: 22, y: -18, rotation: 9, duration: 5.5, ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.to(".home-motion-blob-b", { x: -18, y: 20, rotation: -12, duration: 6.5, ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.to(".home-motion-blob-c", { y: -15, duration: 4.4, ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.timeline({ delay: 2.6, repeat: -1, repeatDelay: 1.4 })
        .to(".hero-title-word > span", { color: "var(--accent)", y: -5, duration: 0.42, stagger: 0.12, ease: "power2.out" })
        .to(".hero-title-word > span", { color: "var(--text)", y: 0, duration: 0.48, stagger: { each: 0.1, from: "end" }, ease: "power2.inOut" }, "+=0.65");
    }, page);

    /* The discovery box and the journey steps below it animate as they arrive.
       Both are content that loads after first paint, so without this they would
       simply appear - the rest of the hero earns its motion, and so should
       they. */
    const discoverRows = gsap.utils.toArray<HTMLElement>(".home-topic-row");
    if (discoverRows.length) {
      gsap.fromTo(discoverRows, { autoAlpha: 0, x: 24 }, { autoAlpha: 1, x: 0, duration: 0.7, stagger: 0.07, ease: "power3.out", delay: 1.2 });
    }

    const steps = gsap.utils.toArray<HTMLElement>(".journey-card");
    if (steps.length) {
      gsap.fromTo(steps, { autoAlpha: 0, y: 40, scale: 0.95 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.85, stagger: 0.12, ease: "power3.out", delay: 1.5 });
    }

    return () => context.revert();
  }, []);

  useEffect(() => {
    getStories(language).then(setStories).catch((err) => setError(err.message)).finally(() => setLoading(false));
    getTags(language).then(setTags).catch(() => setTags([]));
    /* Reels are a treat, not the page's reason to exist: a failure here drops
       the box back to its topics-only shape instead of raising an error over
       content that loaded perfectly well. */
    listResources({ lang: language, type: "reel", pageSize: REEL_COUNT })
      .then((data) => setReels(data?.items?.slice(0, REEL_COUNT) || []))
      .catch(() => setReels([]));
  }, [language]);

  const featured = stories.find((story) => story.featured) || stories[0];
  const recent = stories.slice(0, 4);
  const excerpt = storyTeaser(featured?.content);
  const heroWords = t.heroTitle.trim().split(/\s+/);
  const topicList = tags.slice(0, TOPIC_COUNT);

  return <main ref={page}>
    <section className="hero"><div className="home-motion" aria-hidden="true"><span className="home-motion-rays" /><span className="home-motion-wave" /><span className="home-motion-wave" /><span className="home-motion-wave" /><span className="home-motion-wave" /><span className="home-motion-blob home-motion-blob-a" /><span className="home-motion-blob home-motion-blob-b" /><span className="home-motion-blob home-motion-blob-c" /></div><div className="container hero-content"><div className="hero-copy"><p className="eyebrow hero-eyebrow">{t.siteName}</p><h1 className="hero-title" aria-label={t.heroTitle}>{heroWords.map((word, index) => <span className="hero-title-word" key={`${word}-${index}`}><span>{word}</span></span>)}</h1><p className="hero-text">{t.discover}</p><div className="hero-actions"><Link to="/stories" className="button">{t.exploreStories}</Link><Link to="/resources" className="button secondary">{t.startLearning}</Link></div></div></div></section>
    {loading && <div className="container"><Loading message={t.loadingStories} /></div>}
    {error && <div className="container"><ErrorMessage message={error} /></div>}
    {!loading && !error && featured && <section className="container featured-story"><div className="featured-copy"><p className="eyebrow">{t.featured}</p><h2>{featured.title}</h2><p>{excerpt}</p><Link to={`/stories/${featured.id}`} className="text-link">{t.readStory} <span aria-hidden="true">→</span></Link></div>{featured.image_url && <img src={getImageUrl(featured.image_url)} alt={featured.title} />}</section>}
    {!loading && !error && <section className="container recent-stories"><div className="section-heading"><div><p className="eyebrow">{t.justArrived}</p><h2>{t.recent}</h2></div><Link to="/stories" className="text-link">{t.viewAll} <span aria-hidden="true">→</span></Link></div><div className="grid">{recent.map((story) => <StoryCard key={story.id} story={story} />)}</div></section>}
    {/* Reels on the left, topics on the right, in one box. The boxed arrow in
        the corner opens the full list rather than repeating it here. */}
    <section className="container home-discover">
      <div className="home-discover-main">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t.explore}</p>
            <h2>{t.reels}</h2>
          </div>
          <Link
            to="/resources/reel"
            className="home-discover-arrow"
            aria-label={t.reels}
            title={t.reels}
          >
            <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
        </div>

        {reels.length > 0 ? (
          <div className="home-reel-rail">
            {reels.map((reel) => (
              <ResourceCard key={reel.id} resource={reel} compact />
            ))}
          </div>
        ) : (
          <p className="home-discover-empty">{t.reelsSoon}</p>
        )}
      </div>

      <nav className="home-topic-list" aria-label={t.topics}>
        <div className="home-topic-list-head">
          <p className="eyebrow">{t.topics}</p>
          <Link
            to="/stories"
            className="home-discover-arrow"
            aria-label={t.allTopics}
            title={t.allTopics}
          >
            <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
        </div>

        {topicList.length > 0 ? (
          <ul>
            {topicList.map((tag) => (
              <li key={tag.id}>
                <Link to={`/tags/${tag.slug}`} className="home-topic-row">
                  <span className="home-topic-name">{tag.name}</span>
                  <ArrowUpRight size={15} aria-hidden="true" className="home-topic-arrow" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="home-discover-empty">{t.topicsSoon}</p>
        )}
      </nav>
    </section>
    <section className="container journey"><h2>{t.journey}</h2><div className="journey-track">{["01","02","03","04","05"].map((num, i) => <Link key={num} to={["/stories","/resources","/resources","/stories","/give"][i]} className="journey-card"><span className="journey-card-number">{num}</span><div className="journey-card-body"><h3>{[t.journeyStory, t.journeyLearn, t.journeyGrow, t.journeyJourney, t.journeyMission][i]}</h3><p>{[t.journeyStoryDescription, t.journeyLearnDescription, t.journeyGrowDescription, t.journeyJourneyDescription, t.journeyMissionDescription][i]}</p></div></Link>)}</div><div className="journey-actions"><Link to="/resources" className="button">{t.exploreResources}</Link><Link to="/stories" className="button secondary">{t.discoverMoreStories}</Link></div></section>
    <section className="container home-newsletter"><div><p className="eyebrow">{t.inboxNote}</p><h2>{t.newsletter}</h2><p>{t.newsletterDescription}</p></div><NewsletterSignup /></section>
  </main>;
}
