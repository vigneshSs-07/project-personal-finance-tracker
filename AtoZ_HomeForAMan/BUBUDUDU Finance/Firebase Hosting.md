# Firebase Hosting - deployment and troubleshooting

This guide deploys the current static app to project **`bubududu-finance`**.
It uses **Firebase Hosting**, not Firebase App Hosting. No backend, Firebase
client SDK, database, Docker image or build step is required.

The configuration already exists. **Do not run `firebase init` again** for
this copy of the project. Doing so with the wrong answers previously selected
a placeholder folder instead of the app.

See [README.md](README.md) for app usage and [DEPLOY.md](DEPLOY.md) for costs
and hosting alternatives.

## 1. Understand the source layout

```text
AtoZ_HomeForAMan/
  .firebaserc              default project: bubududu-finance
  firebase.json            public directory and HTTP response headers
  .gitignore
  LICENSE
  README.md
  BUBUDUDU Finance/
    index.html
    styles.css
    manifest.webmanifest
    sw.js
    icons/
    js/
    tests/                 retained for development, excluded from Hosting
    tools/                 retained for development, excluded from Hosting
    README.md
    DEPLOY.md
    Firebase Hosting.md
```

The old SDK copy and Excel project folders have been removed locally. This
does not automatically update an already-uploaded Cloud Shell copy or change
the live site.

The deployment directory is `AtoZ_HomeForAMan`; its Firebase config must have:

```json
{
  "hosting": {
    "public": "BUBUDUDU Finance"
  }
}
```

This is an explanatory excerpt, not a replacement for the existing full
configuration. Keep the existing exclusions and headers in
[`../firebase.json`](../firebase.json).

## 2. Prerequisites and project selection

- Use the Google account authorized to deploy to `bubududu-finance`.
- Check the Firebase console's project settings for the exact **Project ID**;
  display names are not reliable substitutes.
- Keep the project on Spark for no-cost static hosting within quotas.
- No Analytics setup or web-app SDK registration is needed for this app.
- Static Hosting uses a global CDN; there is no Hosting region to select.

### Cloud Shell / Cloud Editor (your current workflow)

Open <https://shell.cloud.google.com> and open its terminal. Cloud Editor's file
explorer is not a guarantee of the terminal's current directory.

All commands marked **Bash** below run in Cloud Shell, not Windows PowerShell.
Check the CLI first:

```bash
firebase --version
```

