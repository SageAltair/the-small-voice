import {
  useEffect,
  useState,
} from "react";

import { getResources } from "../services/api";

import ResourceList from "../components/ResourceList";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { useLanguage } from "../i18n/LanguageContext";


export default function Resources() {
  const { t } = useLanguage();
  const [resources, setResources] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);


  useEffect(() => {
    async function loadResources() {
      try {
        const data =
          await getResources();

        setResources(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadResources();
  }, []);


  return (
    <main className="container page">
      <header className="page-header">
        <p className="eyebrow">
          {t.learnLabel}
        </p>

        <h1>
          {t.resources}
        </h1>

        <p>
          {t.learn}
        </p>
      </header>


      {loading && (
        <Loading
          message={t.loadingResources}
        />
      )}


      {!loading && error && (
        <ErrorMessage
          message={error}
        />
      )}


      {!loading && !error && (
        <ResourceList
          resources={resources}
        />
      )}
    </main>
  );
}
