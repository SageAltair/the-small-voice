import { authHeaders, learnClientHeaders, request, withLang } from "./api";

// ================================
// LEARN (public learner API)
// ================================
//
// Every Learn route accepts the anonymous X-Learn-Client id alongside the
// bearer token, so progress works signed-out and survives signing in.

function headers(extra = {}) {
  return { ...authHeaders(), ...learnClientHeaders(), ...extra };
}

function json(payload) {
  return { "Content-Type": "application/json", ...payload };
}

/** Learn landing page: categories, path summaries, per-path progress. */
export function getLearnHome(language) {
  return request(withLang("/learn/home", language), { headers: headers() });
}

/** Published paths, optionally filtered by category slug or search term. */
export function listLearnPaths({ language, category, q } = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (q) params.set("q", q);
  const suffix = params.toString();
  return request(withLang(`/learn/paths${suffix ? `?${suffix}` : ""}`, language), {
    headers: headers(),
  });
}

/** One path with its ordered lesson list and progress. */
export function getLearnPath(slug, language) {
  return request(withLang(`/learn/paths/${encodeURIComponent(slug)}`, language), {
    headers: headers(),
  });
}

/** A lesson addressed by id - the payload the lesson runner renders. */
export function getLearnLessonById(lessonId, language) {
  return request(withLang(`/learn/lessons/${lessonId}`, language), { headers: headers() });
}

/** The same lesson payload addressed by path slug + lesson slug. */
export function getLearnLessonBySlug(pathSlug, lessonSlug, language) {
  return request(
    withLang(
      `/learn/paths/${encodeURIComponent(pathSlug)}/lessons/${encodeURIComponent(lessonSlug)}`,
      language
    ),
    { headers: headers() }
  );
}

/**
 * Save reading position, answers, and completion for one lesson.
 * Only the keys present in `payload` are changed server-side.
 */
export function saveLearnProgress(lessonId, payload, language) {
  return request(withLang(`/learn/lessons/${lessonId}/progress`, language), {
    method: "POST",
    headers: headers(json()),
    body: JSON.stringify(payload),
  });
}

/** Everything this learner has done, for "continue where you left off". */
export function getMyLearnProgress(language) {
  return request(withLang("/learn/progress/my", language), { headers: headers() });
}

/** Search published Learn content (paths, lessons, categories). */
export function searchLearn(query, language) {
  return request(withLang(`/learn/search?q=${encodeURIComponent(query || "")}`, language), {
    headers: headers(),
  });
}

/**
 * Analytics. Best-effort: never rejects, so a tracking call can't interrupt
 * someone reading a lesson.
 */
export function recordLearnEvent({ eventType, pathId, lessonId, language, metadata } = {}) {
  if (!eventType) return Promise.resolve(null);

  return request("/learn/events", {
    method: "POST",
    headers: headers(json()),
    body: JSON.stringify({
      event_type: eventType,
      path_id: pathId ?? null,
      lesson_id: lessonId ?? null,
      language,
      metadata: metadata || {},
    }),
  }).catch(() => null);
}

// ================================
// LEARN ADMIN (content studio API)
// ================================
//
// The admin routes live under /admin/learn and speak in whole documents: a
// path comes back with both language versions, its lesson order, and the
// validation report the server used to decide if it may be published. Saving
// sends the same document shape back, so the builder never has to guess which
// field belongs where.

function adminHeaders(extra = {}) {
  return { ...authHeaders(), "Content-Type": "application/json", ...extra };
}

/** Stats, translation coverage, analytics, and the "needs attention" list. */
export function getLearnAdminOverview() {
  return request("/admin/learn/overview", { headers: adminHeaders() });
}

/** The block catalogue: types, fields, config keys, sections, levels. */
export function getLearnBlockTypes() {
  return request("/admin/learn/block-types", { headers: adminHeaders() });
}

/** Categories with both language names and how many paths use each. */
export function listLearnCategories() {
  return request("/admin/learn/categories", { headers: adminHeaders() });
}

