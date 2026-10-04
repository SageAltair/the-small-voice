// Resolve the base URL every API call is built from.
//
// 1. An explicit VITE_API_URL always wins. This is how a static hosting
//    deployment points at the API (see render.yaml / the Render dashboard).
// 2. A production build falls back to the deployed API.
// 3. During development the app may be opened from localhost, 127.0.0.1, or
//    this machine's LAN address (for example from a phone on the same
//    Wi-Fi). Reuse the hostname the page was loaded from so all of those
//    reach the API without editing a .env file every time the address
//    changes.
function resolveApiUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  if (!import.meta.env.DEV) {
    return "https://the-small-voice.onrender.com";
  }

  const { protocol, hostname } = window.location;

  return `${protocol}//${hostname}:8000`;
}

const API_BASE_URL = resolveApiUrl().replace(/\/$/, "");

export function getImageUrl(url) {
  return url?.startsWith("/") ? `${API_BASE_URL}${url}` : url;
}

/**
 * The inverse of getImageUrl, for Learn content that is being written back.
 *
 * Learn stores media as either a same-origin "/uploads/..." path or a full
 * https address; anything else is refused by the API. uploadAdminImage hands
 * back an absolute URL, so an upload is trimmed to its path before it is saved -
 * otherwise the server would drop it and the cover or image would vanish.
 */
export function toMediaPath(url) {
  if (!url) return "";
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url, API_BASE_URL);
    if (`${parsed.protocol}//${parsed.host}` === API_BASE_URL) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return url;
  }
  return url;
}

export const getResourceUrl = getImageUrl;

export function getResourceDownloadUrl(resource) {
  if (!resource?.url) return null;
  const path = new URL(getResourceUrl(resource.url), API_BASE_URL).pathname;
  return resource.id && path.startsWith("/uploads/")
    ? `${API_BASE_URL}/resources/${resource.id}/download`
    : getResourceUrl(resource.url);
}

export async function request(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code = null;
    let detail = null;

    try {
      const errorData = await response.json();

      detail = errorData.detail ?? null;

      if (errorData.detail) {
        if (typeof errorData.detail === "string") {
          message = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          message = errorData.detail
            .map((error) => error.msg)
            .join(", ");
        } else if (errorData.detail.message) {
          message = errorData.detail.message;
          code = errorData.detail.code || null;
        }
      }
    } catch {
      // Ignore invalid JSON responses
    }

    const error = new Error(message);
    error.code = code;
    error.status = response.status;
    // Structured detail (e.g. Learn's field-by-field publish validation) is
    // kept so callers can list every problem instead of only the first.
    error.detail = detail;
    throw error;
  }

  return response.json();
}

