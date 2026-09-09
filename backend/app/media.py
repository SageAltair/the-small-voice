from pathlib import Path
from uuid import uuid4

# Image uploads can serve as their own cover. PDF documents get their first
# page rendered to a PNG thumbnail so the resource card can show a preview.
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def build_resource_cover(upload_dir: Path, file_path: Path, extension: str) -> str | None:
    """Return a public cover image URL for an uploaded resource file, or None.

    PDFs are rendered to a PNG of their first page with PyMuPDF; image uploads
    become their own cover. Any other file type (or a rendering failure) yields
    no cover so the UI can fall back to a generic file-type tile.
    """
    try:
        if extension == ".pdf":
            import fitz  # PyMuPDF

            with fitz.open(file_path) as document:
                if document.page_count == 0:
                    return None
                pixmap = document[0].get_pixmap(dpi=110)
                cover_name = f"{uuid4().hex}.png"
                pixmap.save(upload_dir / cover_name)
                return f"/uploads/{cover_name}"

        if extension in IMAGE_EXTENSIONS:
            return f"/uploads/{file_path.name}"
    except Exception:
        return None

    return None
