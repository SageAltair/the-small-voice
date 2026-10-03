import { authHeaders, learnClientHeaders, request, withLang } from "./api";

// ================================
// PRACTICE (public learner API)
// ================================
//
// Every Practice call carries the same anonymous device id that Learn already
// uses, so progress works signed-out and folds into the account on sign-in.
// Nothing here decides anything about correctness: the server grades, and the
// browser only ever sends what the learner chose.

function headers(extra = {}) {
  return { ...authHeaders(), ...learnClientHeaders(), ...extra };
}

function json() {
  return { "Content-Type": "application/json" };
}

/** The dashboard: what to practise next, what needs review, and progress. */
export function getPracticeHome(language) {
  return request(withLang("/practice/home", language), { headers: headers() });
}

/** Published concepts with this learner's standing in each. */
export function listPracticeConcepts(language) {
  return request(withLang("/practice/concepts", language), { headers: headers() });
}

/** Published practice sets (manual, automatic or hybrid). */
export function listPracticeSets(language) {
  return request(withLang("/practice/sets", language), { headers: headers() });
}

/** Start a session. Returns the questions, and prep notes for new concepts. */
export function startPracticeSession(payload, language) {
  return request(withLang("/practice/sessions", language), {
    method: "POST",
    headers: headers(json()),
    body: JSON.stringify(payload || {}),
  });
}

/** Hand a session back after a reload or a dropped connection. */
export function getPracticeSession(sessionId, language) {
  return request(withLang(`/practice/sessions/${sessionId}`, language), {
    headers: headers(),
  });
}

/**
 * Submit one answer. The server grades it and returns the teaching that
 * follows: the verdict, the reason, the takeaway and where to read more.
 */
export function submitPracticeAnswer(sessionId, payload, language) {
  return request(withLang(`/practice/sessions/${sessionId}/answers`, language), {
    method: "POST",
    headers: headers(json()),
    body: JSON.stringify(payload || {}),
  });
}

/** Close the loop: summary, milestones, and the one action to take next. */
export function completePracticeSession(sessionId, language) {
  return request(withLang(`/practice/sessions/${sessionId}/complete`, language), {
    method: "POST",
    headers: headers(json()),
    body: JSON.stringify({}),
  });
}

/** What is due, and why - in plain language. */
export function getPracticeReview(language) {
  return request(withLang("/practice/review", language), { headers: headers() });
}

/** The learner's own challenges and how far each has gone. */
export function listPracticeApplications(language) {
  return request(withLang("/practice/applications", language), { headers: headers() });
}

/** Accept, complete, repeat or skip a challenge. */
export function updatePracticeApplication(applicationId, payload, language) {
  return request(withLang(`/practice/applications/${applicationId}`, language), {
    method: "PUT",
    headers: headers(json()),
    body: JSON.stringify(payload || {}),
  });
}

/** Save an implementation intention: what, when, where. */
export function savePracticeCommitment(payload, language) {
  return request(withLang("/practice/commitments", language), {
    method: "POST",
    headers: headers(json()),
    body: JSON.stringify(payload || {}),
  });
}

export function listPracticeCommitments(language) {
  return request(withLang("/practice/commitments", language), { headers: headers() });
}

export function listPracticeAchievements(language) {
  return request(withLang("/practice/achievements", language), { headers: headers() });
}

/** The learner's own preferences (reminders, session sizes). */
export function getPracticeSettings(language) {
  return request(withLang("/practice/settings", language), { headers: headers() });
}

export function updatePracticeSettings(payload, language) {
  return request(withLang("/practice/settings", language), {
    method: "PUT",
    headers: headers(json()),
    body: JSON.stringify(payload || {}),
  });
}

// ================================
// PRACTICE ADMIN (content studio)
// ================================

