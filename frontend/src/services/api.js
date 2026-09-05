const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "https://the-small-voice.onrender.com");

const API_BASE_URL = API_URL.replace(/\/$/, "");

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

export async function getStories() {
  return request("/stories/");
}

export async function getStory(id) {
  return request(`/stories/${id}`);
}

export async function getRelatedStories(id) {
  return request(`/stories/${id}/related`);
}

export async function searchStories(query) {
  return request(
    `/stories/search?q=${encodeURIComponent(query)}`
  );
}


// ================================
// TAGS
// ================================

export async function getTags() {
  return request("/tags/");
}

export async function getStoriesByTag(slug) {
  return request(`/tags/${slug}/stories`);
}


// ================================
// RESOURCES
// ================================

export async function getResources() {
  return request("/resources/");
}

export function createResource(data) { return request("/resources/", { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export function createUploadedResource(file, resource) { const body = new FormData(); body.append("title", resource.title); body.append("description", resource.description); body.append("resource_type", resource.resource_type); body.append("resource", file); return request("/resources/upload", { method: "POST", headers: authHeaders(), body }); }
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
