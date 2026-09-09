import { Music } from "lucide-react";
import { getResourceUrl } from "../services/api";

export default function AudioCard({ resource }) {
  const audioUrl = getResourceUrl(resource.url);
  const cover = resource.cover_url ? getResourceUrl(resource.cover_url) : null;

  return (
    <div className="audio-wrapper">
      <audio
        className="audio-player"
        controls
        preload="metadata"
        aria-label={resource.title}
      >
        <source src={audioUrl} />
        {resource.title}
      </audio>
      {!cover && (
        <div className="audio-overlay" aria-hidden="true">
          <Music size={36} color="#fff" fill="#fff" />
        </div>
      )}
    </div>
  );
}