export function createLearnCategory(payload) {
  return request("/admin/learn/categories", { method: "POST", headers: adminHeaders(), body: JSON.stringify(payload) });
}

export function updateLearnCategory(categoryId, payload) {
  return request(`/admin/learn/categories/${categoryId}`, { method: "PUT", headers: adminHeaders(), body: JSON.stringify(payload) });
}

export function deleteLearnCategory(categoryId) {
  return request(`/admin/learn/categories/${categoryId}`, { method: "DELETE", headers: adminHeaders() });
}

/** Every path, drafts included. `status` and `q` narrow the list server-side. */
export function listAdminLearnPaths({ status, q } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const suffix = params.toString();
  return request(`/admin/learn/paths${suffix ? `?${suffix}` : ""}`, { headers: adminHeaders() });
}

/** Create a draft path. Nothing is public until it is published on purpose. */
export function createLearnPath(payload) {
  return request("/admin/learn/paths", { method: "POST", headers: adminHeaders(), body: JSON.stringify(payload) });
}

/** The full editable path document. */
export function getAdminLearnPath(pathId) {
  return request(`/admin/learn/paths/${pathId}`, { headers: adminHeaders() });
}

/** Save fields, both translations, and lesson order in one transaction. */
export function saveAdminLearnPath(pathId, payload) {
  return request(`/admin/learn/paths/${pathId}`, { method: "PUT", headers: adminHeaders(), body: JSON.stringify(payload) });
}

export function publishAdminLearnPath(pathId) {
  return request(`/admin/learn/paths/${pathId}/publish`, { method: "POST", headers: adminHeaders() });
}

export function archiveAdminLearnPath(pathId) {
  return request(`/admin/learn/paths/${pathId}/archive`, { method: "POST", headers: adminHeaders() });
}

export function duplicateAdminLearnPath(pathId) {
  return request(`/admin/learn/paths/${pathId}/duplicate`, { method: "POST", headers: adminHeaders() });
}

export function deleteAdminLearnPath(pathId) {
  return request(`/admin/learn/paths/${pathId}`, { method: "DELETE", headers: adminHeaders() });
}

/** The ordered lesson rows of one path. */
export function listAdminLessons(pathId) {
  return request(`/admin/learn/paths/${pathId}/lessons`, { headers: adminHeaders() });
}

/** Append a draft lesson to the end of a path. */
export function createAdminLesson(pathId, payload) {
  return request(`/admin/learn/paths/${pathId}/lessons`, { method: "POST", headers: adminHeaders(), body: JSON.stringify(payload) });
}

/** The full lesson document: metadata, both translations, blocks, validation. */
export function getAdminLesson(lessonId) {
  return request(`/admin/learn/lessons/${lessonId}`, { headers: adminHeaders() });
}

/** Save metadata, both translations, and the whole block list at once. */
export function saveAdminLesson(lessonId, payload) {
  return request(`/admin/learn/lessons/${lessonId}`, { method: "PUT", headers: adminHeaders(), body: JSON.stringify(payload) });
}

export function publishAdminLesson(lessonId) {
  return request(`/admin/learn/lessons/${lessonId}/publish`, { method: "POST", headers: adminHeaders() });
}

export function archiveAdminLesson(lessonId) {
  return request(`/admin/learn/lessons/${lessonId}/archive`, { method: "POST", headers: adminHeaders() });
}

export function duplicateAdminLesson(lessonId) {
  return request(`/admin/learn/lessons/${lessonId}/duplicate`, { method: "POST", headers: adminHeaders() });
}

export function deleteAdminLesson(lessonId) {
  return request(`/admin/learn/lessons/${lessonId}`, { method: "DELETE", headers: adminHeaders() });
}

/** Replace only the block tree, leaving lesson metadata untouched. */
export function saveAdminLessonBlocks(lessonId, blocks) {
  return request(`/admin/learn/lessons/${lessonId}/blocks`, { method: "PUT", headers: adminHeaders(), body: JSON.stringify({ blocks }) });
}

