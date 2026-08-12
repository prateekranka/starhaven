/// <reference types="vitest/config" />
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

// Development adds only the local Vite HMR socket.
const DEV_CSP = RELEASE_CSP.replace(
  "connect-src 'self'",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
);

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
