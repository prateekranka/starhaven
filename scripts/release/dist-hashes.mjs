import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashFiles, MANIFEST_FILE, payloadFiles, sha256 } from "./artifact-lib.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const distRoot = resolve(repositoryRoot, "dist");
mkdirSync(distRoot, { recursive: true });

const files = hashFiles(distRoot, false);
const manifest = {
  schema: 1,
  files,
  fileCount: files.length,
  totalBytes: files.reduce((total, file) => total + file.bytes, 0),
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(resolve(distRoot, MANIFEST_FILE), manifestText);
console.log(JSON.stringify({ manifest: MANIFEST_FILE, files: payloadFiles(distRoot).length, sha256: sha256(Buffer.from(manifestText)) }));
