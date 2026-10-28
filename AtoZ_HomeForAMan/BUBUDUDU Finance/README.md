# BubuDudu's Finance

A local-first personal finance tracker for recording cash flow, monitoring
accounts and investment snapshots, setting category budgets, and reviewing
financial trends. It is a static web app: no build step, package installation,
account, or application server is needed. It can be installed as a Progressive
Web App (PWA) when hosted in a supported secure context.

The app is for personal tracking and education, not investment, tax, or
accounting advice. It is licensed under the MIT License; see
[`../LICENSE`](../LICENSE).

## What it does

- **Dashboard:** summarizes net worth and monthly changes, and visualizes income
  versus expenses, net-worth trends, savings rate, category comparisons,
  spending share, budget versus actual, investment allocation, and net-worth
  components.
- **Activity:** records income, expenses, refunds, transfers, investment buys,
  and investment sells. Search and filters help review the transaction list.
- **Accounts:** tracks bank, cash, credit-card, loan, wallet, brokerage-cash,
  and other account balances. Debt balances are represented as negative values.
- **Investments:** stores holding snapshots with market value, cost, unrealized
  profit or loss, and portfolio allocation.
- **Budgets:** sets monthly limits by category and highlights overspending.
- **CSV import:** imports transaction statements and investment holdings. The
  import flow supports column mapping, row preview/validation, and duplicate
  detection; it is intended for downloaded CSV files, not direct provider
  connections.
- **CSV export:** downloads transactions, accounts, holdings, budgets, and a
  flattened `cashflow_fact.csv` for use with spreadsheet and reporting tools.
- **JSON backup and restore:** exports the app's stored state to a JSON file and
  restores it later.
- **Offline use:** a service worker caches the app shell and uses cached
  same-origin resources when the network is unavailable. Requests are
  network-first while online; offline support requires a successful initial
  cache installation.

## Requirements

- A modern browser with JavaScript and browser `localStorage` enabled.
- Python 3 only if you want to run the included local development server. The
  server and icon generator use only the Python standard library.

There are no Node.js dependencies, build tools, or Python packages to install
for this app.

## Run locally

Open PowerShell in this `BUBUDUDU Finance` directory and start the local server:

```powershell
py -3 tools\serve.py
```

Then open <http://localhost:8765/>. Stop the server with `Ctrl+C`.

To select another port:

```powershell
py -3 tools\serve.py 9000
```

If the Python launcher (`py`) is unavailable, run the script with another
installed Python 3 interpreter, for example:

```powershell
python tools\serve.py
```

The app should be served over HTTP rather than opened by double-clicking
`index.html`. Browsers restrict JavaScript modules and service workers on
`file://` pages. `localhost` is treated as a secure context by browsers and
supports the service worker.

## Get started

1. Run the app locally using the steps above.
2. Select **Load sample data** to explore the interface with fictional data.
   Loading sample data replaces the currently stored data.
3. Before entering real information, use **Data > Erase everything** to remove
   the sample from this browser. This action is permanent unless you previously
   downloaded a backup.
4. Create accounts under **Accounts**. Record opening balances and represent
   debt with a negative balance.
5. Set the opening date in **Data > Settings** and add transactions under
   **Activity**, or import a statement using **Data > Import**.
6. Add holdings and update their market-value snapshots as needed. Set monthly
   category limits under **Budgets**.
7. Download a JSON backup from **Data** and keep it somewhere safe.

Sample data is for exploration only; it is not a template for real financial
records.

## Financial rules and interpretation

- **Transfers** move value between accounts. They are not income or expenses.
  For example, recording a card purchase as an expense and the later card
  repayment as a transfer keeps the expense counted once.
- **Refunds** reduce expenses in the month the refund is recorded. Category
  spending can therefore become negative if refunds exceed purchases in that
  category during a month.
- **Investment buys and sells** affect cash flow, but do not automatically
  update investment holdings. Update the holding snapshot separately.
- **Net worth** is calculated from account assets, debts, and investment
  snapshots: assets plus investments minus debt.
- **Validation:** invalid or duplicate rows are flagged and excluded from
  calculations; the dashboard indicates when totals are provisional. Review
  flagged rows before relying on summaries.
- **Dates:** dashboard summaries can be reviewed by month and as of a selected
  date. Transactions after the selected as-of date are not included.
- **Currency precision:** amounts are stored internally as integer paise (100
  paise per INR) to avoid floating-point rounding in financial calculations.
  The app currently supports INR only.
- **Holding freshness:** holdings have a freshness indicator; stale values are
  still included in calculations and should be refreshed manually.

## Importing and exporting

### Import CSV files

Use the import controls in the **Data** section to select a transaction or
holdings CSV. Map the source columns to the app's fields, inspect the preview,
and resolve invalid or duplicate rows before accepting the import. The app can
suggest mappings, but check them against the source file before importing.

CSV layouts differ between banks and investment providers. This is a general
column-mapping workflow, not an official connector or a guarantee that every
provider's file format will import without adjustment. The app does not connect
to Groww, Angel One, banks, brokers, or other accounts, and it does not request
provider credentials.

### Export files

The **Data** section can download:

- `cashflow_fact.csv` — a flat, signed cash-flow table designed for reporting.
- Transactions — the app's transaction records.
- Accounts — account records and balances.
- Holdings — investment holding snapshots.
- Budgets — monthly budget records.

