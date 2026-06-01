/**
 * Registrar dashboard — charts from server stats (registrar_dashboard_stats).
 */

/** @typedef {{ label: string, color: string, value: number }} PieSlice */

let tooltipEl = null;

function loadDashboardStats() {
  const el = document.getElementById("registrar-dashboard-stats");
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "registrar-chart-tooltip";
  tooltipEl.setAttribute("role", "tooltip");
  tooltipEl.hidden = true;
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function hideTooltip() {
  if (!tooltipEl) return;
  tooltipEl.hidden = true;
}

function showTooltip(event, html) {
  const tip = ensureTooltip();
  tip.innerHTML = html;
  tip.hidden = false;

  const pad = 12;
  const rect = tip.getBoundingClientRect();
  let left = event.clientX + pad;
  let top = event.clientY + pad;

  if (left + rect.width > window.innerWidth - 8) {
    left = event.clientX - rect.width - pad;
  }
  if (top + rect.height > window.innerHeight - 8) {
    top = event.clientY - rect.height - pad;
  }

  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function pieSlicePath(cx, cy, r, start, end) {
  const sweep = end - start;
  // A single 360° arc collapses to zero length in SVG — draw a full disc instead.
  if (sweep >= 359.99) {
    return [
      `M ${cx} ${cy}`,
      `L ${cx} ${cy - r}`,
      `A ${r} ${r} 0 1 1 ${cx} ${cy + r}`,
      `A ${r} ${r} 0 1 1 ${cx} ${cy - r}`,
      "Z",
    ].join(" ");
  }
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = sweep <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y} Z`;
}

function pieTooltipHtml(slice, total) {
  const pct = total ? Math.round((slice.value / total) * 100) : 0;
  return (
    `<strong>${slice.label}</strong>` +
    `<span class="registrar-chart-tooltip__value">${slice.value} student${slice.value === 1 ? "" : "s"}</span>` +
    `<span class="registrar-chart-tooltip__meta">${pct}% of enrolled</span>`
  );
}

export function initEnrollmentPieChart(slices) {
  const wrap = document.getElementById("enrollment-pie-chart");
  const svg = wrap?.querySelector(".registrar-pie-svg");
  const legend = document.getElementById("enrollment-pie-legend");
  const emptyEl = document.getElementById("enrollment-pie-empty");
  if (!wrap || !svg) return;

  if (!slices.length) {
    svg.innerHTML = "";
    if (legend) legend.innerHTML = "";
    emptyEl?.classList.remove("d-none");
    return;
  }

  emptyEl?.classList.add("d-none");

  const total = slices.reduce((n, s) => n + s.value, 0);
  const cx = 100;
  const cy = 100;
  const r = 88;
  let angle = 0;

  svg.innerHTML = "";
  if (legend) legend.innerHTML = "";

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

  slices.forEach((slice, i) => {
    const sweep = total ? (slice.value / total) * 360 : 0;
    if (sweep <= 0) return;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pieSlicePath(cx, cy, r, angle, angle + sweep));
    path.setAttribute("fill", slice.color);
    path.setAttribute("class", "registrar-pie-svg__slice");
    path.setAttribute("data-pie-index", String(i));
    path.setAttribute("tabindex", "0");

    const onEnter = (e) => {
      path.classList.add("is-hovered");
      legend?.querySelector(`[data-pie-index="${i}"]`)?.classList.add("is-hovered");
      showTooltip(e, pieTooltipHtml(slice, total));
    };
    const onLeave = () => {
      path.classList.remove("is-hovered");
      legend?.querySelector(`[data-pie-index="${i}"]`)?.classList.remove("is-hovered");
      hideTooltip();
    };

    path.addEventListener("mouseenter", onEnter);
    path.addEventListener("mouseleave", onLeave);
    path.addEventListener("focus", onEnter);
    path.addEventListener("blur", onLeave);

    g.appendChild(path);
    angle += sweep;

    const li = document.createElement("li");
    li.setAttribute("data-pie-index", String(i));
    li.innerHTML = `<span class="registrar-chart-legend__swatch" style="background:${slice.color}"></span>${slice.label}`;
    li.addEventListener("mouseenter", onEnter);
    li.addEventListener("mouseleave", onLeave);
    legend?.appendChild(li);
  });

  svg.appendChild(g);
}

function monthlyBarTooltipHtml(item) {
  return (
    `<strong>${item.month}</strong>` +
    `<span class="registrar-chart-tooltip__value">${item.value} students enrolled</span>` +
    `<span class="registrar-chart-tooltip__meta">Approved enrollments</span>`
  );
}

function monthlyChartAxisMax(dataMax) {
  if (dataMax <= 0) return 4;
  return Math.max(4, Math.ceil(dataMax / 4) * 4);
}

function monthlyChartYTicks(axisMax) {
  const step = axisMax / 4;
  return [axisMax, axisMax - step, axisMax - step * 2, axisMax - step * 3, 0];
}

export function initMonthlyEnrollmentChart(data, currentMonthIndex) {
  const root = document.getElementById("monthly-enrollment-chart");
  const yAxis = root?.querySelector(".registrar-chart__yaxis");
  const bars = root?.querySelector(".registrar-chart__bars");
  if (!bars || !yAxis) return;

  const dataMax = Math.max(...data.map((d) => d.value), 0);
  const axisMax = monthlyChartAxisMax(dataMax);
  const ticks = monthlyChartYTicks(axisMax);

  yAxis.innerHTML = "";
  ticks.forEach((tick) => {
    const span = document.createElement("span");
    span.className = "registrar-chart__ytick";
    span.textContent = String(Math.round(tick));
    yAxis.appendChild(span);
  });

  bars.innerHTML = "";
  data.forEach((item, i) => {
    const col = document.createElement("div");
    col.className = "registrar-chart__col";

    const bar = document.createElement("div");
    bar.className = "registrar-chart__bar";
    const heightPct = dataMax > 0 ? Math.max(4, (item.value / axisMax) * 100) : 4;
    bar.style.setProperty("--h", `${heightPct}%`);
    if (i === currentMonthIndex) {
      bar.classList.add("registrar-chart__bar--current");
    }
    bar.setAttribute("tabindex", "0");

    const label = document.createElement("span");
    label.textContent = item.month;

    const onEnter = (e) => {
      bar.classList.add("is-hovered");
      showTooltip(e, monthlyBarTooltipHtml(item));
    };
    const onLeave = () => {
      bar.classList.remove("is-hovered");
      hideTooltip();
    };

    bar.addEventListener("mouseenter", onEnter);
    bar.addEventListener("mouseleave", onLeave);
    bar.addEventListener("focus", onEnter);
    bar.addEventListener("blur", onLeave);

    col.appendChild(bar);
    col.appendChild(label);
    bars.appendChild(col);
  });
}

function initRegistrarDashboard() {
  const chartStats = loadDashboardStats();
  if (!chartStats) return;

  const yearPill = document.getElementById("dashboard-year-pill");
  if (yearPill && chartStats.year) yearPill.textContent = String(chartStats.year);

  initMonthlyEnrollmentChart(chartStats.monthlyEnrollment || [], chartStats.currentMonthIndex ?? 0);
  initEnrollmentPieChart(chartStats.piePrograms || []);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initRegistrarDashboard);
} else {
  initRegistrarDashboard();
}
