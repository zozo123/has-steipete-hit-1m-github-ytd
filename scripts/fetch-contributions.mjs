import { mkdir, writeFile } from "node:fs/promises";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

const login = process.env.TARGET_USER || "steipete";
const targetCount = Number(process.env.TARGET_COUNT || 1_000_000);
const token =
  process.env.GH_STATS_TOKEN ||
  process.env.GITHUB_TOKEN ||
  process.env.GH_TOKEN;

const now = process.env.REPORT_DATE
  ? new Date(`${process.env.REPORT_DATE}T23:59:59Z`)
  : new Date();
const year = Number(process.env.REPORT_YEAR || now.getUTCFullYear());
const fromDate = `${year}-01-01`;
const fromDateTime = `${fromDate}T00:00:00Z`;
const toDateTime = process.env.REPORT_TO || now.toISOString();
const outputPath = process.env.OUTPUT_PATH || `data/${login}.json`;

if (!token) {
  console.error("GITHUB_TOKEN, GH_TOKEN, or GH_STATS_TOKEN is required.");
  process.exit(1);
}

const query = `
  query ContributionsYtd($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      login
      name
      url
      avatarUrl(size: 160)
      contributionsCollection(from: $from, to: $to) {
        startedAt
        endedAt
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalRepositoryContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              color
              weekday
            }
          }
        }
      }
    }
    rateLimit {
      cost
      remaining
      resetAt
    }
  }
`;

const MAX_ATTEMPTS = 4;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestContributions() {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "has-steipete-hit-1m-github-ytd",
    },
    body: JSON.stringify({
      query,
      variables: {
        login,
        from: fromDateTime,
        to: toDateTime,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(
      `GitHub GraphQL request failed: ${response.status} ${body}`,
    );
    error.retryable = response.status >= 500 || response.status === 429;
    throw error;
  }

  return response.json();
}

let result;
for (let attempt = 1; ; attempt += 1) {
  try {
    result = await requestContributions();
    break;
  } catch (error) {
    // Network-level failures (connection reset, DNS) have no .retryable flag.
    const retryable = error.retryable ?? true;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw error;
    }
    const delayMs = 2000 * 2 ** (attempt - 1);
    console.warn(
      `Attempt ${attempt}/${MAX_ATTEMPTS} failed (${error.message}); retrying in ${delayMs}ms.`,
    );
    await sleep(delayMs);
  }
}

if (result.errors?.length) {
  throw new Error(`GitHub GraphQL error: ${JSON.stringify(result.errors)}`);
}

const user = result.data?.user;
if (!user) {
  throw new Error(`GitHub user not found: ${login}`);
}

const collection = user.contributionsCollection;
const days = collection.contributionCalendar.weeks
  .flatMap((week) => week.contributionDays)
  .map((day) => ({
    date: day.date,
    count: day.contributionCount,
    color: day.color,
    weekday: day.weekday,
  }))
  .sort((a, b) => a.date.localeCompare(b.date));

if (!days.length) {
  throw new Error(`No contribution days returned for ${login}.`);
}

const asOfDate = days[days.length - 1].date;
const publicCategoryTotal =
  collection.totalCommitContributions +
  collection.totalIssueContributions +
  collection.totalPullRequestContributions +
  collection.totalPullRequestReviewContributions +
  collection.totalRepositoryContributions;

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    name: "GitHub GraphQL API",
    profileUrl: `https://github.com/${login}?tab=overview&from=${fromDate}&to=${asOfDate}`,
    graphqlField: "user.contributionsCollection.contributionCalendar",
  },
  subject: {
    login: user.login,
    name: user.name,
    url: user.url,
    avatarUrl: user.avatarUrl,
  },
  target: {
    count: targetCount,
    label: "1M YTD contributions",
  },
  period: {
    year,
    fromDate,
    toDate: asOfDate,
    asOfDate,
    fromDateTime,
    toDateTime,
    daysReturned: days.length,
  },
  totals: {
    ytd: collection.contributionCalendar.totalContributions,
    calendar: collection.contributionCalendar.totalContributions,
    publicCategories: publicCategoryTotal,
    restricted: collection.restrictedContributionsCount,
    commits: collection.totalCommitContributions,
    issues: collection.totalIssueContributions,
    pullRequests: collection.totalPullRequestContributions,
    pullRequestReviews: collection.totalPullRequestReviewContributions,
    repositories: collection.totalRepositoryContributions,
  },
  days,
  rateLimit: result.data.rateLimit,
  caveats: [
    "GitHub-visible totals can include restricted private contribution counts when the profile exposes them.",
    "The public static page receives only the generated JSON snapshot, never the GitHub token.",
  ],
};

await mkdir(outputPath.slice(0, outputPath.lastIndexOf("/")), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(
  `Wrote ${outputPath}: ${payload.totals.ytd.toLocaleString("en-US")} contributions for ${login} through ${asOfDate}.`,
);
