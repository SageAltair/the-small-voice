import { Download, ExternalLink, FileText } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext";
import { getImageUrl, getResourceDownloadUrl, getResourceUrl } from "../services/api";
import ResourceCarousel from "./ResourceCarousel";
import VideoCard from "./VideoCard";
import AudioCard from "./AudioCard";

function getResourceCategory(resource) {
  const type = (resource.resource_type || "").toLowerCase();
  const ext = (resource.url || "").split(".").pop().toLowerCase();
  if (["pdf", "book", "document", "documents"].includes(type) || ext === "pdf") return "book";
  if (["photo", "image", "gallery", "photos"].includes(type) || ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff"].includes(ext)) return "photo";
  if (["video", "videos", "movie", "clip", "film"].includes(type) || ["mp4", "webm", "ogg", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["audio", "music", "podcast", "mp3", "wav", "ogg", "aac", "flac"].includes(type) || ["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma"].includes(ext)) return "audio";
  return "other";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function ResourceCard({
  resource,
}) {
  const { t } = useLanguage();
  const resourceUrl = getResourceUrl(resource.url);
  const downloadUrl = getResourceDownloadUrl(resource);
  const cover = getImageUrl(resource.cover_url);
  const category = getResourceCategory(resource);
  const description = resource.description
    ? resource.description.length > 96
      ? `${resource.description.slice(0, 96)}...`
      : resource.description
    : "";

  const isBook = category === "book";
  const isPhoto = category === "photo";
  const isVideo = category === "video";
  const isAudio = category === "audio";

  return (
    <article className={`card resource-card${isBook ? " resource-card--book" : ""}${isVideo ? " resource-card--video" : ""}${isAudio ? " resource-card--audio" : ""}`}>
      {resource.downloadable && (
        <a href={downloadUrl} className="resource-download-icon" aria-label={t.download} title={t.download}>
          <Download size={10} />
        </a>
      )}

      <div className={`resource-card-visual${isBook ? " resource-card-visual--book" : ""}${isPhoto ? " resource-card-visual--photo" : ""}${isVideo ? " resource-card-visual--video" : ""}${isAudio ? " resource-card-visual--audio" : ""}`}>
        {isVideo ? (
          <VideoCard resource={resource} />
        ) : isAudio ? (
          <AudioCard resource={resource} />
        ) : isPhoto ? (
          resource.carousel_urls?.length ? (
            <ResourceCarousel images={resource.carousel_urls} title={resource.title} />
          ) : cover ? (
            <img src={cover} alt={resource.title} className="resource-cover" loading="lazy" />
          ) : (
            <div className="resource-cover resource-cover-fallback" aria-hidden="true">
              <FileText size={16} />
              <span>Photo</span>
            </div>
          )
        ) : (
          <>
            {cover ? (
              <img src={cover} alt={resource.title} className="resource-cover resource-cover--book" loading="lazy" />
            ) : (
              <div className="resource-cover resource-cover-fallback resource-cover-fallback--book" aria-hidden="true">
                <FileText size={16} />
                <span>PDF</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="resource-card-body">
        <p className="category">{resource.resource_type || resource.type || t.resource}</p>
        <h2>{resource.title}</h2>
        <time className="resource-date" dateTime={resource.created_at}>{formatDate(resource.created_at)}</time>
        {description && <p className="resource-description">{description}</p>}
        {resourceUrl && (
          <a href={resourceUrl} target="_blank" rel="noreferrer" className="resource-open-icon" aria-label={t.openResource} title={t.openResource}>
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </article>
  );
}