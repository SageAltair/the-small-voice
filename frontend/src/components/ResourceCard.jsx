import { useLanguage } from "../i18n/LanguageContext";
import { getResourceDownloadUrl, getResourceUrl } from "../services/api";
import ResourceCarousel from "./ResourceCarousel";

export default function ResourceCard({
  resource,
}) {
  const { t } = useLanguage();
  const resourceUrl = getResourceUrl(resource.url);
  const downloadUrl = getResourceDownloadUrl(resource);

  return (
    <article className="card">
      <ResourceCarousel images={resource.carousel_urls} title={resource.title} />
      <div className="card-content">
        <p className="category">
          {resource.resource_type || resource.type || t.resource}
        </p>

        <h2>
          {resource.title}
        </h2>

        {resource.description && (
          <p>
            {resource.description}
          </p>
        )}

        {resourceUrl && <div className="resource-actions"><a href={resourceUrl} target="_blank" rel="noreferrer" className="button">{t.openResource}</a>{resource.downloadable && <a href={downloadUrl} className="button secondary">{t.download}</a>}</div>}
      </div>
    </article>
  );
}
