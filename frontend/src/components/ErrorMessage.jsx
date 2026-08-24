import { useLanguage } from "../i18n/LanguageContext";

export default function ErrorMessage({
  message,
}) {
  const { t } = useLanguage();
  return (
    <div className="status error">
      <h2>
        {t.loadError}
      </h2>

      <p>
        {message ||
          t.unableToLoad}
      </p>
    </div>
  );
}
