# Starhaven release artifact contract

The release artifact is the Vite `dist/` directory produced from one clean source SHA.

`dist-hashes.json` lists every payload path except itself and `build-info.json`. Each entry records the decoded byte length and SHA-256 hash. `build-info.json` records the source SHA, display SHA, clean state, bridge version, balance version, toolchain majors, and the exact manifest hash.

The Pages workflow checks out `${GITHUB_SHA}`, installs `package-lock.json`, builds once, uploads `starhaven-dist-${GITHUB_SHA}` with 90-day retention, and deploys the same `dist/` directory to Pages. Release metadata records numeric run, artifact, and deployment IDs.

Staging accepts only a clean artifact with the expected full source SHA. Verification compares decoded file bytes. It rejects a dirty build, a wrong source SHA, a missing manifest entry, and any hash mismatch.

The attestation commit in `notes.md` records these trailers:

```text
Artifact-Source-SHA: <40-hex>
Dist-Manifest-SHA256: <64-hex>
Build-Info-SHA256: <64-hex>
GitHub-Run-ID: <numeric>
GitHub-Artifact-ID: <numeric>
GitHub-Deployment-ID: <numeric>
```
