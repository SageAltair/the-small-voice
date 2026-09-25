import { describe, expect, it } from "vitest";
import { isSafeMediaUrl, resolveEmbed, safeParse } from "../embedUtils.js";

/**
 * Embed handling is a security boundary: arbitrary URLs must never reach an
 * iframe src, and the unsafe schemes must be refused outright.
 */

describe("embed URL safety", () => {
  it("accepts an https URL", () => {
    expect(Boolean(safeParse("https://example.com"))).toBe(true);
  });

  it("assumes https when a scheme is omitted", () => {
    expect(safeParse("example.com/video")?.protocol).toBe("https:");
  });

  it("refuses javascript: URLs", () => {
    expect(resolveEmbed("javascript:alert(1)").ok).toBe(false);
  });

  it("refuses data: URLs", () => {
    expect(resolveEmbed("data:text/html,<script>alert(1)</script>").ok).toBe(false);
  });

  it("refuses plain http", () => {
    expect(safeParse("http://example.com")).toBeNull();
  });

  it("refuses an empty value", () => {
    expect(safeParse("")).toBeNull();
    expect(safeParse(null)).toBeNull();
    expect(resolveEmbed("").ok).toBe(false);
  });

  it("refuses localhost and private addresses", () => {
    expect(resolveEmbed("https://localhost:3000/app").ok).toBe(false);
    expect(resolveEmbed("https://192.168.1.5/x").ok).toBe(false);
  });

  it("treats a non-https media URL as unsafe", () => {
    expect(isSafeMediaUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeMediaUrl("https://example.com/a.png")).toBe(true);
  });
});

describe("embed providers", () => {
  it("builds a privacy-preserving YouTube embed", () => {
    const result = resolveEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    expect(result.src).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("supports youtu.be short links", () => {
    const result = resolveEmbed("https://youtu.be/dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    expect(result.src).toContain("dQw4w9WgXcQ");
  });

  it("builds a Vimeo embed", () => {
    const result = resolveEmbed("https://vimeo.com/76979871");
    expect(result.ok).toBe(true);
    expect(result.src).toBe("https://player.vimeo.com/video/76979871");
  });

  it("builds a Spotify embed", () => {
    const result = resolveEmbed("https://open.spotify.com/embed/track/abc");
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("spotify");
  });

  it("allows a plain https page from an unknown host", () => {
    const result = resolveEmbed("https://example.com/lesson");
    expect(result.ok).toBe(true);
    expect(result.src).toBe("https://example.com/lesson");
  });

  it("explains why a malformed provider link failed", () => {
    const result = resolveEmbed("https://www.youtube.com/");
    expect(result.ok).toBe(false);
    expect(typeof result.reason).toBe("string");
  });
});
