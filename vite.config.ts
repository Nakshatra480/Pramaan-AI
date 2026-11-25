import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { matchRewrite, type Rewrite } from "./lib/hosting.ts";
import { contentSecurityPolicy, staticHeaders } from "./lib/security/headers.ts";

const vercel = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8")) as { rewrites: Rewrite[] };

/**
 * Hosting the way Vercel does it: emits 404.html for unknown paths and makes `vite preview` apply
 * vercel.json's rewrites — app routes get index.html, anything else a real 404.
 */
function staticHosting(): Plugin {
  return {
    name: "pramaan-static-hosting",
    writeBundle(options) {
      const dir = options.dir ?? "dist";
      copyFileSync(join(dir, "index.html"), join(dir, "404.html"));
    },
    configurePreviewServer(server) {
      const root = server.config.build.outDir;
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        if (path !== "/" && existsSync(join(root, path))) return next();
        if (matchRewrite(vercel.rewrites, path)) {
          req.url = "/index.html";
          return next();
        }
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/html");
        res.end(readFileSync(join(root, "404.html")));
      });
    },
  };
}

/** Injects the Content-Security-Policy <meta> tag, hashing index.html's inline scripts for production. */
function contentSecurityPolicyMeta(env: Record<string, string>, dev: boolean, production: boolean): Plugin {
  return {
    name: "pramaan-csp",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (env.VITE_FIREBASE_USE_EMULATOR === "true" && production) {
          throw new Error("VITE_FIREBASE_USE_EMULATOR=true is not allowed in production builds. Use `npm run dev:emulator`.");
        }
        const scriptHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `sha256-${createHash("sha256").update(m[1]).digest("base64")}`);
        const policy = contentSecurityPolicy({
          apiUrl: env.VITE_API_URL,
          firebaseAuthDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
          useEmulator: env.VITE_FIREBASE_USE_EMULATOR === "true",
          dev,
          scriptHashes,
          meta: true,
        });
        return html.replace("<!-- %CSP% -->", `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
      },
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const headers = Object.fromEntries(staticHeaders().map((h) => [h.key, h.value]));
  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicyMeta(env, command === "serve", command === "build" && mode === "production"), staticHosting()],
    resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
    server: { port: 3000, headers },
    preview: { port: 3000, headers },
    build: {
      outDir: "dist",
      sourcemap: false,
      rolldownOptions: {
        output: {
          // Vendor code changes rarely: keep it in its own long-cached chunks.
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
              { name: "firebase", test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
              { name: "motion", test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
            ],
          },
        },
      },
    },
    test: { include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"] },
  };
});
