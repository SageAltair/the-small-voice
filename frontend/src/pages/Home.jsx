import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";

import NewsletterSignup from "../components/NewsletterSignup";
import StoryCard from "../components/StoryCard";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { getImageUrl, getStories, getTags } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import useReveal from "../hooks/useReveal";

export default function Home() {
  const { t } = useLanguage();
  const [stories, setStories] = useState([]);
  const [tags, setTags] = useState([]);
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

      gsap.to(".home-motion-orbit", { rotation: 360, duration: 30, ease: "none", repeat: -1 });
      gsap.to(".home-motion-rays", { rotation: -360, duration: 42, ease: "none", repeat: -1 });
      gsap.to(".home-motion-blob-a", { x: 22, y: -18, rotation: 9, duration: 5.5, ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.to(".home-motion-blob-b", { x: -18, y: 20, rotation: -12, duration: 6.5, ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.to(".home-motion-blob-c", { y: -15, duration: 4.4, ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.timeline({ delay: 2.6, repeat: -1, repeatDelay: 1.4 })
        .to(".hero-title-word > span", { color: "var(--accent)", y: -5, duration: 0.42, stagger: 0.12, ease: "power2.out" })
        .to(".hero-title-word > span", { color: "var(--text)", y: 0, duration: 0.48, stagger: { each: 0.1, from: "end" }, ease: "power2.inOut" }, "+=0.65");
    }, page);

    return () => context.revert();
  }, []);

  useEffect(() => {
    getStories().then(setStories).catch((err) => setError(err.message)).finally(() => setLoading(false));
    getTags().then(setTags).catch(() => setTags([]));
  }, []);

  const featured = stories.find((story) => story.featured) || stories[0];
  const recent = stories.slice(0, 4);
  const excerpt = featured?.content ? new DOMParser().parseFromString(featured.content, "text/html").body.textContent : "";
  const heroWords = t.heroTitle.trim().split(/\s+/);

  return <main ref={page}>
    <section className="hero"><div className="home-motion" aria-hidden="true"><span className="home-motion-rays" /><span className="home-motion-orbit" /><span className="home-motion-blob home-motion-blob-a" /><span className="home-motion-blob home-motion-blob-b" /><span className="home-motion-blob home-motion-blob-c" /></div><div className="container hero-content"><div className="hero-copy"><p className="eyebrow hero-eyebrow">{t.siteName}</p><h1 className="hero-title" aria-label={t.heroTitle}>{heroWords.map((word, index) => <span className="hero-title-word" key={`${word}-${index}`}><span>{word}</span></span>)}</h1><p className="hero-text">{t.discover}</p><div className="hero-actions"><Link to="/stories" className="button">{t.exploreStories}</Link><Link to="/resources" className="button secondary">{t.startLearning}</Link></div></div></div></section>
    {loading && <div className="container"><Loading message={t.loadingStories} /></div>}
    {error && <div className="container"><ErrorMessage message={error} /></div>}
    {!loading && !error && featured && <section className="container featured-story"><div className="featured-copy"><p className="eyebrow">{t.featured}</p><h2>{featured.title}</h2><p>{excerpt}</p><Link to={`/stories/${featured.id}`} className="text-link">{t.readStory} <span aria-hidden="true">→</span></Link></div>{featured.image_url && <img src={getImageUrl(featured.image_url)} alt={featured.title} />}</section>}
    {!loading && !error && <section className="container recent-stories"><div className="section-heading"><div><p className="eyebrow">{t.justArrived}</p><h2>{t.recent}</h2></div><Link to="/stories" className="text-link">{t.viewAll} <span aria-hidden="true">→</span></Link></div><div className="grid">{recent.map((story) => <StoryCard key={story.id} story={story} />)}</div></section>}
    <section className="container home-explore"><div className="section-heading"><div><p className="eyebrow">{t.explore}</p><h2>{t.topics}</h2></div><Link to="/stories" className="text-link">{t.exploreStories} <span aria-hidden="true">→</span></Link></div><div className="topic-doors">{tags.map((tag) => <Link key={tag.id} to={`/tags/${tag.slug}`}>{tag.name}<span aria-hidden="true">→</span></Link>)}</div></section>
    <section className="container journey"><h2>{t.journey}</h2><div className="journey-grid"><div><strong>01</strong><h3>{t.journeyStory}</h3><p>{t.journeyStoryDescription}</p></div><div><strong>02</strong><h3>{t.journeyLearn}</h3><p>{t.journeyLearnDescription}</p></div><div><strong>03</strong><h3>{t.journeyGrow}</h3><p>{t.journeyGrowDescription}</p></div><div><strong>04</strong><h3>{t.journeyJourney}</h3><p>{t.journeyJourneyDescription}</p></div><div><strong>05</strong><h3>{t.journeyMission}</h3><p>{t.journeyMissionDescription}</p></div></div><div className="journey-actions"><Link to="/resources" className="button">{t.exploreResources}</Link><Link to="/stories" className="button secondary">{t.discoverMoreStories}</Link></div></section>
    <section className="container home-newsletter"><div><p className="eyebrow">{t.inboxNote}</p><h2>{t.newsletter}</h2><p>{t.newsletterDescription}</p></div><NewsletterSignup /></section>
  </main>;
}