export function authHeaders() {
  const token = localStorage.getItem("access_token");

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

// Appends the selected content language to a public content endpoint so the
// API only returns stories/resources written in that language.
export function withLang(endpoint, lang) {
  if (!lang) return endpoint;

  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}lang=${encodeURIComponent(lang)}`;
}

/**
 * Adopt any anonymous Learn progress recorded on this device into the account
 * that just signed in, so creating or using an account never loses a place
 * part-way through a path.
 *
 * Best-effort by design: a failed merge must never block signing in, and it
 * only runs once per client id.
 */
export function mergeLearnProgress() {
  const clientId = storedLearnClientId();

  if (!clientId || !localStorage.getItem("access_token") || learnProgressMerged(clientId)) {
    return Promise.resolve(null);
  }

  return request(`/learn/progress/merge?client_token=${encodeURIComponent(clientId)}`, {
    method: "POST",
    headers: authHeaders(),
  })
    .then((result) => {
      markLearnProgressMerged(clientId);
      return result;
    })
    .catch(() => null);
}

export function getGoogleAuthUrl() {
  return `${API_BASE_URL}/users/google/authorize`;
}

export function setAccessToken(token) {
  localStorage.setItem("access_token", token);
  // Same adoption step as the e-mail sign-in, for the Google callback.
  mergeLearnProgress();
}

export function resendVerification(email) {
  return request("/users/resend-verification", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
}


// ================================
// LEARN CLIENT IDENTITY
// ================================
//
// The Learn pages keep a random client id so a visitor can make progress
// without an account. This block is dependency-free and lives beside the auth
// helpers so the sign-in flow can adopt that progress without a cycle.

const LEARN_CLIENT_KEY = "learn_client_id";
const LEARN_MERGED_KEY = "learn_progress_merged";
const LEARN_CLIENT_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function newLearnClientId() {
  const raw =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;

  return raw.slice(0, 32);
}

/** The device's Learn client id, created on first use. */
export function learnClientId() {
  const stored = localStorage.getItem(LEARN_CLIENT_KEY);

  if (stored && LEARN_CLIENT_PATTERN.test(stored)) return stored;

  const created = newLearnClientId();
  localStorage.setItem(LEARN_CLIENT_KEY, created);
  return created;
}

/** The stored id only - used by the sign-in flow, which must not invent one. */
export function storedLearnClientId() {
  const stored = localStorage.getItem(LEARN_CLIENT_KEY);
  return stored && LEARN_CLIENT_PATTERN.test(stored) ? stored : null;
}

export function learnClientHeaders() {
  return { "X-Learn-Client": learnClientId() };
}

export function learnProgressMerged(clientId) {
  return !clientId || localStorage.getItem(LEARN_MERGED_KEY) === clientId;
}

export function markLearnProgressMerged(clientId) {
  if (clientId) localStorage.setItem(LEARN_MERGED_KEY, clientId);
}

// ================================
// AUTH
// ================================

export async function register(username, email, password) {
  return request("/users/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      email,
      password,
    }),
  });
}


export async function login(username, password) {
  const body = new URLSearchParams();

  body.append("username", username);
  body.append("password", password);

  const result = await request("/users/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  localStorage.setItem(
    "access_token",
    result.access_token
  );

  // Move this device's anonymous Learn progress onto the account, without
  // slowing down the sign-in response.
  mergeLearnProgress();

  return getCurrentUser();
}


export async function getCurrentUser() {
  return request("/users/me", {
    headers: authHeaders(),
  });
}

export function getAuthorDashboard() {
  return request("/users/dashboard", { headers: authHeaders() });
}


export function logout() {
  localStorage.removeItem("access_token");
}


export function isLoggedIn() {
  return Boolean(
    localStorage.getItem("access_token")
  );
}


// ================================
// ADMIN
// ================================

export async function getAdminData() {
  return request("/admin/overview", {
    headers: authHeaders(),
  });
}


// ================================
// STORIES
// ================================

export async function getStories(lang) {
  return request(withLang("/stories/", lang));
}

export async function getStory(id, lang) {
  return request(withLang(`/stories/${id}`, lang));
}

export async function getRelatedStories(id, lang) {
  return request(withLang(`/stories/${id}/related`, lang));
}

export async function searchStories(query, lang) {
  return request(
    withLang(`/stories/search?q=${encodeURIComponent(query)}`, lang)
  );
}


// ================================
// CATEGORIES
// ================================

export async function getCategories() {
  return request("/stories/categories");
}


// ================================
// TAGS
// ================================

export async function getTags(lang) {
  return request(withLang("/tags/", lang));
}

export async function getAllTags() {
  return request("/tags/all", { headers: authHeaders() });
}

export async function getStoriesByTag(slug, lang) {
  return request(withLang(`/tags/${slug}/stories`, lang));
}


// ================================
// RESOURCES
// ================================

/* ---------- resources (public library) ---------- */

// Every public read is one endpoint with optional filters, so the browse page,
// a type page and a search result are all the same request with different
// query strings. `lang` selects the language the server resolves each
// resource's text into.

function resourceQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : "";
}

/** The curated homepage: one section per type that has published content. */
export function getResourceHome(lang) {
  return request(`/resources/home${resourceQuery({ lang })}`);
}

/** Published counts per type, for the browse filters. */
export function getResourceTypes(lang) {
  return request(`/resources/types${resourceQuery({ lang })}`);
}

export function getResourceTopics(lang) {
  return request(`/resources/topics${resourceQuery({ lang })}`);
}

export function getResourceTags(lang) {
  return request(`/resources/tags${resourceQuery({ lang })}`);
}

/** A filtered, sorted, paginated listing. */
export function listResources({ lang, type, q, topic, tag, sort, page, pageSize } = {}) {
  return request(
    `/resources/${resourceQuery({
      lang,
      type,
      q,
      topic,
      tag,
      sort,
      page,
      page_size: pageSize,
    })}`,
  );
}

/** One resource, addressed by type and slug as the public URLs do. */
export function getResource(type, slug, lang) {
  return request(
    `/resources/${type}/${encodeURIComponent(slug)}${resourceQuery({ lang })}`,
  );
}

/** The related-content rail on its own, for lazy loading it. */
export function getRelatedResources(id, { lang, limit } = {}) {
  return request(`/resources/${id}/related${resourceQuery({ lang, limit })}`);
}

/** Count one open. Fire-and-forget: never block a view on the response. */
export function recordResourceView(id) {
  return request(`/resources/${id}/view`, { method: "POST" }).catch(() => null);
}

/** Page count for a PDF, so the reader can say "page 3 of 24". */
export function getDocumentPages(id) {
  return request(`/resources/${id}/pages`);
}

/** Search inside a PDF. Text extraction happens on the server. */
export function searchDocument(id, query, lang) {
  return request(`/resources/${id}/search${resourceQuery({ q: query, lang })}`);
}

/* ---------- resources (admin studio) ---------- */

// The Resources studio owns its own endpoints rather than going through the
// generic `/admin/{type}/{id}` routes, because it saves a whole document -
// metadata, both translations, slides, chapters, media and related links - in
// one atomic request, and because it needs publish/schedule/duplicate/bulk
// actions the generic router has no concept of.

export function getResourceOverview() {
  return request("/admin/resources/overview", { headers: authHeaders() });
}

/** The full list, drafts and trash included. */
export function listAdminResources({
  q, type, status, language, featured, trashed, sort, page, pageSize,
} = {}) {
  const query = new URLSearchParams();
  Object.entries({
    q, type, status, language, featured, trashed, sort, page,
    page_size: pageSize,
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString();
  return request(
    `/admin/resources/${suffix ? `?${suffix}` : ""}`,
    { headers: authHeaders() },
  );
}

/** The editable document, including raw translations and validation. */
export function getAdminResource(id, lang) {
  return request(`/admin/resources/${id}${resourceQuery({ lang })}`, {
    headers: authHeaders(),
  });
}

function adminJson(payload) {
  return {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

/** Create a draft of any of the nine types. */
export function createAdminResource(payload) {
  return request("/admin/resources/", adminJson(payload));
}

/** Save the whole document: metadata, translations, slides, chapters, media. */
export function saveAdminResource(id, payload) {
  return request(`/admin/resources/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function publishAdminResource(id) {
  return request(`/admin/resources/${id}/publish`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export function unpublishAdminResource(id) {
  return request(`/admin/resources/${id}/unpublish`, {
    method: "POST",
    headers: authHeaders(),
  });
}

/** Schedule publication. The server keeps it private until the time passes. */
export function scheduleAdminResource(id, when) {
  return request(`/admin/resources/${id}/schedule`, adminJson({ when }));
}

export function duplicateAdminResource(id) {
  return request(`/admin/resources/${id}/duplicate`, {
    method: "POST",
    headers: authHeaders(),
  });
}

/** Soft delete; the row stays in the trash until it is restored or erased. */
export function deleteAdminResource(id) {
  return request(`/admin/resources/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export function restoreAdminResource(id) {
  return request(`/admin/resources/${id}/restore`, {
    method: "POST",
    headers: authHeaders(),
  });
}

/** Irreversible. Only reachable from the trash. */
export function purgeAdminResource(id) {
  return request(`/admin/resources/${id}/permanent`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export function bulkAdminResources(ids, action) {
  return request("/admin/resources/bulk", adminJson({ ids, action }));
}

/**
 * Upload a file chosen on the administrator's device.
 *
 * Uses XMLHttpRequest rather than fetch because the editor needs upload
 * progress, which fetch still cannot report. Everything the editor needs to
 * describe the file (kind, size, duration, page count, dimensions, a PDF
 * cover) comes back in the same response, so the editor never has to ask the
 * browser what it picked.
 */
export function uploadResourceFile(file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/admin/resources/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("access_token") || ""}`);

    if (onProgress && xhr.upload) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("The upload finished but the response was unreadable."));
        }
        return;
      }

      let message = `Upload failed (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText);
        if (body?.detail) message = body.detail;
      } catch {
        // Keep the generic message when the body is not JSON.
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("The upload could not reach the server."));
    xhr.onabort = () => reject(new Error("The upload was cancelled."));

    xhr.send(form);
  });
}

/** Search existing Resources, Stories and Lessons for the related picker. */
export function searchLinkable(kind, query, { lang, excludeId } = {}) {
  return request(
    `/admin/resources/linkable/search${resourceQuery({
      kind,
      q: query,
      lang,
      exclude_id: excludeId,
    })}`,
    { headers: authHeaders() },
  );
}

export async function getResources(lang) {
  return request(withLang("/resources/", lang));
}

export async function searchResources(query, lang) {
  return request(
    withLang(`/resources/search?q=${encodeURIComponent(query)}`, lang)
  );
}

export function createResource(data) { return request("/resources/", { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }); }

// Upload several files at once; each file becomes its own resource record.
export function batchUploadAdminResources(files, meta) {
  const body = new FormData();
  body.append("resource_type", meta.resource_type);
  body.append("language", meta.language || "en");
  body.append("published", String(meta.published ?? true));
  files.forEach((file) => body.append("files", file));
  return request("/admin/resources/upload-batch", { method: "POST", headers: authHeaders(), body });
}

// Approve/publish several stories or resources (or approve tags) in one action.
export function approveAdminBatch(type, ids) {
  return request(`/admin/${type}/approve`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
}

export function createUploadedResource(file, resource) { const body = new FormData(); body.append("title", resource.title); body.append("description", resource.description); body.append("resource_type", resource.resource_type); body.append("language", resource.language || "en"); body.append("resource", file); return request("/resources/upload", { method: "POST", headers: authHeaders(), body }); }
export function updateResource(id, data) { return request(`/resources/manage/${id}`, { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export function deleteResource(id) { return request(`/resources/manage/${id}`, { method: "DELETE", headers: authHeaders() }); }
export function createTag(data) { return request("/tags/", { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export function updateTag(id, data) { return request(`/tags/${id}`, { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export function deleteTag(id) { return request(`/tags/${id}`, { method: "DELETE", headers: authHeaders() }); }

export async function createStory(story) {
  return request("/stories/", { method: "POST", headers: authHeaders(), body: story });
}

export function updateStory(id, data) { return request(`/stories/${id}`, { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export function deleteStory(id) { return request(`/stories/${id}`, { method: "DELETE", headers: authHeaders() }); }

export async function deleteAdminItem(type, id) {
  return request(`/admin/${type}/${id}`, { method: "DELETE", headers: authHeaders() });
}

export async function getTrash() {
  return request("/admin/trash", { headers: authHeaders() });
}

export async function restoreTrashItem(type, id) {
  return request(`/admin/trash/${type}/${id}/restore`, { method: "POST", headers: authHeaders() });
}

export async function permanentDeleteTrashItem(type, id) {
  return request(`/admin/trash/${type}/${id}`, { method: "DELETE", headers: authHeaders() });
}

export async function createAdminItem(type, data) {
  return request(`/admin/${type}`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

export async function updateAdminItem(type, id, data) {
  return request(`/admin/${type}/${id}`, { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

export async function uploadAdminImage(file) {
  const body = new FormData();
  body.append("image", file);
  const result = await request("/admin/upload-image", { method: "POST", headers: authHeaders(), body });
  return getImageUrl(result.image_url);
}

/**
 * Upload an image, video, or audio file for a Learn block.
 *
 * Same shared uploads mount as every other media in the app; Learn stores the
 * returned path (trimmed with toMediaPath) so the API accepts it back.
 */
export async function uploadAdminMedia(file) {
  const body = new FormData();
  body.append("file", file);
  const result = await request("/admin/upload-media", { method: "POST", headers: authHeaders(), body });
  return getImageUrl(result.media_url);
}

export async function uploadStoryImage(file) {
  const body = new FormData();
  body.append("image", file);
  const result = await request("/stories/upload-image", { method: "POST", headers: authHeaders(), body });
  return getImageUrl(result.image_url);
}

export async function addStoryTags(storyId, tagIds) {
  return request(`/stories/${storyId}/tags`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ tag_ids: tagIds }) });
}

export function likeStory(id) { return request(`/stories/${id}/like`, { method: "POST" }); }

export function commentOnStory(id, author, content) {
  return request(`/stories/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ author, content }) });
}

