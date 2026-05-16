const DATA_URL = "data/steipete.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const TARGET_DEFAULT = 1_000_000;
const FIT_METRIC_IDS = [
  "targetCount",
  "progressValue",
  "ytdTotal",
  "gapValue",
  "projectedValue",
  "recentPace",
  "selectedTotal",
  "selectedDelta",
  "publicCount",
  "restrictedCount",
  "commitsCount",
  "prsCount",
  "issuesCount",
  "reviewsCount",
];

const els = {};
let state = {
  data: null,
  from: "",
  to: "",
};

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("resize", debounce(() => {
  if (state.data) {
    render();
  }
}, 120));

async function init() {
  bindElements();

  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Data request failed with ${response.status}`);
    }

    state.data = normalizeData(await response.json());
    initializeRangeControls(state.data);
    render();
  } catch (error) {
    showError(error);
  }
}

function bindElements() {
  [
    "answerLabel",
    "answerDetail",
    "avatar",
    "personName",
    "updatedAt",
    "targetCount",
    "progressBar",
    "progressValue",
    "remainingLabel",
    "ytdTotal",
    "gapValue",
    "requiredValue",
    "projectedValue",
    "hitDateValue",
    "ytdPace",
    "recentPace",
    "recentProjection",
    "trajectorySubhead",
    "trajectoryChart",
    "fromDate",
    "toDate",
    "selectedRangeLabel",
    "selectedTotal",
    "selectedAvg",
    "selectedDelta",
    "profileRangeLink",
    "sourceLine",
    "statusBadge",
    "heatmap",
    "publicCount",
    "restrictedCount",
    "commitsCount",
    "prsCount",
    "issuesCount",
    "reviewsCount",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function normalizeData(payload) {
  const days = [...(payload.days || [])]
    .map((day) => ({
      ...day,
      count: Number(day.count || 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!days.length) {
    throw new Error("Contribution snapshot has no daily data.");
  }

  const firstDate = days[0].date;
  const lastDate = days[days.length - 1].date;

  return {
    ...payload,
    days,
    target: {
      count: Number(payload.target?.count || TARGET_DEFAULT),
      label: payload.target?.label || "1M YTD contributions",
    },
    period: {
      ...payload.period,
      fromDate: payload.period?.fromDate || firstDate,
      toDate: payload.period?.toDate || lastDate,
      asOfDate: payload.period?.asOfDate || lastDate,
      year: Number(payload.period?.year || firstDate.slice(0, 4)),
    },
    totals: payload.totals || {},
  };
}

function initializeRangeControls(data) {
  const params = new URLSearchParams(window.location.search);
  const asOf = data.period.asOfDate;
  const yearStart = `${data.period.year}-01-01`;
  const defaultFrom = params.get("from") || monthStart(asOf);
  const defaultTo = params.get("to") || asOf;

  els.fromDate.min = yearStart;
  els.fromDate.max = asOf;
  els.toDate.min = yearStart;
  els.toDate.max = asOf;

  state.from = clampDate(defaultFrom, yearStart, asOf);
  state.to = clampDate(defaultTo, state.from, asOf);
  els.fromDate.value = state.from;
  els.toDate.value = state.to;

  els.fromDate.addEventListener("change", () => {
    state.from = clampDate(els.fromDate.value, yearStart, asOf);
    state.to = clampDate(els.toDate.value, state.from, asOf);
    els.fromDate.value = state.from;
    els.toDate.min = state.from;
    els.toDate.value = state.to;
    syncUrl();
    render();
  });

  els.toDate.addEventListener("change", () => {
    state.to = clampDate(els.toDate.value, state.from, asOf);
    els.toDate.value = state.to;
    syncUrl();
    render();
  });
}

function render() {
  const model = buildModel(state.data, state.from, state.to);
  updateHeadline(model);
  updateStats(model);
  updateComparison(model);
  updateBreakdown(model);
  renderHeatmap(model);
  drawTrajectory(model);
  fitMetricText();
}

function buildModel(data, from, to) {
  const target = data.target.count;
  const yearStart = `${data.period.year}-01-01`;
  const yearEnd = `${data.period.year}-12-31`;
  const asOf = data.period.asOfDate;
  const ytdTotal = Number(data.totals.ytd || sumRange(data.days, yearStart, asOf));
  const daysElapsed = daysInclusive(yearStart, asOf);
  const daysInYear = daysInclusive(yearStart, yearEnd);
  const daysRemaining = Math.max(0, daysInYear - daysElapsed);
  const ytdAverage = safeDivide(ytdTotal, daysElapsed);
  const projectedYearEnd = Math.round(ytdAverage * daysInYear);
  const gap = Math.max(0, target - ytdTotal);
  const progress = safeDivide(ytdTotal, target);
  const requiredDaily = daysRemaining > 0 ? safeDivide(gap, daysRemaining) : 0;
  const hitOffset = ytdAverage > 0 ? Math.ceil(target / ytdAverage) - 1 : Infinity;
  const hitDate = Number.isFinite(hitOffset) ? addDays(yearStart, hitOffset) : null;
  const recentWindow = trailingDays(data.days, 30);
  const recentAverage = averageDayCount(recentWindow);
  const recentProjection = Math.round(ytdTotal + recentAverage * daysRemaining);
  const current14Average = averageDayCount(trailingDays(data.days, 14));
  const previous14Average = averageDayCount(trailingDays(data.days, 14, 14));
  const paceDelta = current14Average - previous14Average;
  const trendAverage = Math.max(0, recentAverage + paceDelta * 0.5);
  const trendProjection = Math.round(ytdTotal + trendAverage * daysRemaining);
  const selectedDays = data.days.filter((day) => day.date >= from && day.date <= to);
  const selectedTotal = selectedDays.reduce((sum, day) => sum + day.count, 0);
  const selectedAverage = safeDivide(selectedTotal, selectedDays.length);
  const delta = ytdAverage > 0 ? (selectedAverage - ytdAverage) / ytdAverage : 0;

  return {
    data,
    target,
    yearStart,
    yearEnd,
    asOf,
    from,
    to,
    ytdTotal,
    daysElapsed,
    daysInYear,
    daysRemaining,
    ytdAverage,
    projectedYearEnd,
    gap,
    progress,
    requiredDaily,
    hitDate,
    recentWindow,
    recentAverage,
    recentProjection,
    current14Average,
    previous14Average,
    paceDelta,
    trendAverage,
    trendProjection,
    selectedDays,
    selectedTotal,
    selectedAverage,
    delta,
  };
}

function updateHeadline(model) {
  const { data, target, ytdTotal, gap, progress, asOf } = model;
  const hit = ytdTotal >= target;
  const subject = data.subject || {};

  els.answerLabel.textContent = hit ? "YES" : "NO";
  els.answerLabel.classList.toggle("yes", hit);
  els.answerLabel.classList.remove("loading");
  els.answerDetail.textContent = hit
    ? `${fmtNumber(ytdTotal)} as of ${formatDate(asOf)}, ${fmtPercent(progress)} of target.`
    : `${fmtNumber(gap)} short as of ${formatDate(asOf)}, ${fmtPercent(progress)} of target.`;

  els.avatar.src = subject.avatarUrl || "";
  els.avatar.hidden = !subject.avatarUrl;
  els.personName.textContent = subject.name ? `${subject.name} / ${subject.login}` : subject.login || "steipete";
  els.updatedAt.textContent = `Snapshot generated ${formatDateTime(data.generatedAt)}.`;
  els.targetCount.textContent = fmtNumber(target);
  els.progressBar.style.width = `${Math.min(progress * 100, 100).toFixed(2)}%`;
  els.progressValue.textContent = fmtPercent(progress);
  els.remainingLabel.textContent = hit ? "Target cleared" : `${fmtNumber(gap)} remaining`;
  els.statusBadge.textContent = isStale(data.generatedAt) ? "Stale snapshot" : "Fresh snapshot";
  els.profileRangeLink.href = `https://github.com/${subject.login || "steipete"}?tab=overview&from=${model.from}&to=${model.to}`;
}

