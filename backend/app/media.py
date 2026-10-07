"""Facts read off an uploaded file so the Resource UI can describe it.

Uploads arrive as opaque bytes; the public listing needs a duration, a page
count, or an image size long before a browser opens the file.  Everything here
is best-effort: an unsupported container yields ``None`` rather than failing
the upload, because a resource whose duration could not be read is still a
perfectly good resource.
"""

from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

# Image uploads can serve as their own cover.
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".opus",
}

VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v", ".ogv", ".mkv"}

DOCUMENT_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".txt", ".rtf", ".epub",
    ".xls", ".xlsx", ".ppt", ".pptx", ".csv",
}

# Content types the browser can play or show inline.  Anything else (a .docx,
# say) is offered as a download with a clear "cannot preview" message rather
# than an <iframe> that would render a blank page.
BROWSER_PREVIEWABLE = {"video", "audio", "image", "pdf"}


@dataclass
class FileFacts:
    """What we managed to learn about an uploaded file."""

    kind: str | None = None
    """One of video/audio/image/pdf/document, or None when unrecognised."""

    mime_type: str | None = None
    file_size: int | None = None
    duration: int | None = None
    """Seconds, rounded - only meaningful for video and audio."""

    page_count: int | None = None
    width: int | None = None
    height: int | None = None
    cover_url: str | None = None
    """A generated or borrowed cover image for cards, or None."""

    def as_dict(self) -> dict:
        return {
            "kind": self.kind,
            "mime_type": self.mime_type,
            "file_size": self.file_size,
            "duration": self.duration,
            "page_count": self.page_count,
            "width": self.width,
            "height": self.height,
            "cover_url": self.cover_url,
        }


MIME_BY_EXTENSION = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm",
    ".mov": "video/quicktime", ".ogv": "video/ogg", ".mkv": "video/x-matroska",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".aac": "audio/aac", ".ogg": "audio/ogg", ".oga": "audio/ogg",
    ".opus": "audio/opus", ".flac": "audio/flac",
    ".txt": "text/plain", ".rtf": "application/rtf", ".csv": "text/csv",
    ".epub": "application/epub+zip",
    ".doc": "application/msword",
    ".docx": (
        "application/vnd.openxmlformats-officedocument"
        ".wordprocessingml.document"
    ),
    ".xls": "application/vnd.ms-excel",
    ".xlsx": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ),
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ),
}


def classify(extension: str) -> str | None:
    """Map a file extension to one of our Resource file kinds."""
    extension = extension.lower()
    if extension in IMAGE_EXTENSIONS:
        return "image"
    if extension in AUDIO_EXTENSIONS:
        return "audio"
    if extension in VIDEO_EXTENSIONS:
        return "video"
    if extension == ".pdf":
        return "pdf"
    if extension in DOCUMENT_EXTENSIONS:
        return "document"
    return None


def is_previewable(kind: str | None) -> bool:
    """Whether a browser can display the file without downloading it."""
    return kind in BROWSER_PREVIEWABLE


def mime_for(extension: str, fallback: str | None = None) -> str | None:
    return MIME_BY_EXTENSION.get(extension.lower()) or fallback


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

def _pdf_facts(
    upload_dir: Path,
    file_path: Path,
    make_cover: bool,
) -> FileFacts:
    facts = FileFacts(kind="pdf", mime_type="application/pdf")

    try:
        import fitz  # PyMuPDF, already a declared dependency
    except ImportError:  # pragma: no cover
        return facts

    try:
        with fitz.open(file_path) as document:
            facts.page_count = document.page_count or None
            if make_cover and document.page_count:
                pixmap = document[0].get_pixmap(dpi=110)
                cover_name = f"{uuid4().hex}.png"
                pixmap.save(upload_dir / cover_name)
                facts.cover_url = f"/uploads/{cover_name}"
    except Exception:
        # A corrupt or password-protected PDF is still downloadable; it just
        # has no page count and no cover.
        pass

    return facts


def pdf_page_count(file_path: Path) -> int | None:
    """Number of pages in a PDF, or None when it cannot be opened."""
    try:
        import fitz  # PyMuPDF
    except ImportError:  # pragma: no cover
        return None

    try:
        with fitz.open(file_path) as document:
            return document.page_count or None
    except Exception:
        return None


