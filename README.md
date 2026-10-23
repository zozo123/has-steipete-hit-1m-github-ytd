# Has steipete hit 1M GitHub YTD?

An unofficial dashboard, live at
[zozo123.github.io/has-steipete-hit-1m-github-ytd](https://zozo123.github.io/has-steipete-hit-1m-github-ytd/),
that tracks whether GitHub user [`steipete`](https://github.com/steipete) has
reached 1,000,000 GitHub-visible contributions in the current year. Built by
Yossi Eliaz from public GitHub GraphQL data; not affiliated with Peter
Steinberger.

The page is static, but the data is refreshed by GitHub Actions. The workflow
queries GitHub GraphQL for `user.contributionsCollection`, writes
`data/steipete.json`, writes the headline answer into `index.html` (so the
answer is visible without JavaScript), and deploys the site artifact to GitHub
Pages.

## Status

The data refreshes every 12 hours via GitHub Actions. GitHub pauses the
schedule after 60 days without repository activity, which happened after the
Aug 9, 2026 refresh; the workflow has to be re-enabled from the Actions tab
before the page updates again. The page shows a stale-snapshot notice when its
data is more than two days old.

## Local preview

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Refresh data locally

```sh
GITHUB_TOKEN="$(gh auth token)" node scripts/fetch-contributions.mjs
```

This also updates the static answer in `index.html`. To redo only that step
from the committed snapshot, run `node scripts/render-static.mjs`.

The workflow can also be started manually from the Actions tab.

## Resilience

A single flaky run used to leave the site stale until the next cron, 12 hours
later. Three layers now guard against transient failures:

1. `scripts/fetch-contributions.mjs` retries the GraphQL request up to 4 times
   with exponential backoff on network errors, 5xx, and 429. Non-retryable
   errors (401, user not found) fail immediately.
2. `actions/configure-pages` runs with `continue-on-error` — Pages is already
   enabled, the step only reads config, so a transient API blip cannot block
   the deploy.
3. `.github/workflows/retry-failed-deploy.yml` listens for failed completions
   of the deploy workflow and reruns the failed jobs, capped at 2 retries
   (`run_attempt < 3`) so a real breakage cannot loop.

A failed build never reaches the deploy job, so the live site keeps serving
the last good snapshot throughout.

Note: GitHub disables scheduled workflows after 60 days without repository
activity. A commit before then resets the timer; after that, re-enable the
workflow from the Actions tab (see Status).

## Notes

GitHub contribution totals may include `restrictedContributionsCount` when the
profile exposes private contribution counts. The dashboard labels this as
GitHub-visible data because private repository details are not available to the
public site.

Forecasts stay intentionally simple:

- **YTD pace**: current YTD total divided by elapsed days, projected through
  December 31.
- **Recent momentum**: last 30 days averaged and projected through the remaining
  year.
- **Trend forecast**: last-30-day pace adjusted by half of the 14-day pace
  delta versus the prior 14 days. The half-weight keeps the derivative visible
  without letting a short spike dominate the forecast.