function adminHeaders() {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

export function getPracticeAdminOverview() {
  return request("/admin/practice/overview", { headers: adminHeaders() });
}

/** Question types, languages, difficulties, levels and current defaults. */
export function getPracticeCatalog() {
  return request("/admin/practice/catalog", { headers: adminHeaders() });
}

export function listAdminConcepts({ status, q } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const suffix = params.toString();
  return request(`/admin/practice/concepts${suffix ? `?${suffix}` : ""}`, {
    headers: adminHeaders(),
  });
}

export function createAdminConcept(payload) {
  return request("/admin/practice/concepts", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAdminConcept(conceptId) {
  return request(`/admin/practice/concepts/${conceptId}`, { headers: adminHeaders() });
}

export function saveAdminConcept(conceptId, payload) {
  return request(`/admin/practice/concepts/${conceptId}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function publishAdminConcept(conceptId) {
  return request(`/admin/practice/concepts/${conceptId}/publish`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({}),
  });
}

export function unpublishAdminConcept(conceptId) {
  return request(`/admin/practice/concepts/${conceptId}/unpublish`, {
    method: "POST",
    headers: adminHeaders(),
  });
}

export function deleteAdminConcept(conceptId) {
  return request(`/admin/practice/concepts/${conceptId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

export function listAdminQuestions({ conceptId, status, questionType, q } = {}) {
  const params = new URLSearchParams();
  if (conceptId) params.set("concept_id", conceptId);
  if (status) params.set("status", status);
  if (questionType) params.set("question_type", questionType);
  if (q) params.set("q", q);
  const suffix = params.toString();
  return request(`/admin/practice/questions${suffix ? `?${suffix}` : ""}`, {
    headers: adminHeaders(),
  });
}

export function createAdminQuestion(payload) {
  return request("/admin/practice/questions", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAdminQuestion(questionId) {
  return request(`/admin/practice/questions/${questionId}`, { headers: adminHeaders() });
}

export function saveAdminQuestion(questionId, payload) {
  return request(`/admin/practice/questions/${questionId}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function publishAdminQuestion(questionId) {
  return request(`/admin/practice/questions/${questionId}/publish`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({}),
  });
}

export function unpublishAdminQuestion(questionId) {
  return request(`/admin/practice/questions/${questionId}/unpublish`, {
    method: "POST",
    headers: adminHeaders(),
  });
}

export function duplicateAdminQuestion(questionId) {
  return request(`/admin/practice/questions/${questionId}/duplicate`, {
    method: "POST",
    headers: adminHeaders(),
  });
}

export function deleteAdminQuestion(questionId) {
  return request(`/admin/practice/questions/${questionId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

export function listAdminSets() {
  return request("/admin/practice/sets", { headers: adminHeaders() });
}

export function getAdminSet(setId) {
  return request(`/admin/practice/sets/${setId}`, { headers: adminHeaders() });
}

export function createAdminSet(payload) {
  return request("/admin/practice/sets", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function saveAdminSet(setId, payload) {
  return request(`/admin/practice/sets/${setId}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function publishAdminSet(setId) {
  return request(`/admin/practice/sets/${setId}/publish`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({}),
  });
}

export function unpublishAdminSet(setId) {
  return request(`/admin/practice/sets/${setId}/unpublish`, {
    method: "POST",
    headers: adminHeaders(),
  });
}

export function deleteAdminSet(setId) {
  return request(`/admin/practice/sets/${setId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

export function listAdminChallenges() {
  return request("/admin/practice/challenges", { headers: adminHeaders() });
}

export function createAdminChallenge(payload) {
  return request("/admin/practice/challenges", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function saveAdminChallenge(challengeId, payload) {
  return request(`/admin/practice/challenges/${challengeId}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function publishAdminChallenge(challengeId) {
  return request(`/admin/practice/challenges/${challengeId}/publish`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({}),
  });
}

export function unpublishAdminChallenge(challengeId) {
  return request(`/admin/practice/challenges/${challengeId}/unpublish`, {
    method: "POST",
    headers: adminHeaders(),
  });
}

export function deleteAdminChallenge(challengeId) {
  return request(`/admin/practice/challenges/${challengeId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

export function getAdminPracticeSettings() {
  return request("/admin/practice/settings", { headers: adminHeaders() });
}

export function saveAdminPracticeSettings(payload) {
  return request("/admin/practice/settings", {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
}

export function getAdminPracticeAnalytics(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const suffix = params.toString();
  return request(`/admin/practice/analytics${suffix ? `?${suffix}` : ""}`, {
    headers: adminHeaders(),
  });
}
