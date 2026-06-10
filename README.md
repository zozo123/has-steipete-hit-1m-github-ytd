# Has steipete hit 1M GitHub YTD?

Static GitHub Pages dashboard for tracking whether
[`steipete`](https://github.com/steipete) has crossed 1,000,000 GitHub-visible
contributions in the current year.

The page is static, but the data is refreshed by GitHub Actions. The workflow
queries GitHub GraphQL for `user.contributionsCollection`, writes
`data/steipete.json`, and deploys the site artifact to GitHub Pages.

## Local preview

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Refresh data locally

```sh
GITHUB_TOKEN="$(gh auth token)" node scripts/fetch-contributions.mjs
```

## Publish

```sh
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/zozo123/has-steipete-hit-1m-github-ytd.git
git push -u origin main
```

Then set the repository Pages source to **GitHub Actions** in
`Settings -> Pages`.

The scheduled workflow runs every 12 hours and can also be started manually from
the Actions tab.

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
activity. If the repo sits untouched that long, any trivial commit revives the
cron.

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
