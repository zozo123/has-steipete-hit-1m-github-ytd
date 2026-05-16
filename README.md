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

The scheduled workflow runs every 6 hours and can also be started manually from
the Actions tab.

## Notes

GitHub contribution totals may include `restrictedContributionsCount` when the
profile exposes private contribution counts. The dashboard labels this as
GitHub-visible data because private repository details are not available to the
public site.
