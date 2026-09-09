import { Play } from "lucide-react";
import { getResourceUrl } from "../services/api";

export default function VideoCard({ resource }) {
  const videoUrl = getResourceUrl(resource.url);
  const cover = resource.cover_url ? getResourceUrl(resource.cover_url) : null;

  return (
    <div className="video-wrapper">
      <video
        className="video-player"
        controls
        preload="metadata"
        poster={cover || undefined}
        aria-label={resource.title}
      >
        <source src={videoUrl} />
        {resource.title}
      </video>
      {!cover && (
        <div className="video-overlay" aria-hidden="true">
          <Play size={48} color="#fff" fill="#fff" />
        </div>
      )}
    </div>
  );
}
