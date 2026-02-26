# Releasing

1. **Update changelog**
   - Add entry for the new version in `CHANGELOG.md`.
   - Update `package.json` version: `npm version patch|minor|major --no-git-tag-version`.

2. **Verify locally**
   - Run full verification suite:
     ```bash
     pnpm run test:all
     pnpm run check:all
     ```
   - This runs tests, smoke checks, typechecks, linting, API validation, and package checks.

3. **Commit and Tag**
   - Commit changes: `git commit -am "chore: release vX.Y.Z"`
   - Tag the release: `git tag vX.Y.Z`
   - Push: `git push && git push --tags`

4. **Publish**
   - Publish to npm (ensure you are logged in):
     ```bash
     npm publish
     ```

5. **Post-publish**
   - Verify the package on npm.
   - Test install in a fresh project:
     ```bash
     npm install shape-infer
     ```
