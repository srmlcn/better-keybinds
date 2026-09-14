import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

const require = createRequire(import.meta.url);
const pkg = require("./package.json");
const meta = require("./src/meta.js");

const watch = process.argv.includes("--watch");
const outdir = path.join(process.cwd(), "dist");
const outfile = path.join(outdir, `${meta.name}.plugin.js`);

function buildBanner() {
  const lines = ["/**"];
  const push = (tag, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      lines.push(` * @${tag} ${String(value).trim()}`);
    }
  };
  push("name", meta.name);
  push("author", meta.author);
  push("description", meta.description);
  push("version", pkg.version);
  push("invite", meta.invite);
  push("authorId", meta.authorId);
  push("authorLink", meta.authorLink);
  push("website", meta.website);
  push("source", meta.source);
  push("updateUrl", meta.updateUrl);
  // Deferred load survives Discord's lazy-loaded modules on BD versions that support it.
  lines.push(" * @runAt idle");
  lines.push(" */");
  return lines.join("\n");
}

const options = {
  banner: { js: buildBanner() },
  bundle: true,
  entryPoints: ["src/index.js"],
  format: "cjs",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  logLevel: "info",
  minify: false,
  outfile,
  platform: "browser",
  target: ["chrome114"]
};

fs.mkdirSync(outdir, { recursive: true });

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`Watching for changes -> ${outfile}`);
} else {
  await esbuild.build(options);
  const bytes = fs.statSync(outfile).size;
  console.log(`Built ${outfile} (${(bytes / 1024).toFixed(1)} KB)`);
}
