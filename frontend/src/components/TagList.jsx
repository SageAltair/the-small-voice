import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";


export default function TagList({
  tags,
}) {
  const { t } = useLanguage();
  if (!tags || tags.length === 0) {
    return (
      <p>
        {t.noTopics}
      </p>
    );
  }


  return (
    <div className="tag-list">
      {tags.map((tag) => (
        <Link
          key={tag.id}
          to={`/tags/${tag.slug}`}
          className="tag"
        >
          {tag.name}
        </Link>
      ))}
    </div>
  );
}
