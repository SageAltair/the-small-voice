"""
End-to-end lifecycle check for the freeform visual builder.

Exercises the real HTTP API against a running backend using the same payload
shape the editor sends, and verifies that everything an admin arranges is still
there after a full round trip:

    create -> upload image -> save document (page size / layout mode / geometry /
    rotation / z-order / image / embed) -> reload -> publish -> public fetch ->
    unpublish -> page removal -> delete

Run with:  .venv\\Scripts\\python.exe e2e_builder_check.py
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("TSV_API", "http://127.0.0.1:8000")
USERNAME = os.environ.get("TSV_ADMIN_USER", "admin")
EMAIL = os.environ.get("TSV_ADMIN_EMAIL", "admin@example.com")
PASSWORD = os.environ.get("TSV_ADMIN_PASSWORD", "")

TOKEN = None
FAILURES = []

# A real 1x1 PNG, so the upload path is genuinely exercised.
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000a49444154789c6360000002000100ffff0300000600"
    "0557bfabd40000000049454e44ae426082"
)

EMBED_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def call(method, path, payload=None, raw=None):
    """Perform an API call, returning parsed JSON or an __error__ envelope."""
    headers = {}
    data = None
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"

    if raw is not None:
        boundary = "----tsvboundary1234567890"
        body = bytearray()
        for name, value, filename, content_type in raw:
            body += f"--{boundary}\r\n".encode()
            disposition = f'Content-Disposition: form-data; name="{name}"'
            if filename:
                disposition += f'; filename="{filename}"'
            body += disposition.encode() + b"\r\n"
            if content_type:
                body += f"Content-Type: {content_type}\r\n".encode()
            body += b"\r\n" + value + b"\r\n"
        body += f"--{boundary}--\r\n".encode()
        data = bytes(body)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode()
            return json.loads(body) if body.strip() else {}
    except urllib.error.HTTPError as error:
        return {"__error__": error.code, "detail": error.read().decode()[:300]}
    except Exception as error:
        return {"__error__": 0, "detail": str(error)}


def login(username, password):
    """The /users/login endpoint takes OAuth2 form fields, not JSON."""
    fields = {"username": username, "password": password}
    data = urllib.parse.urlencode(fields).encode()
    request = urllib.request.Request(
        f"{BASE}/users/login",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        return {"__error__": error.code, "detail": error.read().decode()[:200]}
    except Exception as error:
        return {"__error__": 0, "detail": str(error)}


def check(label, actual, expected):
    if actual == expected:
        print(f"  PASS  {label}")
        return True
    print(f"  FAIL  {label}: expected {expected!r}, got {actual!r}")
    FAILURES.append(f"{label}: expected {expected!r}, got {actual!r}")
    return False


def build_document(title, image_url, asset_id):
    """The exact document shape the editor posts (see designModel.toPayload)."""
    return {
        "title": title,
        "description": "Freeform canvas persistence check",
        "assets": [{"assetId": asset_id, "url": image_url, "name": "dot.png"}] if image_url else [],
        "pages": [
            {
                "id": None,
                "title": "Hero",
                "pageSettings": {
                    "preset": "story", "width": 1080, "height": 1920,
                    "orientation": "portrait", "layoutMode": "fixed",
                    "background": "#ffffff",
                },
                "elements": [
                    {"element_uuid": "el-heading", "type": "heading", "x": 120, "y": 200,
                     "width": 640, "height": 96, "rotation": 0, "zIndex": 3,
                     "content": {"text": "Welcome to Your Journey"},
                     "style": {"fontSize": 56, "color": "#24251f"}, "actions": []},
                    {"element_uuid": "el-image", "type": "image", "x": 140, "y": 400,
                     "width": 500, "height": 300, "rotation": 12, "zIndex": 2,
                     "content": {"url": image_url, "alt": "A single pixel dot"},
                     "style": {"objectFit": "cover", "borderRadius": 12}, "actions": []},
                    {"element_uuid": "el-embed", "type": "embed", "x": 200, "y": 800,
                     "width": 640, "height": 360, "rotation": 0, "zIndex": 1,
                     "content": {"url": EMBED_URL, "provider": "youtube"},
                     "style": {"borderRadius": 12}, "actions": []},
                ],
            },
            {
                "id": None,
                "title": "Long page",
                "pageSettings": {
                    "preset": "custom", "width": 1080, "height": 1080,
                    "orientation": "portrait", "layoutMode": "endless",
                    "background": "#f7f6f2",
                },
                "elements": [
                    {"element_uuid": "el-deep", "type": "text", "x": 80, "y": 4000,
                     "width": 900, "height": 300, "rotation": 0, "zIndex": 0,
                     "content": {"text": "Far down an endless page"},
                     "style": {"fontSize": 28}, "actions": []},
                ],
            },
        ],
        "connections": [],
    }



def sign_in():
    """Try the identifiers the admin account may be stored under."""
    result = {}
    for identifier in (USERNAME, EMAIL):
        result = login(identifier, PASSWORD)
        if "access_token" in result:
            return result["access_token"], result
    return None, result


def main():
    global TOKEN

    print("== backend ==")
    health = call("GET", "/health")
    if health.get("status") != "healthy":
        print(f"  FAIL  backend not healthy at {BASE}: {health.get('detail', '')}")
        print("  start it with: cd backend && .venv\\Scripts\\python.exe -m uvicorn app.main:app --port 8000")
        return 1
    print(f"  PASS  health at {BASE}")

    print("== authentication ==")
    TOKEN, raw_login = sign_in()
    if not TOKEN:
        print(f"  FAIL  could not sign in: {raw_login.get('detail', 'no token returned')}")
        print("        set TSV_ADMIN_EMAIL and TSV_ADMIN_PASSWORD to match backend/.env")
        return 1
    print("  PASS  signed in as administrator")

    print("== create ==")
    title = f"E2E Canvas {os.urandom(4).hex()}"
    created = call("POST", "/experiences/", {
        "title": title, "experience_type": "journey", "language": "en",
    })
    if "__error__" in created:
        print(f"  FAIL  create: {created}")
        return 1
    experience_id = created["id"]
    slug = created["slug"]
    print(f"  PASS  created experience id={experience_id} slug={slug}")

    print("== image upload ==")
    upload = call("POST", "/experiences/assets", raw=[("file", PNG_BYTES, "dot.png", "image/png")])
    image_url = upload.get("url")
    asset_id = upload.get("assetId", "local")
    if not image_url:
        print(f"  detail: {upload}")
    check("upload returns a /uploads path", bool(image_url and image_url.startswith("/uploads/")), True)

    document = build_document(title, image_url, asset_id)

    print("== save the whole document ==")
    saved = call("PUT", f"/experiences/{experience_id}/document", document)
    if "__error__" in saved:
        print(f"  FAIL  save document: {saved}")
        call("DELETE", f"/experiences/{experience_id}")
        return 1
    print("  PASS  document accepted")

    print("== reload: every arranged value must still be there ==")
    loaded = call("GET", f"/experiences/{experience_id}")
    pages = loaded.get("steps", [])
    check("page count", len(pages), 2)

    first = next((p for p in pages if p.get("title") == "Hero"), None)
    check("hero page found", first is not None, True)
    if first:
        settings = first["page_settings"]
        check("page width", settings.get("width"), 1080)
        check("page height", settings.get("height"), 1920)
        check("layout mode", settings.get("layoutMode"), "fixed")
        check("page background", settings.get("background"), "#ffffff")
        check("element count", len(first.get("elements", [])), 3)

        by_uuid = {e["element_uuid"]: e for e in first.get("elements", [])}

        heading = by_uuid.get("el-heading", {})
        check("edited text survives", heading.get("content", {}).get("text"), "Welcome to Your Journey")
        check("x position survives", heading.get("position", {}).get("x"), 120)
        check("y position survives", heading.get("position", {}).get("y"), 200)
        check("z-order survives", heading.get("z_index"), 3)
        check("font size survives", heading.get("style", {}).get("fontSize"), 56)

        image = by_uuid.get("el-image", {})
        check("resized width survives", image.get("size", {}).get("width"), 500)
        check("resized height survives", image.get("size", {}).get("height"), 300)
        check("rotation survives", image.get("rotation"), 12)
        check("image url survives", image.get("content", {}).get("url"), image_url)
        check("alt text survives", image.get("content", {}).get("alt"), "A single pixel dot")
        check("object-fit survives", image.get("style", {}).get("objectFit"), "cover")

        embed = by_uuid.get("el-embed", {})
        check("embed url survives", embed.get("content", {}).get("url"), EMBED_URL)
        check("embed provider survives", embed.get("content", {}).get("provider"), "youtube")

    second = next((p for p in pages if p.get("title") == "Long page"), None)
    check("endless page found", second is not None, True)
    if second:
        check("endless layout mode", second["page_settings"].get("layoutMode"), "endless")
        check("endless page background", second["page_settings"].get("background"), "#f7f6f2")
        deep = (second.get("elements") or [{}])[0]
        check("content 4000px down survives", deep.get("position", {}).get("y"), 4000)


    print("== hostile input is clamped, not stored verbatim ==")
    hostile = call("PUT", f"/experiences/{experience_id}/document", {
        "pages": [{
            "title": "Hostile",
            "pageSettings": {
                "width": 99999999, "height": -5,
                "layoutMode": "banana", "background": "x" * 500,
            },
            "elements": [
                {"element_uuid": "bad-1", "type": "text", "x": 10, "y": 10,
                 "width": 0, "height": -3, "content": {}},
            ],
        }],
    })
    hostile_page = (hostile.get("steps") or [{}])[0]
    settings = hostile_page.get("page_settings", {})
    check("oversized width clamped", settings.get("width", 999999) <= 12000, True)
    check("negative height raised to a usable size", settings.get("height", 0) >= 200, True)
    check("invalid layout mode rejected", settings.get("layoutMode"), "fixed")
    check("background value length capped", len(settings.get("background", "x" * 500)) <= 64, True)
    bad = (hostile_page.get("elements") or [{}])[0]
    check("zero width floored to a minimum", bad.get("size", {}).get("width", 0) >= 8, True)
    check("negative height floored to a minimum", bad.get("size", {}).get("height", 0) >= 8, True)

    print("== publish makes it publicly visible ==")
    call("PUT", f"/experiences/{experience_id}/document", document)
    published = call("POST", f"/experiences/{experience_id}/publish")
    check("status becomes published", published.get("status"), "published")

    public_list = call("GET", "/experiences/public?experience_type=journey")
    listed = isinstance(public_list, list) and any(
        item.get("id") == experience_id for item in public_list
    )
    check("appears in the public list", listed, True)

    public_one = call("GET", f"/experiences/public/{slug}")
    check("public detail status", public_one.get("status"), "published")
    check("public detail page count", len(public_one.get("steps", [])), 2)

    public_hero = next((p for p in public_one.get("steps", []) if p.get("title") == "Hero"), None)
    check("public page geometry exposed", (public_hero or {}).get("page_settings", {}).get("width"), 1080)

    public_image = next(
        (e for p in public_one.get("steps", []) for e in p.get("elements", [])
         if e["element_uuid"] == "el-image"),
        None,
    )
    check("public image url exposed", (public_image or {}).get("content", {}).get("url"), image_url)

    public_deep = next(
        (p for p in public_one.get("steps", []) if p.get("title") == "Long page"), None,
    )
    check(
        "public endless content 4000px down",
        ((public_deep or {}).get("elements") or [{}])[0].get("position", {}).get("y"),
        4000,
    )

    print("== unpublish hides it again ==")
    unpublished = call("POST", f"/experiences/{experience_id}/unpublish")
    check("status becomes unpublished", unpublished.get("status"), "unpublished")

    public_list = call("GET", "/experiences/public?experience_type=journey")
    still_there = isinstance(public_list, list) and any(
        item.get("id") == experience_id for item in public_list
    )
    check("no longer listed publicly", still_there, False)

    gone = call("GET", f"/experiences/public/{slug}")
    check("public detail is 404 after unpublish", gone.get("__error__"), 404)

    print("== removing a page keeps the surviving one intact ==")
    call("PUT", f"/experiences/{experience_id}/document", document)
    check("two pages saved again", len(call("GET", f"/experiences/{experience_id}").get("steps", [])), 2)

    trimmed = call("PUT", f"/experiences/{experience_id}/document", {
        "title": title,
        "pages": [document["pages"][0]],
        "connections": [],
    })
    check("removed page is gone", len(trimmed.get("steps", [])), 1)
    check("surviving page keeps its size", trimmed["steps"][0]["page_settings"].get("width"), 1080)
    check("surviving page keeps its elements", len(trimmed["steps"][0].get("elements", [])), 3)

    print("== cleanup ==")
    deleted = call("DELETE", f"/experiences/{experience_id}")
    check("delete accepted", "__error__" not in deleted, True)

    print()
    if FAILURES:
        print(f"FAILED ({len(FAILURES)} check(s)):")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1

    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
