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


  const groups = resources.reduce((collection, resource) => {
    const type = resource.resource_type || resource.type || t.resource;
    collection[type] = [...(collection[type] || []), resource];
    return collection;
  }, {});

  return <div className="resource-groups">{Object.entries(groups).map(([type, items]) => <section key={type} className="resource-group"><div className="resource-group-heading"><p className="eyebrow">{t.resources}</p><h2>{type}</h2></div><div className="grid">{items.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</div></section>)}</div>;
}
