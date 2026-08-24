import { useLanguage } from "../i18n/LanguageContext";

export default function Loading({ message }) {
  const { t } = useLanguage();
  return (
    <div className="status">
      <p>{message || t.loading}</p>
    </div>
  );
}
