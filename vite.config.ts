/// <reference types="vitest/config" />
import { execFileSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";

const RELEASE_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  "font-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
].join("; ");

// Development adds only the local Vite HMR socket and Vite's inline style injection.
const DEV_CSP = RELEASE_CSP.replace(
  "connect-src 'self'",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
).replace(
  "style-src 'self'",
  "style-src 'self' 'unsafe-inline'",
);

function releaseDisplaySha(): string {
  try {
    const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const dirtyPaths = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" })
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .filter((file) => file !== ".DS_Store");
    return `${sourceSha.slice(0, 9)}${dirtyPaths.length > 0 ? "-dirty" : ""}`;
  } catch {
    return "local";
  }
}

const DISPLAY_SHA = releaseDisplaySha();

function cspPlugin(): Plugin {
  return {
    name: "starhaven-csp",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const content = ctx.server ? DEV_CSP : RELEASE_CSP;
        return {
          html: _html,
          tags: [
            {
              tag: "meta",
              attrs: { "http-equiv": "Content-Security-Policy", content },
              injectTo: "head-prepend",
            },
          ],
        };
      },
    },
  };
}

export default defineConfig({
  base: "./",
  define: {
    __STARHAVEN_DISPLAY_SHA__: JSON.stringify(DISPLAY_SHA),
  },
  plugins: [cspPlugin()],
  build: {
    // Release source maps are disabled.
    sourcemap: false,
    target: "es2022",
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    include: ["tests/release/**/*.spec.ts"],
  },
});
