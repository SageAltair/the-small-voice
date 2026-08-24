import json
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

from app.auth.security import create_access_token


title = f"Upload verification {uuid.uuid4().hex}"
token = create_access_token({"sub": "admin"})
boundary = "----UploadBoundary"
fields = [
    ("title", title),
    ("description", "Temporary upload verification"),
    ("resource_type", "Document"),
    ("published", "true"),
]
body = b"".join(
    f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    for key, value in fields
)
body += (
    f'--{boundary}\r\nContent-Disposition: form-data; '
    'name="resource"; filename="verification.txt"\r\n'
    "Content-Type: text/plain\r\n\r\n"
).encode()
body += b"verified upload"
body += f"\r\n--{boundary}--\r\n".encode()
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": f"multipart/form-data; boundary={boundary}",
}

created = json.load(
    urlopen(
        Request(
            "http://127.0.0.1:8011/admin/resources/upload",
            data=body,
            headers=headers,
        )
    )
)
resources = json.load(urlopen("http://127.0.0.1:8011/resources/"))
assert any(item["id"] == created["id"] for item in resources)
assert urlopen("http://127.0.0.1:8011" + created["url"]).read() == b"verified upload"
urlopen(
    Request(
        f"http://127.0.0.1:8011/admin/resources/{created['id']}",
        headers={"Authorization": f"Bearer {token}"},
        method="DELETE",
    )
)
(Path("uploads") / created["url"].rsplit("/", 1)[-1]).unlink(missing_ok=True)
print("Upload, public listing, and file retrieval verified.")
