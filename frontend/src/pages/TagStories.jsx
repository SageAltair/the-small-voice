import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "react-router-dom";

import {
  getStoriesByTag,
} from "../services/api";

import StoryList from "../components/StoryList";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useLanguage } from "../i18n/LanguageContext";


export default function TagStories() {
  const { t, language } = useLanguage();
  const { slug } = useParams();

  const [stories, setStories] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);


  useEffect(() => {
    let cancelled = false;

    async function loadStories() {
      setLoading(true);
      setError(null);

      try {
        const data =
          await getStoriesByTag(slug, language);

        if (!cancelled) {
          setStories(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStories();

    return () => {
      cancelled = true;
    };
  }, [slug, language]);


  return (
    <main className="container page">
      <header className="page-header">
        <p className="eyebrow">
          {t.topic}
        </p>

        <h1>
          {slug}
        </h1>

        <p>
          {t.topicDescription}
        </p>
      </header>


      {loading && (
        <Loading
          message={t.loadingStories}
        />
      )}


      {!loading && error && (
        <ErrorMessage
          message={error}
        />
      )}


      {!loading && !error && (
        <StoryList
          stories={stories}
        />
      )}
    </main>
  );
}