If unavailable, install the Firebase CLI using a supported Node.js version,
following the [official CLI instructions](https://firebase.google.com/docs/cli).
Do not assume the tool is preinstalled in every Cloud Shell environment.
For interactive remote authentication, if needed:

```bash
firebase login --no-localhost
```

Follow the flow the CLI displays. Never share login codes or tokens.

### Optional local Windows workflow

Install a current supported Node.js LTS and the Firebase CLI following those
same official instructions. Open a new PowerShell terminal after installation.
If `firebase.ps1` is blocked, use `firebase.cmd`; do not change managed-device
execution policy just to deploy.

Use the same project files and deploy command from the parent directory.
The Bash commands below are not PowerShell syntax.

## 3. Check the Cloud Shell copy before deploying

Your screenshots show the project under `$HOME/AtoZ_HomeForAMan`.
If your copy is elsewhere, use its actual path.

**Cloud Shell - Bash:**

```bash
cd "$HOME/AtoZ_HomeForAMan"
pwd
cat firebase.json
cat .firebaserc
ls -l "BUBUDUDU Finance/index.html"
grep -i '<title>' "BUBUDUDU Finance/index.html"
```

Expected:

- `pwd` ends in `/AtoZ_HomeForAMan`.
- `hosting.public` is exactly `BUBUDUDU Finance`, **not `y` or `public`**.
- The HTML title is `<title>BubuDudu's Finance</title>`.
- The default project in `.firebaserc` is `bubududu-finance`.

If necessary, edit the existing files in Cloud Editor and save before
deployment. Copy the full local Firebase configuration rather than replacing
it with only the small excerpt above. `.firebaserc` should contain:

```json
{
  "projects": {
    "default": "bubududu-finance"
  }
}
```

The current full configuration:

- publishes only `BUBUDUDU Finance`;
- excludes its `tools/`, `tests/`, Markdown guides, hidden files and dependencies;
- sets anti-framing, MIME-sniffing, referrer, permissions and HTTPS headers;
- requires revalidation for HTML/JS/CSS/manifest files;
- gives `sw.js` a no-store policy and icons a one-day cache lifetime.

It does not add URL rewrites. The app navigates using UI state, not server-side
routes, so a catch-all SPA rewrite is unnecessary.

## 4. Transfer files only if your Cloud copy needs updating

Skip this section when Cloud Editor already has the correct saved app files.

To package the local runtime and configuration, from the Windows
`AtoZ_HomeForAMan` directory use a **new output filename**:

```powershell
tar.exe -a -cf "$env:USERPROFILE\Downloads\bubududu-release-01.zip" firebase.json .firebaserc "BUBUDUDU Finance/index.html" "BUBUDUDU Finance/styles.css" "BUBUDUDU Finance/manifest.webmanifest" "BUBUDUDU Finance/sw.js" "BUBUDUDU Finance/icons" "BUBUDUDU Finance/js"
```

Inspect the archive with `tar.exe -tf` before uploading. It must include the
configuration files and preserve the `BUBUDUDU Finance` directory structure.
Use Cloud Shell's upload action, noting the actual destination it displays.

Extract into a **new empty release directory**, not over a working copy:

```bash
release_dir=$(mktemp -d "$HOME/bubududu-release.XXXXXX")
unzip "$HOME/bubududu-release-01.zip" -d "$release_dir"
cd "$release_dir"
ls -la
```

Adjust the ZIP path if uploaded elsewhere. Run the checks in section 3 from
this new directory (do not change back to an older copy). Do not delete the
existing project directory as part of deployment.

## 5. Test before release

From the local project root, start the retained development server:

```powershell
py -3 "BUBUDUDU Finance\tools\serve.py"
```

Open <http://localhost:8765/tests/>. The current suite defines 20 tests and the
expected result is `SUMMARY 20/20 passed`. Also review the app at
<http://localhost:8765/>. Stop the server with `Ctrl+C`. No Python packages or
virtual environment are required for these standard-library tools.

If runtime files change, use a new unique cache name in `sw.js`, for example
`finance-hub-release-20261028-01`. The name is not a Firebase version number.
The worker pre-caches the shell and uses network-first fetching with offline
fallback. Updating the worker is not an instantaneous all-tabs refresh.

Optionally test Hosting headers using:

```bash
firebase emulators:start --only hosting --project bubududu-finance --config firebase.json
```

Open the address printed by the CLI. Development tests are excluded from this
Hosting configuration; run them through the development server instead.

## 6. Preview, then publish

From the checked directory containing `firebase.json`, create an optional
seven-day preview:

```bash
firebase hosting:channel:deploy review --expires 7d --project bubududu-finance --config firebase.json
```

Open the printed preview URL and use fictional data. A preview is a separate
origin with separate records and is not an access-controlled staging site.
Anyone with the URL can normally open it.

Publish production:

```bash
firebase deploy --only hosting --project bubududu-finance --config firebase.json
```

The upload must report files from **`BUBUDUDU Finance`**. If it reports
`found 1 files in y`, stop and correct `hosting.public` in the configuration
being used. Do not initialize a new Firebase project to fix this.

Use <https://bubududu-finance.web.app> consistently. The equivalent
`firebaseapp.com` address and custom domains do not share localStorage.

## 7. Verify the actual release

**Cloud Shell - Bash:**

```bash
curl -fsSL "https://bubududu-finance.web.app/?check=$(date +%s)" | grep -i '<title>'
curl -fsSL "https://bubududu-finance.web.app/index.html?check=$(date +%s)" | grep -i '<title>'
curl -fsSI https://bubududu-finance.web.app/sw.js
curl -fsSI https://bubududu-finance.web.app/manifest.webmanifest
curl -s -o /dev/null -w '%{http_code}\n' https://bubududu-finance.web.app/README.md
```

Expected:

- Both titles are `BubuDudu's Finance`.
- JavaScript and the manifest are served successfully with suitable MIME types.
- The service-worker response includes the configured cache policy.
- The Markdown guide returns 404.

Open a fresh incognito window to check the UI, then inspect DevTools:

1. **Console/Network:** no failed app modules or missing icons/styles.
2. **Application > Manifest:** app name and icons load.
3. **Application > Service workers:** the worker activates.
4. After the shell is cached, select Offline in Network and reload. The app
   should still load; not all browser/test/developer paths are pre-cached.
5. Restore the network connection.

On supported Android Chrome, use the install action. On iPhone Safari, use
Share > Add to Home Screen. Labels and availability vary by browser.

### If you still see Firebase's welcome page

First compare the two remote titles above.

| Result | Next action |
|---|---|
| Both still show Firebase's title | Check the deployed config, public directory, target project and saved local HTML; then deploy the correct copy |
| `/index.html` has the app title but `/` does not | Inspect the actual deployed redirects/rewrites and root response; do not assume the app HTML needs replacing |
| Both have the app title but an existing browser shows the welcome page | Open incognito; in the affected browser unregister only this site's service worker, disable cache in DevTools, then hard-reload |
| App title is correct but UI is blank | Inspect JavaScript errors, module responses, MIME types and CSP violations in DevTools |

**Do not clear Local Storage or use Clear site data as a routine fix.** Those
actions can erase financial records. Back up data first. Unregistering the
worker alone does not delete localStorage.

Your last deployment screenshot already showed the correct remote
`/index.html` title, so a placeholder-folder diagnosis alone is no longer
sufficient for a recurring browser issue.

## 8. Updates, rollback and domain changes

For each update: test, version the worker cache if runtime assets changed,
preview, deploy, and verify both remote titles plus actual UI behavior.
Keep known-good source revisions outside Hosting's release history too.

To roll back Hosting, open Firebase console > Hosting > release history and
select a known-good release's rollback action. A Hosting rollback does not
restore browser records and may not immediately replace an active cached
worker. Verify the browser after rollback.

For a custom domain, use Hosting's Add custom domain wizard. Add exactly the
ownership and routing records it requests; allow time for DNS and certificate
provisioning. Do not guess record values or buy an SSL certificate.

Choose the final address before storing real data. To migrate addresses,
download a JSON backup at the old origin and restore it at the new origin.
Back up current records before a restore, sample-data load or erase action.

## 9. Optional GitHub automation

Only configure this after manual deployment works and the actual repository
root is known. The local workspace is not currently a Git repository.

Firebase's [GitHub integration](https://firebase.google.com/docs/hosting/github-integration)
can generate workflows using `firebase init hosting:github`. This optional
GitHub setup is distinct from rerunning `firebase init hosting`.

- Review generated workflows and permissions before enabling automatic deploys.
- Set the action's entry point to the directory containing `firebase.json`
  relative to the repository root.
- Select the correct project and production branch.
- Do not add a build step: this app has none.
- Protect deployment credentials and never commit keys or tokens.
- Use supported authentication with least privilege; generated service-account
  keys require lifecycle management.
- PR preview URLs are not a security boundary or private storage.

## 10. Cost and quota monitoring

Checked on 28 October 2026 against
[Firebase Hosting usage and quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing):

| Allowance | Meaning |
|---|---|
| 10 GB Hosting storage at no cost | Current and retained releases count; quota is shared across the project's sites/channels |
| 10 GB/month Hosting data transfer at no cost | CDN cache hits and misses both count |

On Spark, reaching the storage limit prevents new deployments. Reaching the
transfer allowance can disable sites after a short grace period until the next
month. This differs from the earlier daily-transfer estimate.

Check Hosting usage and retained-release settings in Firebase console.
Deleting releases can remove rollback options; review them before cleanup.
Do not estimate visitor capacity without measuring transferred bytes.

Spark with the supplied domain can cost **INR 0** within its quotas. A custom
domain has separate registration/renewal costs. On Blaze, verify current rates,
conversion and tax before enabling billing. Budget alerts notify you; they do
not cap charges or shut down resources automatically.

## References

- [Firebase CLI](https://firebase.google.com/docs/cli)
- [Hosting configuration](https://firebase.google.com/docs/hosting/full-config)
- [Preview and deployment](https://firebase.google.com/docs/hosting/test-preview-deploy)
- [Hosting quotas and pricing](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
- [Custom domains](https://firebase.google.com/docs/hosting/custom-domain)