function updateStats(model) {
  els.ytdTotal.textContent = fmtNumber(model.ytdTotal);
  els.ytdPace.textContent = `${fmtDecimal(model.ytdAverage)} per day across ${model.daysElapsed} days`;
  els.gapValue.textContent = fmtNumber(model.gap);
  els.requiredValue.textContent = model.gap
    ? `${fmtDecimal(model.requiredDaily)} per day needed for the rest of ${model.data.period.year}`
    : "No remaining gap";
  els.projectedValue.textContent = fmtNumber(model.projectedYearEnd);
  els.hitDateValue.textContent = model.hitDate
    ? `At YTD pace: ${formatDate(model.hitDate)}`
    : "No hit date at current pace";
  els.recentPace.textContent = fmtNumber(model.trendProjection);
  els.recentProjection.textContent = `${fmtDecimal(model.trendAverage)} per day; ${signedDecimal(model.paceDelta)} vs prior 14d`;
  els.trajectorySubhead.textContent = `${formatDate(model.yearStart)} to ${formatDate(model.asOf)}; trend forecast ${fmtNumber(model.trendProjection)}.`;
}

function updateComparison(model) {
  const selectedDays = model.selectedDays.length;
  els.selectedRangeLabel.textContent = `${formatDate(model.from)} to ${formatDate(model.to)}`;
  els.selectedTotal.textContent = fmtNumber(model.selectedTotal);
  els.selectedAvg.textContent = `${fmtDecimal(model.selectedAverage)} per day across ${selectedDays} day${selectedDays === 1 ? "" : "s"}`;
  els.selectedDelta.textContent = `${model.delta >= 0 ? "+" : ""}${fmtPercent(model.delta)}`;
}

