// Writes the headline answer from a contribution snapshot into index.html, so
// crawlers, link unfurlers, and readers without JavaScript see the answer
// instead of a loading state. app.js still renders the full dashboard.
//
// Usage: node scripts/render-static.mjs [data/steipete.json] [index.html]
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_DATA_PATH = "data/steipete.json";
const DEFAULT_HTML_PATH = "index.html";

export async function renderStaticPage(payload, htmlPath = DEFAULT_HTML_PATH) {
  const html = await readFile(htmlPath, "utf8");
  const next = renderHtml(html, payload);
  if (next !== html) {
    await writeFile(htmlPath, next);
  }
  console.log(`Rendered static answer into ${htmlPath}.`);
}

export function renderHtml(html, payload) {
  const target = Number(payload.target?.count || 1_000_000);
  const ytd = Number(payload.totals?.ytd || 0);
  const asOf = payload.period?.asOfDate;
  const subject = payload.subject || {};
  const hit = ytd >= target;
  const progress = target ? ytd / target : 0;
  const gap = Math.max(0, target - ytd);

  // Same wording as updateHeadline() in app.js.
  const detail = hit
    ? `${fmtNumber(ytd)} as of ${formatDate(asOf)}, ${fmtPercent(progress)} of target.`
    : `${fmtNumber(gap)} short as of ${formatDate(asOf)}, ${fmtPercent(progress)} of target.`;
  const name = subject.name
    ? `${subject.name} / ${subject.login}`
    : subject.login || "steipete";

  let out = html;
  out = replaceElement(out, "answerLabel", hit ? "answer yes" : "answer", hit ? "YES" : "NO");
  out = replaceElement(out, "answerDetail", "answer-detail", detail);
  out = replaceElement(out, "personName", "person-name", name);
  out = replaceElement(
    out,
    "updatedAt",
    "muted",
    `Snapshot generated ${formatDateTimeUtc(payload.generatedAt)}.`,
  );

  if (payload.generatedAt) {
    out = out.replace(
      /"dateModified":\s*"[^"]*"/,
      `"dateModified": "${payload.generatedAt.slice(0, 10)}"`,
    );
  }

  return out;
}

function replaceElement(html, id, className, text) {
  const pattern = new RegExp(`<p id="${id}"[^>]*>[^<]*</p>`);
  if (!pattern.test(html)) {
    console.warn(`render-static: #${id} not found; left unchanged.`);
    return html;
  }
  return html.replace(pattern, `<p id="${id}" class="${className}">${escapeHtml(text)}</p>`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function fmtPercent(value) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTimeUtc(value) {
  if (!value) {
    return "unknown";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataPath = process.argv[2] || DEFAULT_DATA_PATH;
  const htmlPath = process.argv[3] || DEFAULT_HTML_PATH;
  const payload = JSON.parse(await readFile(dataPath, "utf8"));
  await renderStaticPage(payload, htmlPath);
}
