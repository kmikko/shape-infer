# Development & release cycle

## Day-to-day development

1. **Branch off main** and make your changes.

2. **Add a changeset** before opening a PR:

   ```bash
   pnpm changeset
   ```

   The interactive prompt asks:
   - **patch** — bug fix, no API change
   - **minor** — new backwards-compatible feature
   - **major** — breaking change

   This creates a `.changeset/<random-name>.md` file. Commit it alongside your changes.

   > If you forget, the `changeset-check` CI job will post a reminder comment on your PR.

3. **Open a PR** and let CI run. The pipeline fans out into parallel jobs:
   - **typecheck** — `tsc --noEmit`
   - **lint** — Prettier + ESLint + Knip
   - **test** — Vitest unit + type tests (coverage thresholds enforced)
   - **build** — tsup, uploads `dist/` artifact
   - **validate** — package checks (publint, attw, pack) + smoke/CLI/pack tests (requires build)
   - **api** — API Extractor golden-file check (requires build)

4. Merge when CI is green.

---

## Release cycle

Releasing is automatic by default. The `changesets.yml` workflow has two modes depending on what's on `main`:

- **Changesets pending** → opens/updates a "Version Packages" PR (no publish yet)
- **Version PR just merged, version not on npm** → builds and publishes to npm automatically

### Automatic release (default)

1. **Changesets accumulate on main.** Each merged PR that included a `.changeset/*.md` file adds to the pending release.

2. **"Version Packages" PR is auto-created.** The workflow:
   - Consumes all pending `.changeset/*.md` files
   - Bumps `package.json` version (highest semver bump across all changesets)
   - Rewrites `CHANGELOG.md` with PR-linked entries
   - Opens (or force-pushes) a PR titled **"Version Packages"**

3. **Review and merge the "Version Packages" PR.** Check the version bump and changelog look correct, then merge.

4. **Workflow publishes automatically.** The merge triggers `changesets.yml` again — this time it detects no pending changesets, builds `dist/`, and runs `npm publish` via OIDC trusted publishing (no token required). The package appears on npm within ~1 minute, with a provenance attestation automatically attached.

5. **Verify on npm:**
   - `https://www.npmjs.com/package/shape-infer`
   - Smoke-test: `npm install shape-infer`

### Manual release (fallback)

Use this if the automatic publish fails or you need to publish from a hotfix branch outside the normal flow.

```bash
pnpm run build
pnpm run test:all
pnpm run check:all
npm publish
```

Ensure you are logged in locally (`npm whoami`) before running `npm publish`. OIDC trusted publishing only works from GitHub Actions — local publishes use your interactive npm session.

---

## Setup: required secrets

Only one secret is needed. npm publishing uses OIDC trusted publishing — no `NPM_TOKEN` required.

### CHANGESET_TOKEN

A GitHub fine-grained Personal Access Token. Needed so the workflow can push commits and open PRs on your behalf.

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Set:
   - **Resource owner:** your org or user
   - **Repository access:** Only select repositories → pick your repo
4. Under **Permissions → Repository permissions**, set:
   - `Contents` → **Read and write**
   - `Pull requests` → **Read and write**
5. Generate and copy the token
6. Add it as a repo secret: `Settings → Secrets → Actions` → name it `CHANGESET_TOKEN`

---

## Setup: npm OIDC trusted publishing

Publishing to npm uses [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers) — the workflow authenticates via a short-lived GitHub OIDC token instead of a long-lived `NPM_TOKEN`. Provenance attestations are generated automatically.

This only needs to be configured once on npmjs.com.

1. Go to **npmjs.com → Packages → shape-infer → Settings → Trusted publishing**
2. Click **Add a trusted publisher** and select **GitHub Actions**
3. Fill in:
   - **Organization or user:** your GitHub username
   - **Repository:** `shape-infer`
   - **Workflow filename:** `changesets.yml`
4. Save

No `NPM_TOKEN` secret is needed in GitHub. The `id-token: write` permission in the workflow is what allows GitHub Actions to mint the OIDC token.