function updateBreakdown(model) {
  const totals = model.data.totals || {};
  const publicCategories =
    Number(totals.commits || 0) +
    Number(totals.issues || 0) +
    Number(totals.pullRequests || 0) +
    Number(totals.pullRequestReviews || 0) +
    Number(totals.repositories || 0);

  els.publicCount.textContent = fmtNumber(publicCategories);
  els.restrictedCount.textContent = fmtNumber(totals.restricted || 0);
  els.commitsCount.textContent = fmtNumber(totals.commits || 0);
  els.prsCount.textContent = fmtNumber(totals.pullRequests || 0);
  els.issuesCount.textContent = fmtNumber(totals.issues || 0);
  els.reviewsCount.textContent = fmtNumber(totals.pullRequestReviews || 0);
  els.sourceLine.textContent = `GitHub GraphQL snapshot for ${model.data.subject?.login || "steipete"}, as of ${formatDate(model.asOf)}.`;
}

function renderHeatmap(model) {
  const max = Math.max(...model.data.days.map((day) => day.count), 1);
  const fragment = document.createDocumentFragment();
  els.heatmap.textContent = "";

  model.data.days.forEach((day) => {
    const square = document.createElement("span");
    const ratio = day.count / max;
    square.className = "day";
    square.style.backgroundColor = day.color || heatColor(ratio);
    square.title = `${formatDate(day.date)}: ${fmtNumber(day.count)} contributions`;
    square.setAttribute("aria-label", square.title);
    fragment.appendChild(square);
  });

  els.heatmap.appendChild(fragment);
}

function drawTrajectory(model) {
  const canvas = els.trajectoryChart;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(320 * dpr);

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, 320);

  const pad = { top: 22, right: 18, bottom: 36, left: 58 };
  const width = rect.width - pad.left - pad.right;
  const height = 320 - pad.top - pad.bottom;
  const yMax = Math.max(model.target, model.projectedYearEnd, model.trendProjection, model.ytdTotal) * 1.05;
  const daysInYear = model.daysInYear;

  const xForDate = (date) => {
    const offset = daysInclusive(model.yearStart, date) - 1;
    return pad.left + (offset / Math.max(daysInYear - 1, 1)) * width;
  };
  const yForValue = (value) => pad.top + height - (value / yMax) * height;

  drawGrid(ctx, pad, width, height, yMax);
  drawTarget(ctx, pad.left, pad.left + width, yForValue(model.target));

  const actualPoints = [];
  let cumulative = 0;
  model.data.days.forEach((day) => {
    cumulative += day.count;
    actualPoints.push([xForDate(day.date), yForValue(cumulative)]);
  });

  drawLine(ctx, actualPoints, "#1f883d", 3);

  const projectedPoints = [
    [xForDate(model.asOf), yForValue(model.ytdTotal)],
    [xForDate(model.yearEnd), yForValue(model.trendProjection)],
  ];
  drawLine(ctx, projectedPoints, "#245db5", 2.5, [8, 6]);

  drawAxisLabels(ctx, model, pad, width, height, yMax);
}

