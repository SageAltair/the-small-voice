import { describe, expect, it } from "vitest";
import { getImageUrl, toMediaPath } from "../api.js";

/**
 * Learn content stores media as a same-origin "/uploads/..." path or an
 * absolute https URL - the API refuses anything else (see clean_media_url in
 * the backend). Uploads come back from the API as absolute URLs, so the value
 * written back has to be trimmed to its path; without that the server drops the
 * cover or lesson image and it disappears on the next save.
 */

describe("toMediaPath", () => {
  // vite.config.js pins VITE_API_URL to http://photos.test for the test run.
  it("keeps a same-origin upload path as it is", () => {
    expect(toMediaPath("/uploads/cover.jpg")).toBe("/uploads/cover.jpg");
  });

  it("trims an absolute URL from this API back to its path", () => {
    expect(toMediaPath("http://photos.test/uploads/cover.jpg")).toBe("/uploads/cover.jpg");
  });

  it("keeps the query string of an upload URL", () => {
    expect(toMediaPath("http://photos.test/uploads/cover.jpg?v=2")).toBe("/uploads/cover.jpg?v=2");
  });

  it("leaves another host's URL alone for the API to judge", () => {
    const external = "https://images.example.com/photo.jpg";
    expect(toMediaPath(external)).toBe(external);
    const otherHost = "http://127.0.0.1:8000/uploads/cover.jpg";
    expect(toMediaPath(otherHost)).toBe(otherHost);
  });

  it("treats an empty value as no media", () => {
    expect(toMediaPath("")).toBe("");
    expect(toMediaPath(null)).toBe("");
    expect(toMediaPath(undefined)).toBe("");
  });
});

describe("getImageUrl", () => {
  it("prefixes a stored path with the API base", () => {
    expect(getImageUrl("/uploads/cover.jpg")).toBe("http://photos.test/uploads/cover.jpg");
  });

  it("passes an absolute URL through untouched", () => {
    expect(getImageUrl("https://images.example.com/photo.jpg")).toBe(
      "https://images.example.com/photo.jpg"
    );
  });

  it("round-trips an upload back to the path it was stored as", () => {
    expect(toMediaPath(getImageUrl("/uploads/cover.jpg"))).toBe("/uploads/cover.jpg");
  });
});
