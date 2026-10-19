/** Data boundary for the dashboard. Replace DemoDataProvider with a fetch or
 * serial bridge provider once the ground station / SD-card export is defined. */
const now = Date.now();
const hour = 60 * 60 * 1000;
const demoNodes = [
  { id: "N1", name: "North field", location: "Plot A · 120 m", status: "online", priority: 3, linkQuality: .92, backlogBytes: 184_000, oldestDataHours: 31, lastSeen: now - 4 * 60_000, temperature: 24.8, humidity: 61, soilMoisture: 38, battery: 83, setupSeconds: 9, sf: "SF7", color: "teal" },
  { id: "N2", name: "East orchard", location: "Plot B · 260 m", status: "online", priority: 2, linkQuality: .74, backlogBytes: 92_000, oldestDataHours: 18, lastSeen: now - 7 * 60_000, temperature: 27.2, humidity: 54, soilMoisture: 29, battery: 66, setupSeconds: 10, sf: "SF8", color: "blue" },
  { id: "N3", name: "Creek bank", location: "Plot C · 410 m", status: "alert", priority: 3, linkQuality: .62, backlogBytes: 241_000, oldestDataHours: 46, lastSeen: now - 11 * 60_000, temperature: 22.1, humidity: 78, soilMoisture: 72, battery: 48, setupSeconds: 12, sf: "SF9", color: "amber" },
  { id: "N4", name: "South ridge", location: "Plot D · 530 m", status: "online", priority: 1, linkQuality: .81, backlogBytes: 36_000, oldestDataHours: 8, lastSeen: now - 3 * 60_000, temperature: 29.4, humidity: 43, soilMoisture: 21, battery: 91, setupSeconds: 9, sf: "SF7", color: "violet" },
  { id: "N5", name: "West grove", location: "Plot E · 690 m", status: "offline", priority: 2, linkQuality: .22, backlogBytes: 118_000, oldestDataHours: 53, lastSeen: now - 92 * 60_000, temperature: 26.0, humidity: 58, soilMoisture: 46, battery: 19, setupSeconds: 15, sf: "—", color: "rose" }
];

const readings = demoNodes.flatMap((node, index) => Array.from({ length: 12 }, (_, i) => {
  const time = now - (11 - i) * hour;
  const drift = i * .18;
  return {
    nodeId: node.id, timestamp: new Date(time).toISOString(),
    temperature: +(node.temperature - 1.5 + drift + Math.sin(i * .8 + index) * 1.2).toFixed(1),
    humidity: Math.round(node.humidity - 4 + Math.cos(i * .5 + index) * 5),
    soilMoisture: Math.max(8, Math.min(95, Math.round(node.soilMoisture + Math.sin(i * .55 + index) * 7)))
  };
}));

export class DemoDataProvider {
  async getSnapshot() {
    return { source: "simulated", updatedAt: new Date().toISOString(), nodes: structuredClone(demoNodes), readings: structuredClone(readings) };
  }
  async recordCollection(allocations) {
    for (const allocation of allocations) {
      const node = demoNodes.find(item => item.id === allocation.nodeId);
      if (!node) continue;
      node.backlogBytes = Math.max(0, node.backlogBytes - allocation.allocatedBytes);
      node.lastSeen = Date.now();
      node.status = "online";
    }
    return this.getSnapshot();
  }
  async reset() {
    location.reload();
  }
}

// Future adapter shape: return the same snapshot model from a ground-station
// endpoint. Keep transport concerns out of rendering and scheduling modules.
export class HttpDataProvider {
  constructor(endpoint) { this.endpoint = endpoint; }
  async getSnapshot() {
    const response = await fetch(this.endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Data service returned ${response.status}`);
    return response.json();
  }
}
