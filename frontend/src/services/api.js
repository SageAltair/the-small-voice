const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

const API_BASE_URL = API_URL.replace(/\/$/, "");

export function getImageUrl(imageUrl) {
  return imageUrl?.startsWith("/")
    ? `${API_BASE_URL}${imageUrl}`
    : imageUrl;
}


export function getResourceUrl(resourceUrl) {
  return getImageUrl(resourceUrl);
}


export function getResourceDownloadUrl(resource) {
  if (!resource?.url) return null;

  const uploadedPath = new URL(
    getResourceUrl(resource.url),
    API_BASE_URL,
  ).pathname;

  return resource.id && uploadedPath.startsWith("/uploads/")
    ? `${API_BASE_URL}/resources/${resource.id}/download`
    : getResourceUrl(resource.url);
}


async function request(endpoint, options = {}) {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    options
  );

  if (!response.ok) {
    let message =
      `Request failed with status ${response.status}`;

    try {
      const errorData = await response.json();

      if (errorData.detail) {
        message = errorData.detail;
      }
    } catch {
      // Ignore invalid JSON error responses.
    }

    throw new Error(message);
  }

  return response.json();
}


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


export async function getTags() {
  return request("/tags/");
}


export async function getStoriesByTag(slug) {
  return request(`/tags/${slug}/stories`);
}


export async function getResources() {
  return request("/resources/");
}


export async function createStory(story) {
  const token = localStorage.getItem("access_token");
  const headers = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  return request("/stories/", {
    method: "POST",
    headers,
    body: story,
  });
}


function adminHeaders() {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}


export async function login(username, password) {
  const body = new URLSearchParams({ username, password });
  const result = await request("/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  localStorage.setItem("access_token", result.access_token);
  return request("/users/me", { headers: adminHeaders() });
}


export async function getAdminData() {
  return request("/admin/overview", { headers: adminHeaders() });
}


export async function deleteAdminItem(type, id) {
  return request(`/admin/${type}/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}


export async function createAdminItem(type, data) {
  return request(`/admin/${type}`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}


export async function updateAdminItem(type, id, data) {
  return request(`/admin/${type}/${id}`, {
    method: "PUT",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}


export async function uploadAdminImage(file) {
  const form = new FormData();
  form.append("image", file);
  const result = await request("/admin/upload-image", {
    method: "POST",
    headers: adminHeaders(),
    body: form,
  });
  return getImageUrl(result.image_url);
}


export async function addStoryTags(storyId, tagIds) {
  return request(`/stories/${storyId}/tags`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ tag_ids: tagIds }),
  });
}


export async function likeStory(id) {
  return request(`/stories/${id}/like`, { method: "POST" });
}


export async function commentOnStory(id, author, content) {
  return request(`/stories/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author, content }),
  });
}


export async function subscribeToNewsletter(email) {
  return request("/newsletter/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function uploadAdminResource(file) {
  const form = new FormData();
  form.append("resource", file);
  const result = await request("/admin/upload-resource", {
    method: "POST",
    headers: adminHeaders(),
    body: form,
  });
  // Keep uploaded file URLs relative to the API. This works in development and
  // after deployment, where the API may be hosted on a different domain.
  return result.resource_url;
}


export async function createUploadedAdminResource(file, resource, carouselImages = []) {
  const form = new FormData();
  form.append("title", resource.title);
  form.append("description", resource.description);
  form.append("resource_type", resource.resource_type);
  form.append("published", String(resource.published));
  form.append("resource", file);
  carouselImages.forEach((image) => form.append("carousel_images", image));

  return request("/admin/resources/upload", {
    method: "POST",
    headers: adminHeaders(),
    body: form,
  });
}

export async function uploadResourceCarousel(resourceId, images) {
  if (!images.length) return null;

  const form = new FormData();
  images.forEach((image) => form.append("carousel_images", image));
  return request(`/admin/resources/${resourceId}/carousel`, {
    method: "POST",
    headers: adminHeaders(),
    body: form,
  });
}
