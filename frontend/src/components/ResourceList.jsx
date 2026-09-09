import ResourceCard from "./ResourceCard";
import { useLanguage } from "../i18n/LanguageContext";


export default function ResourceList({
  resources,
}) {
  const { t } = useLanguage();
  if (
    !resources ||
    resources.length === 0
  ) {
    return (
      <p>
        {t.noResources}
      </p>
    );
  }

  return <div className="resource-grid">{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</div>;
}
