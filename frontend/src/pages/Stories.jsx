import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useSearchParams } from "react-router-dom";

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
  const { t, language } = useLanguage();
  const [stories, setStories] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get("category") || "";
  const pageFromUrl = Number(searchParams.get("page") || "1");

  const pageSize = 6;

  async function loadStories() {
    setLoading(true);
    setError(null);

    try {
      const data =
        await getStories(language);

      setStories(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  async function handleSearch(query) {
    setSearchParams((params) => {
      params.delete("page");
      return params;
    });

    if (!query) {
      await loadStories();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data =
        await searchStories(query, language);

      setStories(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    let cancelled = false;

    getStories(language)
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
  }, [language]);


  const filteredStories = useMemo(
    () =>
      categoryFromUrl
        ? stories.filter(
            (story) =>
              (story.category || "").toLowerCase() ===
              categoryFromUrl.toLowerCase()
          )
        : stories,
    [stories, categoryFromUrl]
  );

  const totalPages = Math.max(1, Math.ceil(filteredStories.length / pageSize));
  const safePage = Math.min(pageFromUrl, totalPages);
  const paginatedStories = useMemo(
    () =>
      filteredStories.slice(
        (safePage - 1) * pageSize,
        safePage * pageSize
      ),
    [filteredStories, safePage]
  );

  function goToPage(nextPage) {
    setSearchParams((params) => {
      if (nextPage <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(nextPage));
      }
      return params;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }


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

      <div className="stories-filters">
        <label htmlFor="category-select" className="category-label">
          {t.filterByCategory}
        </label>
        <select
          id="category-select"
          value={categoryFromUrl}
          onChange={(event) => {
            const value = event.target.value;
            setSearchParams((params) => {
              if (value) {
                params.set("category", value);
              } else {
                params.delete("category");
              }
              params.delete("page");
              return params;
            });
          }}
          className="category-select"
          aria-label={t.filterByCategory}
        >
          <option value="">{t.allCategories}</option>
          <option value="News">{t.news}</option>
          <option value="Stories">{t.storiesCategory}</option>
          <option value="Testimonies">{t.testimonies}</option>
          <option value="Articles">{t.articles}</option>
          <option value="Opinions">{t.opinions}</option>
        </select>
      </div>

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
        <>
          <StoryList
            stories={paginatedStories}
          />

          {totalPages > 1 && (
            <div className="pagination">
              <button
                type="button"
                className="button secondary"
                disabled={safePage <= 1}
                onClick={() => goToPage(safePage - 1)}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={safePage >= totalPages}
                onClick={() => goToPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