def pdf_search(file_path: Path, needle: str, limit: int = 50) -> list[dict]:
    """Find ``needle`` inside a PDF and report which pages matched.

    This is what backs "search within document" in the document and book
    readers.  Matching is case-insensitive and each hit carries a short
    snippet, so the reader can show *why* a page matched rather than only the
    page number.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:  # pragma: no cover
        return []

    term = (needle or "").strip()
    if not term:
        return []

    try:
        with fitz.open(file_path) as document:
            matches: list[dict] = []
            for index in range(document.page_count):
                text = document[index].get_text() or ""
                position = text.lower().find(term.lower())
                if position == -1:
                    continue

                start = max(0, position - 60)
                snippet = " ".join(
                    text[start:position + len(term) + 60].split()
                )
                matches.append({"page": index + 1, "snippet": snippet})
                if len(matches) >= limit:
                    break
            return matches
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------

def _image_size(file_path: Path) -> tuple[int | None, int | None]:
    """Read pixel dimensions straight from the file header.

    Pillow is not a dependency, and for PNG/JPEG/GIF the size sits within the
    first few bytes, so there is no reason to pull one in.
    """
    try:
        with open(file_path, "rb") as handle:
            header = handle.read(32)

            # PNG: 8-byte signature, then an IHDR chunk with width/height.
            if header[:8] == b"\x89PNG\r\n\x1a\n" and header[12:16] == b"IHDR":
                return (
                    int.from_bytes(header[16:20], "big"),
                    int.from_bytes(header[20:24], "big"),
                )

            # GIF: "GIF87a"/"GIF89a", then width/height as little-endian u16.
            if header[:6] in {b"GIF87a", b"GIF89a"}:
                return (
                    int.from_bytes(header[6:8], "little"),
                    int.from_bytes(header[8:10], "little"),
                )

            # JPEG: walk the segment markers to the first SOFn frame header.
            if header[:2] == b"\xff\xd8":
                handle.seek(2)
                while True:
                    if handle.read(1) != b"\xff":
                        continue

                    marker = handle.read(1)
                    while marker == b"\xff":
                        marker = handle.read(1)
                    if not marker or marker in {b"\xd8", b"\xd9", b"\x01"}:
                        continue
                    if 0xD0 <= marker[0] <= 0xD7:
                        continue

                    length_bytes = handle.read(2)
                    if len(length_bytes) < 2:
                        break
                    segment_length = int.from_bytes(length_bytes, "big")

                    is_frame_header = (
                        0xC0 <= marker[0] <= 0xCF
                        and marker[0] not in {0xC4, 0xC8, 0xCC}
                    )
                    if is_frame_header:
                        frame = handle.read(5)
                        if len(frame) < 5:
                            break
                        return (
                            int.from_bytes(frame[3:5], "big"),
                            int.from_bytes(frame[1:3], "big"),
                        )

                    handle.seek(segment_length - 2, 1)
    except Exception:
        return None, None

# ---------------------------------------------------------------------------
# Duration
# ---------------------------------------------------------------------------

def _mp4_duration(file_path: Path) -> int | None:
    """Read the duration out of an MP4/M4A/MOV ``moov`` atom.

    Only the ``mvhd`` header is parsed - no media decoding - which is enough to
    print "4:12" on a card and a total length in the player.
    """
    try:
        size = file_path.stat().st_size
        with open(file_path, "rb") as handle:
            offset = 0
            # Guard against a pathological file that never yields a moov box.
            while offset < size:
                handle.seek(offset)
                header = handle.read(8)
                if len(header) < 8:
                    return None

                box_size = int.from_bytes(header[:4], "big")
                box_type = header[4:8]

                if box_size == 1:
                    # A 64-bit box size lives in the next 8 bytes.
                    extended = handle.read(8)
                    if len(extended) < 8:
                        return None
                    box_size = int.from_bytes(extended, "big")
                    body_start = offset + 16
                elif box_size == 0:
                    # Size 0 means "this box runs to the end of the file".
                    box_size = size - offset
                    body_start = offset + 8
                else:
                    body_start = offset + 8

                if box_size < 8:
                    return None

                if box_type == b"moov":
                    handle.seek(body_start)
                    moov = handle.read(box_size - 8)
                    index = moov.find(b"mvhd")
                    if index == -1:
                        return None
                    version = moov[index + 4]
                    if version == 1:
                        timescale = int.from_bytes(
                            moov[index + 20:index + 24], "big"
                        )
                        duration = int.from_bytes(
                            moov[index + 24:index + 32], "big"
                        )
                    else:
                        timescale = int.from_bytes(
                            moov[index + 12:index + 16], "big"
                        )
                        duration = int.from_bytes(
                            moov[index + 16:index + 20], "big"
                        )
                    if not timescale:
                        return None
                    return int(round(duration / timescale))

                offset += box_size
    except Exception:
        return None

    return None

def _mp4_dimensions(file_path: Path) -> tuple[int | None, int | None]:
    """Width and height from the first MP4/MOV ``tkhd`` box.

    The track header stores display dimensions as 16.16 fixed-point. This
    walks every ``tkhd`` box and returns the first non-zero size, so an audio
    track header (0x0) never shadows the video track. Best-effort like
    everything here: ``(None, None)`` when the container is unfamiliar.
    """
    try:
        with open(file_path, "rb") as handle:
            blob = handle.read(1024 * 1024)
            if len(blob) < 32 or blob[4:8] != b"ftyp":
                return (None, None)
            search_from = 0
            while True:
                index = blob.find(b"tkhd", search_from)
                if index < 0 or index + 96 >= len(blob):
                    return (None, None)
                version = blob[index + 4]
                offset = index + (88 if version == 1 else 76)
                width = int.from_bytes(blob[offset:offset + 4], "big") >> 16
                height = int.from_bytes(blob[offset + 4:offset + 8], "big") >> 16
                if width and height:
                    return (width, height)
                search_from = index + 4
    except Exception:
        return (None, None)
    return (None, None)



def _wav_duration(file_path: Path) -> int | None:
    """Duration from a WAV header - the byte rate is all that is needed."""
    try:
        with open(file_path, "rb") as handle:
            header = handle.read(44)
            if header[:4] != b"RIFF" or header[8:12] != b"WAVE":
                return None
            byte_rate = int.from_bytes(header[28:32], "little")
            if not byte_rate:
                return None
            return int(round((file_path.stat().st_size - 44) / byte_rate))
    except Exception:
        return None


def probe_duration(file_path: Path, kind: str | None) -> int | None:
    """Best-effort duration in whole seconds for a video or audio file."""
    if kind not in {"video", "audio"}:
        return None

    extension = file_path.suffix.lower()

    if extension in {".mp4", ".m4a", ".mov", ".m4v"}:
        duration = _mp4_duration(file_path)
        if duration:
            return duration

    if extension == ".wav":
        duration = _wav_duration(file_path)
        if duration:
            return duration

    # PyMuPDF opens a surprising number of containers, including some
    # Matroska/WebM files, so it is worth a try before giving up.
    try:
        import fitz  # PyMuPDF

        with fitz.open(file_path) as document:
            if document.is_pdf:
                return None
            duration = getattr(document, "duration", None)
            if duration:
                return int(round(duration))
    except Exception:
        pass

    return None
# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------

def build_resource_cover(
    upload_dir: Path,
    file_path: Path,
    extension: str,
) -> str | None:
    """Backwards-compatible cover URL for an uploaded resource file, or None.

    Kept because the existing ``/resources/upload`` and
    ``/admin/resources/upload`` endpoints call this directly; it is now a thin
    wrapper over :func:`inspect_upload`.
    """
    return inspect_upload(upload_dir, file_path, make_cover=True).cover_url


def inspect_upload(
    upload_dir: Path,
    file_path: Path,
    make_cover: bool = True,
) -> FileFacts:
    """Read everything we can about an uploaded file.

    ``make_cover`` controls whether a PDF's first page is rendered to a PNG in
    the uploads directory. It is turned off when re-probing a file whose cover
    already exists, so repeated saves do not litter the uploads folder.
    """
    extension = file_path.suffix.lower()
    kind = classify(extension)

    try:
        file_size = file_path.stat().st_size
    except OSError:
        file_size = None

    facts = FileFacts(
        kind=kind,
        mime_type=mime_for(extension),
        file_size=file_size,
    )

    if kind == "pdf":
        pdf_facts = _pdf_facts(upload_dir, file_path, make_cover)
        facts.page_count = pdf_facts.page_count
        facts.cover_url = pdf_facts.cover_url
        return facts

    if kind == "image":
        width, height = _image_size(file_path)
        facts.width = width
        facts.height = height
        if make_cover:
            facts.cover_url = f"/uploads/{file_path.name}"
        return facts

    if kind in {"audio", "video"}:
        facts.duration = probe_duration(file_path, kind)
        return facts

    return facts
