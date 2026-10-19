import { DemoDataProvider } from "./data.js";
import { planSchedule, formatBytes } from "./scheduler.js";

const provider = new DemoDataProvider();
let snapshot;
let lastPlan;
let toastTimer;
const $ = selector => document.querySelector(selector);

function totalBytes(nodes, reachableOnly = false) {
  return nodes.filter(n => !reachableOnly || n.status !== "offline").reduce((sum, n) => sum + n.backlogBytes, 0);
}
function ago(timestamp) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}
function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
function renderMetrics(nodes) {
  const online = nodes.filter(n => n.status !== "offline");
  const average = key => online.length ? online.reduce((s, n) => s + n[key], 0) / online.length : 0;
  const fmt = (value, digits = 0) => Number(value).toFixed(digits);
  $("#tempMetric").innerHTML = `${fmt(average("temperature"), 1)}<span>°C</span>`;
  $("#humidityMetric").innerHTML = `${fmt(average("humidity"))}<span>%</span>`;
  $("#soilMetric").innerHTML = `${fmt(average("soilMoisture"))}<span>%</span>`;
  $("#storedMetric").innerHTML = `${formatBytes(totalBytes(nodes, true))}`;
  $("#waitingMetric").innerHTML = `${Math.round(totalBytes(nodes, true) / 1000)} <small>kB</small>`;
}
function renderNodes(nodes) {
  const tbody = $("#nodeTable");
  tbody.innerHTML = nodes.map(node => {
    const statusText = node.status === "alert" ? "Attention" : node.status[0].toUpperCase() + node.status.slice(1);
    const reading = node.status === "offline" ? "—" : `${node.temperature.toFixed(1)}°C`;
    const linkClass = node.linkQuality < .5 ? "weak" : "";
    const linkText = node.status === "offline" ? "—" : `${Math.round(node.linkQuality * 100)}%`;
    return `<tr><td><div class="node-id"><span class="node-symbol ${node.color}">⌖</span><span>${node.id}<small class="node-site">${node.location}</small></span></div></td>
      <td><span class="status-tag ${node.status}"><i></i>${statusText}</span></td><td><b class="reading-val">${reading}</b><small class="reading-type">${node.status === "offline" ? `Seen ${ago(node.lastSeen)}` : `Soil ${node.soilMoisture}%`}</small></td>
      <td><div class="backlog-cell"><b>${formatBytes(node.backlogBytes)}</b><small>oldest ${node.oldestDataHours}h</small></div></td>
      <td><div class="link-quality"><span class="signal-bars ${linkClass}"><i></i><i></i><i></i><i></i></span>${linkText}</div></td><td>${node.status === "alert" ? "⚑" : ""}</td></tr>`;
  }).join("");
}
function renderChart(readings) {
  const select = $("#chartNode");
  const prior = select.value;
  if (select.options.length <= 1) {
    snapshot.nodes.forEach(node => select.add(new Option(node.id, node.id)));
  }
  if ([...select.options].some(option => option.value === prior)) select.value = prior;
  const selected = select.value;
  const points = readings.filter(r => selected === "all" || r.nodeId === selected);
  const byTime = new Map();
  points.forEach(row => {
    const item = byTime.get(row.timestamp) || { temperature: [], soil: [] };
    item.temperature.push(row.temperature); item.soil.push(row.soilMoisture); byTime.set(row.timestamp, item);
  });
  const series = [...byTime.values()].map(v => ({
    temperature: v.temperature.reduce((a, b) => a + b, 0) / v.temperature.length,
    soil: v.soil.reduce((a, b) => a + b, 0) / v.soil.length
  }));
  const x = i => series.length < 2 ? 250 : i * 500 / (series.length - 1);
  const y = value => 164 - Math.max(0, Math.min(80, value)) / 80 * 158;
  const line = key => series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v[key]).toFixed(1)}`).join(" ");
  const circles = key => series.map((v, i) => `<circle class="chart-point ${key === "temperature" ? "temperature" : "soil"}" cx="${x(i)}" cy="${y(v[key])}" r="2.2"/>`).join("");
  $("#dataChart").innerHTML = `<path class="chart-path temperature" d="${line("temperature")}"/><path class="chart-path soil" d="${line("soil")}"/>${circles("temperature")}${circles("soil")}`;
}
function missionInputs() {
  return {
    remainingSeconds: Number($("#flightMinutes").value) * 60,
    returnReserveSeconds: Number($("#reserveMinutes").value) * 60,
    batteryPercent: Number($("#batteryPercent").value),
    batteryReservePercent: 20,
    radioBytesPerSecond: 800
  };
}
function renderSchedule() {
  if (!snapshot) return;
  lastPlan = planSchedule(snapshot.nodes, missionInputs());
  const rows = $("#scheduleRows");
  if (!lastPlan.feasible || !lastPlan.allocations.length) {
    $("#scheduleTitle").textContent = "No visits fit the safe budget";
    $("#scheduleSub").textContent = lastPlan.note;
    $("#plannedTime").textContent = "0 min"; $("#plannedData").textContent = "0 B"; $("#visitCount").textContent = "0";
    rows.innerHTML = `<tr><td class="empty-schedule" colspan="5">${lastPlan.note}</td></tr>`;
  } else {
    $("#scheduleTitle").textContent = `${lastPlan.allocations.length} node${lastPlan.allocations.length === 1 ? "" : "s"} fit the safe budget`;
    $("#scheduleSub").textContent = "Ranked by data age, node priority, link quality and expected transfer time";
    $("#plannedTime").textContent = `${Math.ceil(lastPlan.allocatedSeconds / 60)} min`;
    $("#plannedData").textContent = formatBytes(lastPlan.estimatedBytes);
    $("#visitCount").textContent = String(lastPlan.allocations.length);
    rows.innerHTML = lastPlan.allocations.map((item, index) => {
      const node = snapshot.nodes.find(n => n.id === item.nodeId);
      const width = Math.max(12, Math.min(100, item.serviceSeconds / Math.max(1, lastPlan.allocatedSeconds) * 180));
      return `<tr><td><div class="schedule-node"><span class="order-badge">${String(index + 1).padStart(2, "0")}</span><span><b>${item.nodeName}</b><small>${item.nodeId} · ${node.location}</small></span></div></td>
        <td><span class="reason-tag">${item.reason}</span></td><td><span class="time-track"><i style="width:${width}%"></i></span>${Math.round(item.serviceSeconds)} sec</td>
        <td><span class="collection-val">${formatBytes(item.allocatedBytes)}</span>${item.fullCollection ? "" : " <small>partial</small>"}</td><td>${item.fullCollection ? "Full backlog" : "Partial window"}</td></tr>`;
    }).join("");
  }
  const reserve = Number($("#reserveMinutes").value) || 0;
  $("#reserveReadout").textContent = `${reserve} min reserved`;
  const batteryCapMinutes = missionInputs().remainingSeconds * Math.max(0, (missionInputs().batteryPercent - 20) / Math.max(1, missionInputs().batteryPercent)) / 60;
  $("#reserveNote").textContent = `Protects ${reserve} min for return; battery budget is capped at ${batteryCapMinutes.toFixed(1)} min using a 20% battery reserve assumption.`;
}
async function loadData() {
  snapshot = await provider.getSnapshot();
  renderMetrics(snapshot.nodes); renderNodes(snapshot.nodes); renderChart(snapshot.readings); renderSchedule();
  $("#updatedAt").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
$("#replanButton").addEventListener("click", () => { renderSchedule(); showToast("Schedule recalculated with current mission budget."); });
$("#simulateButton").addEventListener("click", async event => {
  const button = event.currentTarget;
  renderSchedule();
  if (!lastPlan.feasible || !lastPlan.allocations.length) { showToast("No node visits fit the configured safe budget."); return; }
  button.disabled = true; button.textContent = "Collecting…";
  await new Promise(resolve => setTimeout(resolve, 700));
  snapshot = await provider.recordCollection(lastPlan.allocations);
  renderMetrics(snapshot.nodes); renderNodes(snapshot.nodes); renderChart(snapshot.readings); renderSchedule();
  const bytes = lastPlan.estimatedBytes;
  $(".last-collection").textContent = "Just now";
  button.disabled = false; button.innerHTML = "<span>▶</span> Simulate collection";
  showToast(`Demo sortie complete · ${formatBytes(bytes)} collected from ${lastPlan.allocations.length} nodes.`);
});
$("#refreshButton").addEventListener("click", async () => { await loadData(); showToast("Demo sensor data refreshed."); });
$("#chartNode").addEventListener("change", () => renderChart(snapshot.readings));
["#flightMinutes", "#reserveMinutes", "#batteryPercent"].forEach(selector => $(selector).addEventListener("input", () => {
  if (selector === "#batteryPercent") { $("#batteryLabel").textContent = `${$(selector).value}%`; $("#batteryFill").style.width = `${$(selector).value}%`; }
  renderSchedule();
}));
loadData();
