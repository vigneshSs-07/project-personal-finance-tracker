# Deployment choices for BubuDudu's Finance

## Recommendation for this project

Continue using **Firebase Hosting on the Spark plan**. The project already has
Firebase configuration and the selected project is `bubududu-finance`.
There is no need to migrate providers or introduce Docker.

Follow [Firebase Hosting.md](<Firebase Hosting.md>) for the detailed Cloud
Shell procedure and troubleshooting. See the [app guide](README.md) for
features and the [project root guide](../README.md) for the cleaned layout.

## What is hosted?

This is a static HTML/CSS/JavaScript app. The runtime files are:

```text
index.html
styles.css
manifest.webmanifest
sw.js
icons/
js/
```

Firebase publishes these from `BUBUDUDU Finance`, using the parent
`firebase.json`. That configuration excludes `tests/`, `tools/`, Markdown
guides, hidden files and dependency folders. Keep development files in source,
but do not publish personal CSVs, backups, credentials, or account keys.

HTTPS supports service workers and installation on supported browsers.
Hosting does not add authentication, a shared database, broker connections,
or device synchronization. Financial records remain in browser localStorage;
the host still sees ordinary request metadata such as IP addresses.

## Hosting costs in INR

The following is a planning comparison, not a price quote. Free-plan limits,
availability, and terms may change. Paid USD prices must be converted using the
actual billing exchange rate, with applicable taxes and fees.

| Option | Personal-use cost | Suitability |
|---|---|---|
| Firebase Hosting, Spark | INR 0 within quotas; free `web.app` address and HTTPS | Recommended here; already configured |
| Cloudflare Pages | Static hosting can be INR 0 within current free-plan limits | Good alternative; no migration is needed now |
| GitHub Pages | INR 0 for eligible repositories/plans | Useful for public static projects; check repository eligibility |
| Netlify | May fit the current free plan | Check current usage/credit limits before choosing |
| Azure Static Web Apps | Free tier available subject to its limits | Alternative if Azure is already in use |
| Container service or VM | Variable; compute, network, registry and build charges may apply | Unnecessary for this app |
| Cloud Storage website endpoint | Storage/transfer plus any HTTPS delivery infrastructure | Less convenient than dedicated static hosting |

As checked against the
[official Firebase Hosting quota documentation](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
on 28 October 2026, no-cost Hosting allowances are **10 GB storage and
10 GB/month data transfer**, shared across the project's Hosting sites/channels.
The old estimate of 360 MB/day should not be used.

On Spark, reaching the storage limit blocks new deployments; reaching the
monthly transfer limit can disable sites after a grace period until the next
month. Spark does not automatically start charging for overages.

The referenced documentation lists Blaze overages at USD 0.026 per additional
GB of storage and USD 0.15 per additional GB transferred. Verify these before
enabling billing. Budget alerts are notifications, **not spending caps**.

A custom domain is optional. Its INR cost depends on the registrar, extension,
renewal price and tax; obtain a current quote rather than budgeting from an
introductory offer. The provider-supplied address requires no domain purchase.

## Should this run in Docker?

No container is required. A container would merely run a web server to deliver
the same static files, while adding image builds, registry management, runtime
configuration and security updates.

Managed container platforms can provide HTTPS and scale to zero, but their
free compute allowances do not guarantee that builds, image storage or
networking are free. An always-on VM adds operating-system maintenance too.
Neither improves this app's financial-data persistence.

If a backend is added later, keep the frontend static and choose backend
hosting separately. A backend would be needed for broker API secrets,
authenticated shared storage or scheduled server jobs.

## Release checklist

1. Back up browser records before testing operations that replace data.
2. Run the existing browser tests from the development server.
3. If runtime assets change, give the service worker cache a new unique name
   in `sw.js`. This triggers a new worker installation; it does not guarantee
   an instantaneous update in every already-open tab.
4. Deploy a preview and test using fictional data.
5. Deploy from the directory containing the correct `firebase.json`.
6. Confirm the remote root page and `/index.html` both have the app title.
7. Test a fresh browser session, offline loading after installation, and phone
   installation on a supported browser.

The current service worker pre-caches the app shell, then uses **network-first**
fetches with cached fallback. Online reloads still request resources.

## Choosing an address

Use one production address consistently, for example
<https://bubududu-finance.web.app>. The `firebaseapp.com` address and any custom
domain have independent browser storage even if they serve identical files.

Deployments do not themselves migrate or erase localStorage. A different
address, browser profile, device, private-browsing session, or cleared site data
can make records appear missing. Use JSON backup/restore to move records.

## Other providers

If switching later, publish the runtime files listed above at the site root.
Use no build command. Exclude developer content explicitly: Firebase's ignore
rules do not automatically apply to other hosts. Git-based paths must be
relative to the actual repository root, not assumed from the local folder name.

Check provider documentation before setup:

- [Firebase Hosting](https://firebase.google.com/docs/hosting)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [GitHub Pages](https://docs.github.com/en/pages)
- [Netlify pricing](https://www.netlify.com/pricing/)
- [Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/)
