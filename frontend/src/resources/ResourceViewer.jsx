/**
 * Chooses the right viewing experience for a resource.
 *
 * This is the only place that maps a type to a viewer, so the detail page
 * does not need a nine-way conditional and adding a tenth type is a change in
 * one file. Every viewer is given a `key` of the resource id, so moving to a
 * different resource remounts it cleanly rather than relying on effects to
 * reset state by hand.
 */

import AudioViewer from "./AudioViewer";
import BookReader from "./BookReader";
import CarouselViewer from "./CarouselViewer";
import DocumentViewer from "./DocumentViewer";
import ImageViewer from "./ImageViewer";
import QuoteViewer from "./QuoteViewer";
import ReelViewer from "./ReelViewer";
import VideoViewer from "./VideoViewer";
import { isPreviewable, viewableFile } from "./resourceUtils";

/** How each type is experienced. Anything unlisted falls back to a document. */
const VIEWERS = {
  reel: ReelViewer,
  video: VideoViewer,
  audio: AudioViewer,
  book: BookReader,
  carousel: CarouselViewer,
  quote: QuoteViewer,
  image: ImageViewer,
  infographic: ImageViewer,
  document: DocumentViewer,
};

export default function ResourceViewer({ resource, siblings = [] }) {
  if (!resource) return null;

  const type = resource.type || "document";

  // A Reel wants its feed; everything else gets its own viewer.
  if (type === "reel") {
    return <ReelViewer key={resource.id} resource={resource} siblings={siblings} />;
  }

  const Viewer = VIEWERS[type] || DocumentViewer;

  // An infographic uses the image viewer but starts fitted rather than
  // cropped, because an unreadable diagram is worse than no diagram.
  if (type === "infographic") {
    return <ImageViewer key={resource.id} resource={resource} infographic />;
  }

  // A book or document with nothing to open still gets a reader rather than a
  // blank frame: the viewer explains what is missing.
  if (type === "book" || type === "document") {
    const file = viewableFile(resource);
    const hasChapters = resource.chapters?.length > 0;

    if (type === "book" && (hasChapters || file)) {
      return <BookReader key={resource.id} resource={resource} />;
    }
    if (file || resource.external_url) {
      return (
        <DocumentViewer key={resource.id} resource={resource} file={file} />
      );
    }
  }

  if (!VIEWERS[type] && viewableFile(resource) && isPreviewable(viewableFile(resource))) {
    // An unrecognised type with a playable file is better served by the
    // media viewer than by a document frame that would show nothing.
    return <VideoViewer key={resource.id} resource={resource} />;
  }

  return <Viewer key={resource.id} resource={resource} />;
}