export function subscribeToNewsletter(email) {
  return request("/newsletter/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
}

export async function uploadAdminResource(file) {
  const body = new FormData();
  body.append("resource", file);
  const result = await request("/admin/upload-resource", { method: "POST", headers: authHeaders(), body });
  return result.resource_url;
}

export function createUploadedAdminResource(file, resource, images = []) {
  const body = new FormData();
  body.append("title", resource.title);
  body.append("description", resource.description);
  body.append("resource_type", resource.resource_type);
  body.append("language", resource.language || "en");
  body.append("published", String(resource.published));
  body.append("resource", file);
  images.forEach((image) => body.append("carousel_images", image));
  return request("/admin/resources/upload", { method: "POST", headers: authHeaders(), body });
}

export function uploadResourceCarousel(resourceId, images) {
  if (!images.length) return null;
  const body = new FormData();
  images.forEach((image) => body.append("carousel_images", image));
  return request(`/admin/resources/${resourceId}/carousel`, { method: "POST", headers: authHeaders(), body });
}

export function submitContact(form) {
  return request("/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
}

export function submitFeedback(form) {
  return request("/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
}

// ================================
// EXPERIENCE BUILDER API
// ================================

export const api = {
  listExperiences: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") query.set(key, value);
    });
    const suffix = query.toString();
    return request(`/experiences/${suffix ? `?${suffix}` : ""}`, { headers: authHeaders() });
  },
  getExperience: (id) => request(`/experiences/${id}`, { headers: authHeaders() }),
  createExperience: (data) => request(`/experiences/`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  updateExperience: (id, data) => request(`/experiences/${id}`, { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  deleteExperience: (id) => request(`/experiences/${id}`, { method: "DELETE", headers: authHeaders() }),
  publishExperience: (id) => request(`/experiences/${id}/publish`, { method: "POST", headers: authHeaders() }),
  unpublishExperience: (id) => request(`/experiences/${id}/unpublish`, { method: "POST", headers: authHeaders() }),
  listSteps: (experienceId) => request(`/experiences/${experienceId}/steps`, { headers: authHeaders() }),
  createStep: (experienceId, data) => request(`/experiences/${experienceId}/steps`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  updateStep: (stepId, data) => request(`/experiences/steps/${stepId}`, { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  deleteStep: (stepId) => request(`/experiences/steps/${stepId}`, { method: "DELETE", headers: authHeaders() }),
  batchUpdateElements: (stepId, elements) => request(`/experiences/steps/${stepId}/elements`, { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(elements) }),
  listConnections: (experienceId) => request(`/experiences/${experienceId}/connections`, { headers: authHeaders() }),
  createConnection: (experienceId, data) => request(`/experiences/${experienceId}/connections`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  deleteConnection: (connectionId) => request(`/experiences/connections/${connectionId}`, { method: "DELETE", headers: authHeaders() }),

  /**
   * Persist the whole design in one request. Autosave uses this so a save
   * either lands completely or not at all - there is no half-written state to
   * find after a refresh.
   */
  saveDocument: (id, payload) =>
    request(`/experiences/${id}/document`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  /** Upload an image for a canvas element; the design only stores the URL. */
  uploadAsset: (file) => {
    const body = new FormData();
    body.append("file", file);
    return request("/experiences/assets", { method: "POST", headers: authHeaders(), body });
  },

  /* ---------- public (no auth) ---------- */

  listPublicExperiences: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") query.set(key, value);
    });
    const suffix = query.toString();
    return request(`/experiences/public${suffix ? `?${suffix}` : ""}`);
  },

  getPublicExperience: (slug) => request(`/experiences/public/${encodeURIComponent(slug)}`),
};