CSV exports are suitable for opening in spreadsheet software and can be loaded
into Power BI with **Get data > Text/CSV** or into Looker Studio using its file
upload or Google Sheets options. Exports are point-in-time downloads; they do not
provide scheduled refresh.

Values beginning with spreadsheet formula characters are neutralized in CSV
exports to reduce the risk of spreadsheet formula execution. Always review
exported files before sharing them.

### Backup and restore

**Download backup** saves the current app state as JSON. Keep this file private:
it can contain the personal financial records held by the app. **Restore backup**
replaces the app's current state with the selected backup. Download a fresh
backup before restoring if you may want to recover the current state.

## Install on a phone

To install the app on a phone, host the contents of this folder as static files
over HTTPS. The service worker and install support require HTTPS, except when
using `localhost` for local development. This project is configured for
Firebase Hosting with `BUBUDUDU Finance` as the publish directory. Developer
tools, tests and Markdown guides are excluded by the parent configuration.
See [Firebase Hosting.md](<Firebase Hosting.md>) for Cloud Shell deployment,
preview and recovery steps, and [DEPLOY.md](DEPLOY.md) for hosting alternatives
and INR cost considerations.

- **Android:** open the HTTPS site in Chrome and choose **Install app** (or the
  browser's equivalent install option).
- **iPhone:** open the HTTPS site in Safari, tap **Share**, then **Add to Home
  Screen**.

Each browser profile and device has its own local data. Installing the app does
not synchronize records between devices; use **Data > Download backup** and
restore the file on the other device when moving data.

## Run the tests

Start the local server, then open <http://localhost:8765/tests/>. The page runs
the browser-based unit tests and reports a summary; the expected result for the
current suite is `SUMMARY 20/20 passed`.

The production Hosting configuration excludes these tests, so run them through
the development server rather than expecting `/tests/` on the deployed site.

The suite covers core financial calculations and validation, transfers,
refunds, investment cash-flow behavior, duplicate detection, date and amount
parsing, CSV import/export, and sample data. Run it after changes to the app's
logic.

## Project structure

```text
BUBUDUDU Finance/
  index.html                app document, navigation, security policy, entry point
  styles.css                layout, responsive styling, and visual theme
  manifest.webmanifest      PWA name, display settings, and install icons
  sw.js                     service-worker cache and offline fallback behavior
  icons/
    icon.svg                scalable source icon
    icon-180.png            iOS home-screen icon
    icon-192.png            standard app icon
    icon-512.png            large and maskable app icon
  js/
    app.js                  screens, forms, navigation, and user interactions
    core.js                 financial rules, validation, reports, CSV, import logic
    charts.js               dependency-free SVG chart rendering
    store.js                persistence boundary using browser localStorage
  tests/
    index.html              browser test runner page
    core.test.js            financial and data-handling unit tests
  tools/
    serve.py                local static development server (default port 8765)
    make_icons.py           regenerates PNG icons from Python standard library
```

### Architecture overview

`js/core.js` contains pure finance and data-processing logic, including state
normalization, validation, calculations, CSV parsing/export, and import mapping.
`js/app.js` handles the user interface and delegates calculations to the core
module. `js/charts.js` renders SVG charts without a chart-library dependency.
`js/store.js` is the persistence boundary; it currently stores the serialized
app state in `localStorage` under the key `finance-hub.v1`.

This separation keeps the finance rules independent of the UI and storage
implementation. A future backend or synchronization layer would need to replace
the storage boundary and address authentication, authorization, privacy, and
server-side secret management; none of those capabilities are included today.

## Privacy and security

- Records stay in this browser's `localStorage`; they are not encrypted.
  Anyone who can access the browser profile or device may be able to access
  them. Use a device lock and keep secure backups.
- Clearing this site's browser data can erase the app's records. Back up
  important data before clearing site data or changing browsers.
- Records are specific to the origin (protocol, domain and port), browser
  profile and device. Hosting may receive normal request metadata, but the
  current app does not upload financial records to a backend.
- There is no sign-in, analytics, or third-party service integration. The page
  defines a Content Security Policy that restricts scripts, styles, connections,
  and embedded content to the app's own origin (with data URLs allowed for
  images).
- Do not enter bank or broker passwords, one-time passcodes, API keys, or other
  authentication secrets into the app or its CSV files.
- The app is a personal tracking tool, not a financial institution or secure
  accounting system.

## Current limitations

- Single-user and INR-only; no multi-currency conversion or foreign-exchange
  support.
- No bank/broker login, live synchronization, market prices, or automatic
  holding updates.
- No realized capital-gains calculations or XIRR.
- No cross-device synchronization, cloud backup, hosted database, or scheduled
  reporting refresh.
- Local browser storage is not encrypted. Users are responsible for device
  security and backups.
- The app does not provide tax, investment, or financial advice.

## Icon generation

To regenerate the PNG icons using Python 3:

```powershell
py -3 tools\make_icons.py
```

The script writes the PNG assets into `icons/`. It overwrites the generated
files with those names; keep any custom replacements elsewhere before running
it.

## Deployment and related guides

- [Project overview and deployment configuration](../README.md)
- [Hosting choices and cost considerations](DEPLOY.md)
- [Firebase Hosting: Cloud Shell deployment and troubleshooting](<Firebase Hosting.md>)

The project now contains only this web app and its Firebase configuration.
The former SDK copy, Excel workbooks, workbook generators and their Python
environment have been removed. The app's own `tests/` and `tools/` remain.
