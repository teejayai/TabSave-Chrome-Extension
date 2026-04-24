import esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");
const watchMode = process.argv.includes("--watch");

const sharedConfig = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome114",
  sourcemap: true,
  logLevel: "info"
};

const buildContext = async () => {
  mkdirSync(resolve(dist, "src", "popup"), { recursive: true });
  mkdirSync(resolve(dist, "public"), { recursive: true });

  cpSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
  cpSync(resolve(root, "public"), resolve(dist, "public"), { recursive: true });
  cpSync(resolve(root, "src", "popup", "index.html"), resolve(dist, "src", "popup", "index.html"));

  const entries = [
    {
      entryPoints: [resolve(root, "src", "background", "service-worker.ts")],
      outfile: resolve(dist, "src", "background", "service-worker.js")
    },
    {
      entryPoints: [resolve(root, "src", "popup", "popup.ts")],
      outfile: resolve(dist, "src", "popup", "popup.js")
    }
  ];

  if (watchMode) {
    const contexts = await Promise.all(
      entries.map((options) => esbuild.context({ ...sharedConfig, ...options }))
    );
    await Promise.all(contexts.map((context) => context.watch()));
    return;
  }

  await Promise.all(entries.map((options) => esbuild.build({ ...sharedConfig, ...options })));
};

buildContext().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
