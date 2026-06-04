import fs from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(toolsDir, "..");
const distDir = path.join(rootDir, "dist");

const targets = {
  firefox: "manifest.json",
  chrome: "manifest.chrome.json",
};

const sharedFiles = [
  "background.js",
  "platform.js",
  
  "style.css",

  "popup.html",
  "popup.js",
  "popup.css",

  "options.html",
  "options.js",
  "options.css",

  "icons",
];

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyFileOrDir(from, to) {
  const stat = fs.statSync(from);

  if (stat.isDirectory()) {
    fs.cpSync(from, to, { recursive: true });
    return;
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }
}

function validateJson(filePath) {
  JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildTarget(targetName, manifestFile) {
  const outDir = path.join(distDir, targetName);
  const manifestPath = path.join(rootDir, manifestFile);

  assertExists(manifestPath);
  validateJson(manifestPath);

  removeDir(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  for (const file of sharedFiles) {
    const from = path.join(rootDir, file);
    const to = path.join(outDir, file);

    assertExists(from);
    copyFileOrDir(from, to);
  }

  const outManifestPath = path.join(outDir, "manifest.json");
  fs.copyFileSync(manifestPath, outManifestPath);
  validateJson(outManifestPath);

  console.log(`Built ${targetName}: ${path.relative(rootDir, outDir)}`);
}

removeDir(distDir);
fs.mkdirSync(distDir, { recursive: true });

for (const [targetName, manifestFile] of Object.entries(targets)) {
  buildTarget(targetName, manifestFile);
}