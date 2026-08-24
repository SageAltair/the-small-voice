import {
  useEffect,
  useState,
} from "react";

import {
  getStories,
  searchStories,
} from "../services/api";

import SearchBar from "../components/SearchBar";
import StoryList from "../components/StoryList";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useLanguage } from "../i18n/LanguageContext";


export default function Stories() {
  const { t } = useLanguage();
  const [stories, setStories] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);


  async function loadStories() {
    setLoading(true);
    setError(null);

    try {
      const data =
        await getStories();

      setStories(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  async function handleSearch(query) {
    if (!query) {
      await loadStories();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data =
        await searchStories(query);

      setStories(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    let cancelled = false;

    getStories()
      .then((data) => {
        if (!cancelled) {
          setStories(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);


  return (
    <main className="container page">
      <header className="page-header">
        <p className="eyebrow">
          {t.discoverLabel}
        </p>

        <h1>
          {t.stories}
        </h1>

        <p>
          {t.discover}
        </p>
      </header>


      <SearchBar
        onSearch={handleSearch}
      />


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
