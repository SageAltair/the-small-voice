import StoryCard from "./StoryCard";
import { useLanguage } from "../i18n/LanguageContext";


export default function StoryList({
  stories,
}) {
  const { t } = useLanguage();
  if (!stories || stories.length === 0) {
    return (
      <p>
        {t.noStories}
      </p>
    );
  }


  return (
    <div className="grid">
      {stories.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
        />
      ))}
    </div>
  );
}
