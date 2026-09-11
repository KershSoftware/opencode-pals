# Releasing opencode-pals

The public MIT package is `opencode-pals`. End users run `npx opencode-pals@latest install` or `uninstall` with Node 22+. Maintainers build with **Bun 1.3.13**, **Node 24**, and **npm >=11.5.1**. The repository is `KershSoftware/opencode-pals`.

**Current status:** [0.1.0 is published](https://www.npmjs.com/package/opencode-pals/v/0.1.0), and npm's trusted publisher is configured for this repository's `release.yml`, including direct publication permission. The [hosted validation run](https://github.com/KershSoftware/opencode-pals/actions/runs/34553980857) passed; registry-delivered install/update/uninstall was verified in an isolated environment. The first OIDC-backed publication will occur on a future version tag. The bootstrap section below is a historical procedure, not a command to republish 0.1.0.

## First publication: local bootstrap

The package must exist before its npm trusted publisher can be configured. The initial approved version is **0.1.0**. From a reviewed checkout containing the packaging and release changes, verify `package.json` still names `opencode-pals@0.1.0`, then:

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
mkdir -p release
npm pack --pack-destination ./release
bun scripts/verify-npm-install.ts ./release/opencode-pals-0.1.0.tgz
npm publish ./release/opencode-pals-0.1.0.tgz --dry-run --ignore-scripts --access public --registry https://registry.npmjs.org/
```

`npm pack` runs the build and package audit through `prepack`. The acceptance script uses real npm exec/global-bin and Node CLI install/uninstall with temporary HOME, XDG paths, npm config and cache. Keep the leading `./` on relative tarball paths: npm can interpret `release/package.tgz` as GitHub shorthand. Publish the **same tested archive**, without rebuilding:

```sh
npm login --registry https://registry.npmjs.org/
npm publish ./release/opencode-pals-0.1.0.tgz --ignore-scripts --access public --tag latest --registry https://registry.npmjs.org/
npm view opencode-pals@0.1.0 name version license dist.integrity dist.tarball --registry https://registry.npmjs.org/
```

Login and any requested 2FA are interactive maintainer actions. A local bootstrap does not carry GitHub Actions provenance. Publishing with `--ignore-scripts` deliberately avoids lifecycle rebuilds; tests/typecheck and prepack above are required. Do not subsequently push `v0.1.0` to trigger another publish of the already-published version.

## Link npm to GitHub Actions

After bootstrap, open **npmjs.com → opencode-pals → Settings → Trusted publishing** and add a GitHub Actions publisher:

| Field | Value |
| --- | --- |
| Organization or user | `KershSoftware` |
| Repository | `opencode-pals` |
| Workflow filename | `release.yml` (filename only) |
| Environment name | Leave blank; this workflow has no environment |
| Allowed actions | Explicitly enable direct **`npm publish`** |

**Since September 3, 2026, new connections default to stage-only.** This workflow uses direct publishing, so leaving that default is insufficient. The workflow must be present at `.github/workflows/release.yml`. Field spelling/case and the package's `repository.url` must match the GitHub repository. Use a public repository for provenance.

For a package that has not yet been linked, the equivalent CLI setup is below. This repository's link already exists. npm 11.19.1 supports the required permission flag; older clients can fail with HTTP 400 because they omit the newer permission fields. The temporary client does not upgrade your installed npm and still requires the account's browser/2FA approval.

```sh
npm exec --yes --package=npm@11.19.1 -- npm trust github opencode-pals --file release.yml --repository KershSoftware/opencode-pals --allow-publish --registry https://registry.npmjs.org/
```

No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is required. OIDC is granted only to the publish job, which runs on a GitHub-hosted runner. There is no `npm whoami` gate: OIDC authentication happens during `npm publish`. See [npm trusted-publisher documentation](https://docs.npmjs.com/trusted-publishers) for setup and troubleshooting.

## Validate without publishing

Once the workflow is on the default branch, use Actions → **npm release** → **Run workflow**, or:

```sh
gh workflow run release.yml --repo KershSoftware/opencode-pals --ref main
gh run list --repo KershSoftware/opencode-pals --workflow release.yml
gh run view RUN_ID --repo KershSoftware/opencode-pals --log
gh run download RUN_ID --repo KershSoftware/opencode-pals --dir release-evidence
```

Every manual dispatch is validation-only, including dispatches against tags. It tests, typechecks, packs/builds/audits, exercises the exact packed CLI, and dry-runs publication. It cannot validate npm's remote OIDC linkage or permission to publish. A tag selected for manual validation must still exactly match the package version.

## Future version-tag releases

1. Update `package.json` to a new stable `MAJOR.MINOR.PATCH` version. Prereleases and build metadata are intentionally rejected; this workflow publishes to `latest`.
2. Run `bun install` to refresh `bun.lock` if needed, then the bootstrap validation commands above using the new tarball filename. Review and commit the version, lockfile, and release changes.
3. Push the reviewed commit, create the exact matching tag, and push it. For example, **only when releasing 0.1.1**:

   ```sh
   git push origin main
   git tag v0.1.1
   git push origin v0.1.1
   ```

4. Watch the `npm release` run. The `v*` trigger rejects invalid versions and any tag that differs from `v` plus `package.json.version`. Dependencies come from committed `bun.lock` with frozen install. Validation runs without OIDC permission; the minimal publish job downloads and SHA-256-checks the verified artifact, then publishes that tarball without rebuilding. Tag publication is restricted to `KershSoftware/opencode-pals`.
5. Verify the registry:

   ```sh
   npm view opencode-pals@0.1.1 version dist.integrity dist.tarball dist.attestations --json --registry https://registry.npmjs.org/
   npm view opencode-pals dist-tags --json --registry https://registry.npmjs.org/
   ```

The run retains its tarball, checksum, pack log, packed-CLI log, and dry-run log for 30 days, including available evidence on failure. Failures before packing have Actions logs but no tarball artifact. Download artifacts before expiry if longer retention is required.

## Failed releases and rollback limits

Check registry state before rerunning a failed publish: publication may have succeeded even if a later response failed. npm versions are immutable; an existing version cannot be overwritten. Fix forward with a new version and matching tag. Do not move/reuse published tags.

For a bad release, a maintainer may deprecate it and move `latest` to a known-good version (substitute actual versions):

```sh
npm deprecate opencode-pals@0.1.1 'Use the corrected release instead' --registry https://registry.npmjs.org/
npm dist-tag add opencode-pals@0.1.0 latest --registry https://registry.npmjs.org/
```

Moving `latest` affects future installs/updates; it does not undo existing local installations or stop explicit installs of the bad version. There is no automatic unpublish. Any exceptional removal is subject to [npm's unpublish policy](https://docs.npmjs.com/policies/unpublish) and does not make a published version reusable.
