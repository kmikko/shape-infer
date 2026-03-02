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

4. **Workflow publishes automatically.** The merge triggers `changesets.yml` again — this time it detects no pending changesets, builds `dist/`, and runs `pnpm publish`. The package appears on npm within ~1 minute.

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

Ensure you are logged in locally (`npm whoami`) before running `npm publish`.

---

## Setup: required secrets

Both secrets live under **repo Settings → Secrets and variables → Actions**.

### CHANGESET_TOKEN

A GitHub Personal Access Token (classic) with `repo` scope. Needed so the workflow can open PRs on your behalf.

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Generate a token with `repo` scope
3. Add as a repository secret named `CHANGESET_TOKEN`

### NPM_TOKEN

A **granular npm access token** scoped to publish-only for the `shape-infer` package. Granular tokens bypass 2FA and work in automation without exposing full account access.

1. Go to **npmjs.com → Account → Access Tokens → Generate New Token → Granular Access Token**
2. Set scope: **Read and write** on the `shape-infer` package only
3. Add as a repository secret named `NPM_TOKEN`
