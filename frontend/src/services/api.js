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

export const getResourceUrl = getImageUrl;

export function getResourceDownloadUrl(resource) {
  if (!resource?.url) return null;
  const path = new URL(getResourceUrl(resource.url), API_BASE_URL).pathname;
  return resource.id && path.startsWith("/uploads/")
    ? `${API_BASE_URL}/resources/${resource.id}/download`
    : getResourceUrl(resource.url);
}

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code = null;

    try {
      const errorData = await response.json();

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
    throw error;
  }

  return response.json();
}

function authHeaders() {
  const token = localStorage.getItem("access_token");

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

// Appends the selected content language to a public content endpoint so the
// API only returns stories/resources written in that language.
function withLang(endpoint, lang) {
  if (!lang) return endpoint;

  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}lang=${encodeURIComponent(lang)}`;
}

export function getGoogleAuthUrl() {
  return `${API_BASE_URL}/users/google/authorize`;
}

export function setAccessToken(token) {
  localStorage.setItem("access_token", token);
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

  updateStep: (stepId, data) =>
    request(`/experiences/steps/${stepId}`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(data),
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