function drawGrid(ctx, pad, width, height, yMax) {
  ctx.save();
  ctx.strokeStyle = "#e4e9e2";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#626b66";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (height / 4) * i;
    const value = yMax - (yMax / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + width, y);
    ctx.stroke();
    ctx.fillText(shortNumber(value), pad.left - 10, y);
  }

  ctx.restore();
}

function drawTarget(ctx, x1, x2, y) {
  ctx.save();
  ctx.strokeStyle = "#a16207";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function drawLine(ctx, points, color, width, dash = []) {
  if (points.length < 2) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(dash);
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.restore();
}

function drawAxisLabels(ctx, model, pad, width, height) {
  ctx.save();
  ctx.fillStyle = "#626b66";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(String(model.data.period.year), pad.left, pad.top + height + 14);
  ctx.textAlign = "right";
  ctx.fillText("Dec 31", pad.left + width, pad.top + height + 14);
  ctx.restore();
}

function sumRange(days, from, to) {
  return days
    .filter((day) => day.date >= from && day.date <= to)
    .reduce((sum, day) => sum + day.count, 0);
}

function trailingDays(days, size, offset = 0) {
  const end = Math.max(0, days.length - offset);
  return days.slice(Math.max(0, end - size), end);
}

function averageDayCount(days) {
  return safeDivide(
    days.reduce((sum, day) => sum + day.count, 0),
    days.length,
  );
}

function monthStart(dateString) {
  return `${dateString.slice(0, 7)}-01`;
}

function clampDate(value, min, max) {
  if (!value || value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function daysInclusive(from, to) {
  return Math.floor((parseDate(to) - parseDate(from)) / DAY_MS) + 1;
}

function addDays(dateString, offset) {
  const date = parseDate(dateString);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function parseDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function safeDivide(value, divisor) {
  return divisor ? value / divisor : 0;
}

function syncUrl() {
  const params = new URLSearchParams(window.location.search);
  params.set("from", state.from);
  params.set("to", state.to);
  window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
}

function fmtNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function fmtDecimal(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
}

function signedDecimal(value) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${fmtDecimal(value)}`;
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
  }).format(parseDate(value));
}

function formatDateTime(value) {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function shortNumber(value) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return String(Math.round(value));
}

function heatColor(ratio) {
  if (ratio <= 0) {
    return "#ebedf0";
  }
  if (ratio < 0.25) {
    return "#9be9a8";
  }
  if (ratio < 0.5) {
    return "#40c463";
  }
  if (ratio < 0.75) {
    return "#30a14e";
  }
  return "#216e39";
}

function isStale(generatedAt) {
  if (!generatedAt) {
    return true;
  }

  return Date.now() - new Date(generatedAt).getTime() > 8 * 60 * 60 * 1000;
}

function fitMetricText() {
  window.requestAnimationFrame(() => {
    FIT_METRIC_IDS.forEach((id) => {
      const element = els[id];
      if (!element || !element.clientWidth) {
        return;
      }

      element.style.fontSize = "";
      const computed = window.getComputedStyle(element);
      let fontSize = Number.parseFloat(computed.fontSize);
      const minFontSize = element.classList.contains("compact-value") ? 24 : 28;

      while (element.scrollWidth > element.clientWidth && fontSize > minFontSize) {
        fontSize -= 1;
        element.style.fontSize = `${fontSize}px`;
      }
    });
  });
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

function showError(error) {
  els.answerLabel.textContent = "ERR";
  els.answerLabel.classList.remove("loading");
  els.answerDetail.textContent = error.message;
  els.statusBadge.textContent = "Data error";
}
