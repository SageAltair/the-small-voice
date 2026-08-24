import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";


export default function NotFound() {
  const { t } = useLanguage();
  return (
    <main className="container page">
      <div className="status">
        <h1>
          404
        </h1>

        <p>
          {t.pageNotFound}
        </p>

        <Link
          to="/"
          className="button"
        >
          {t.goHome}
        </Link>
      </div>
    </main>
  );
}
