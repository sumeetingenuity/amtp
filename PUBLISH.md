# Publishing @amtp/protocol

Guide for publishing the `@amtp/protocol` package to the npm registry.

---

## Prerequisites

- [ ] Node.js >= 18 installed (matches `engines.node` in package.json)
- [ ] npm >= 9 installed
- [ ] An npm account with **write access** to the `@amtp` org
- [ ] You are logged in to npm locally (`npm whoami` should print your username)
- [ ] You have joined the `@amtp` organization on npm (ask an existing owner if needed)

## Pre-publish checklist

Run these locally **before** publishing:

```bash
# 1. Full validation (type-check + build + all 174 tests)
npm run validate

# 2. Check the package contents (what will ship)
npx npm-packlist   # lists every file that will be in the tarball
npx publist        # or: npm pack --dry-run --json | jq .
```

The `files` field in `package.json` restricts the published package to:

```
dist/          — compiled JS + declarations + sourcemaps
bin/           — CLI entry point (amtp.ts)
README.md
USAGE_GUIDE.md
LICENSE
```

Everything else (`src/`, `node_modules/`, tests, config files) is excluded.

## Versioning

Follow [SemVer](https://semver.org):

```bash
# Patch (bug fixes, no breaking changes)
npm version patch   # 1.0.0 → 1.0.1

# Minor (new features, backward compatible)
npm version minor   # 1.0.0 → 1.1.0

# Major (breaking changes)
npm version major   # 1.0.0 → 2.0.0
```

Each `npm version` command:
- Updates the version in `package.json`
- Creates a git commit
- Creates a git tag (e.g. `v1.0.1`)

> **Do not push the tag until you have confirmed the publish succeeded.**

## Publishing

### Step 1 — Authenticate with npm

```bash
npm login
# Follow the prompts — use your npm account credentials.
# For CI automation, use a npm automation token instead:
#   npm token create --read-only    (for CI installs)
#   npm token create               (for publish from CI)
```

### Step 2 — Publish

```bash
npm publish
```

Because `publishConfig.access` is set to `"public"` in `package.json`, this works
even though the package name is scoped (`@amtp/protocol`).

### Step 3 — Push the tag

```bash
git push origin main
git push origin v1.0.1
```

Pushing the tag triggers the **release** job in `.github/workflows/ci.yml` which:
1. Generates a changelog via git-cliff
2. Builds the release archive
3. Creates a GitHub Release with release notes

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `npm ERR! 402 Payment Required` | Scoped packages require paid org | Add `"publishConfig": { "access": "public" }` (already done) |
| `npm ERR! 403 Forbidden` | You don't have write access to the org | Ask an org owner to add you to the `@amtp` org with write perms |
| `npm ERR! 404 Not Found` | Package never published and org auto-created | Try `npm publish --access public` |
| Package includes `src/` or tests | `files` field missing or misconfigured | Run `npx npm-packlist` to verify, update `files` in `package.json` |
| `prepublishOnly` script fails | Validation step didn't pass | Fix the error, commit, and retry |

## CI/CD — Automatic publishing from GitHub Actions

The workflow in `.github/workflows/ci.yml` already has a **release** job
triggered on tags. To enable automatic npm publish from CI:

1. Create an **automation token** on npm:
   ```
   npm token create
   ```
   Save the token value.

2. Add it as a GitHub Actions secret called `NPM_TOKEN`:
   ```
   Settings → Secrets and variables → Actions → New repository secret
   ```

3. Update the `release` job in `ci.yml` to run `npm publish`:

   ```yaml
   - name: Publish to npm
     run: |
       echo "//registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}" > ~/.npmrc
       npm publish
     env:
       NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```

## Verifying the published package

After publishing, verify the package installs correctly:

```bash
mkdir -p /tmp/amtp-verify && cd /tmp/amtp-verify
npm init -y
npm install @amtp/protocol
node -e "const amtp = require('@amtp/protocol'); console.log(Object.keys(amtp));"
```

You should see all exported classes and functions printed.
