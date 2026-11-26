/** Writes deploy/vultr/Caddyfile from vercel.json (routes) and the static security headers. */
import { readFileSync, writeFileSync } from "node:fs";
import { caddyfile, type Rewrite } from "../src/lib/hosting.ts";
import { staticHeaders } from "../src/lib/security/headers.ts";

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { rewrites: Rewrite[] };
writeFileSync(new URL("../deploy/vultr/Caddyfile", import.meta.url), caddyfile(vercel.rewrites, staticHeaders()));
console.log("deploy/vultr/Caddyfile written");
