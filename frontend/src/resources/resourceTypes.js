/**
 * The nine resource types, and everything the rest of Resources needs to know
 * about them.
 *
 * This is the single place a type is described. The API has its own list (it
 * has to - it validates writes), and the two are kept in step by
 * `isResourceType`, which simply asks whether a type is one we recognise. A
 * card, a viewer, the browse filters and the admin editor all read from here,
 * so adding a tenth type is a change in one file rather than nine.
 */

import {
  BookOpen,
  FileText,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Music,
  Play,
  Quote as QuoteIcon,
  Video,
} from "lucide-react";

/** In the order the public homepage presents them. */
export const RESOURCE_TYPES = [
  "reel",
  "video",
  "audio",
  "book",
  "carousel",
  "quote",
  "image",
  "infographic",
  "document",
];

const REGISTRY = {
  reel: {
    icon: Play,
    // A reel is tall; a video is wide. The card reads the ratio from here
    // rather than hard-coding it per component.
    aspect: "9 / 16",
    // Reels play inline on the card because stopping to press play on a
    // three-second clip is a worse experience than letting it loop quietly.
    inlinePlay: true,
    // Reels are vertical by nature, so the library tile goes narrow and tall
    // rather than a row of equal cards. The homepage teaser passes `compact`
    // and sizes itself to a story card instead.
    rail: "portrait",
  },
  video: {
    icon: Video,
    aspect: "16 / 9",
    inlinePlay: false,
    rail: "landscape",
  },
  audio: {
    icon: Music,
    aspect: "1 / 1",
    inlinePlay: false,
    rail: "square",
    // Audio cards get a real waveform rather than a cover image, because a
    // cover tells you nothing about what you are about to hear.
    waveform: true,
  },
  book: {
    icon: BookOpen,
    aspect: "210 / 297",
    inlinePlay: false,
    rail: "book",
  },
  carousel: {
    icon: Images,
    aspect: "4 / 5",
    inlinePlay: false,
    rail: "portrait",
    slides: true,
  },
  quote: {
    icon: QuoteIcon,
    aspect: "4 / 3",
    inlinePlay: false,
    rail: "quote",
  },
  image: {
    icon: ImageIcon,
    aspect: "4 / 3",
    inlinePlay: false,
    rail: "landscape",
  },
  infographic: {
    icon: LayoutGrid,
    aspect: "4 / 5",
    inlinePlay: false,
    rail: "portrait",
  },
  document: {
    icon: FileText,
    aspect: "210 / 297",
    inlinePlay: false,
    rail: "book",
  },
};

export function isResourceType(value) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, value);
}

/** How a resource should be described, with a safe fallback. */
export function resourceMeta(type) {
  return (
    REGISTRY[type] || {
      icon: FileText,
      aspect: "4 / 3",
      inlinePlay: false,
      rail: "landscape",
    }
  );
}

export default REGISTRY;