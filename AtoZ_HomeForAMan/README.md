# BubuDudu's Finance - project root

A static, local-first personal finance web app, configured for Firebase Hosting.
There is no backend, database, build step, or application dependency install.
Financial records are stored in the user's browser, not in Firebase.

## Project layout

```text
AtoZ_HomeForAMan/
  .firebaserc                  default Firebase project: bubududu-finance
  firebase.json                publish directory, exclusions, response headers
  .gitignore                   development/cache exclusions
  LICENSE                      MIT license
  README.md                    this overview
  BUBUDUDU Finance/
    index.html
    styles.css
    manifest.webmanifest
    sw.js
    icons/
    js/                        UI, finance logic, charts, browser storage
    tests/                     browser unit tests
    tools/                     Python development server and icon generator
    README.md                  app features and user guide
    DEPLOY.md                  hosting options and costs
    Firebase Hosting.md        detailed deployment and recovery guide
```

Only runtime files inside `BUBUDUDU Finance` are published. The existing
`firebase.json` excludes its tests, tools, hidden files, and Markdown guides.
Keep the app's tests and development tools in the source project.

The former SDK app copy, Excel deliverables, parent-level workbook generators
and tests, Python virtual environment, and workbook requirements file were
removed during cleanup. They are not needed by this web app.

## Read first

- [App guide](<BUBUDUDU Finance/README.md>)
- [Firebase Hosting deployment steps](<BUBUDUDU Finance/Firebase Hosting.md>)
- [Other hosting options and costs](<BUBUDUDU Finance/DEPLOY.md>)

## Run and test locally (Windows)

From this directory, using an installed Python 3 interpreter:

```powershell
py -3 "BUBUDUDU Finance\tools\serve.py"
```

Open <http://localhost:8765/> for the app and
<http://localhost:8765/tests/> for the tests. The current suite defines 20 tests;
the expected summary is `SUMMARY 20/20 passed`. No Python packages are needed.
Stop the server with `Ctrl+C`.

## Deploy from Cloud Shell

These are **Bash commands for Google Cloud Shell**, not local PowerShell.
They assume the project is uploaded to `$HOME/AtoZ_HomeForAMan`.

```bash
cd "$HOME/AtoZ_HomeForAMan"
firebase deploy --only hosting --project bubududu-finance --config firebase.json
```

Use the existing configuration; do not run `firebase init` again. The upload
must report files from `BUBUDUDU Finance`, not `public` or `y`.
See the detailed guide for prerequisites, checks, previews, and rollback.

## Privacy and licensing

The source is MIT-licensed; see [LICENSE](LICENSE). Browser records and JSON
backups are not encrypted by the app. Keep backups private. Browser storage
is separate for each protocol/domain/port, browser profile, and device.
Moving to a new address requires a backup and restore, not just redeployment.
The host can receive normal web-request metadata, but the current app has no
financial-data upload API or cross-device synchronization.
