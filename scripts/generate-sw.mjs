import { generateSW } from "workbox-build";

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
const urlPrefix = `${basePath}/`;

const { count, size, warnings } = await generateSW({
  globDirectory: "out",
  globPatterns: ["**/*.{html,css,js,mjs,json,webmanifest,woff2,svg,png,ico}"],
  globIgnores: ["sw.js"],
  swDest: "out/sw.js",
  inlineWorkboxRuntime: true,
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
  navigateFallback: `${basePath}/index.html`,
  modifyURLPrefix: {
    "": urlPrefix,
  },
});

for (const warning of warnings) process.stderr.write(`${warning}\n`);
process.stdout.write(`Precached ${count} files (${size} bytes).\n`);
