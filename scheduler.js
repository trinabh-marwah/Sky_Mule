/**
 * Greedy, budget-aware node scheduler for Sky Mule.
 *
 * Units: seconds, bytes, and percentage points. This is a planning model, not
 * flight control. Per-node service time is estimated from a conservative
 * transfer rate and a fixed LoRa handshake/setup allowance.
 */
export function planSchedule(nodes, mission) {
  const remainingSeconds = Math.max(0, Number(mission.remainingSeconds) || 0);
  const reserveSeconds = Math.max(0, Number(mission.returnReserveSeconds) || 0);
  const safeBattery = Math.max(0, Math.min(100, Number(mission.batteryPercent) || 0) - (Number(mission.batteryReservePercent) || 0));
  // Scale the remaining-time estimate by the fraction of battery above reserve.
  // This is an explicit demo assumption; replace with flight-controller telemetry
  // or a measured current-to-time model when those inputs exist.
  const batteryBudgetSeconds = mission.batteryPercent > 0
    ? remainingSeconds * safeBattery / Number(mission.batteryPercent)
    : 0;
  const usableSeconds = Math.max(0, Math.min(remainingSeconds, batteryBudgetSeconds) - reserveSeconds);
  const radioBytesPerSecond = Math.max(1, Number(mission.radioBytesPerSecond) || 800);
  let budget = usableSeconds;
  const eligible = nodes.filter(n => n.status !== "offline" && n.backlogBytes > 0);
  const ranked = eligible.map(node => {
    const setup = Math.max(0, Number(node.setupSeconds) || 8);
    const transfer = node.backlogBytes / radioBytesPerSecond;
    const fullService = setup + transfer;
    const ageHours = Math.max(0, Number(node.oldestDataHours) || 0);
    const priority = Math.max(0, Number(node.priority) || 1);
    const signal = Math.max(0.2, Math.min(1, Number(node.linkQuality) || 0.5));
    // Older and explicitly important data rises in rank; weak links are slightly
    // discounted because they need more airtime per successfully recovered byte.
    const score = (priority * (1 + Math.log1p(ageHours) / 5) * signal) / Math.max(1, fullService);
    return { node, setup, transfer, fullService, score };
  }).sort((a, b) => b.score - a.score || b.node.backlogBytes - a.node.backlogBytes);

  const allocations = [];
  for (const item of ranked) {
    if (budget <= 0) break;
    if (budget <= item.setup) continue;
    const serviceSeconds = Math.min(item.fullService, budget);
    const transferSeconds = Math.max(0, serviceSeconds - item.setup);
    const bytes = Math.min(item.node.backlogBytes, Math.floor(transferSeconds * radioBytesPerSecond));
    if (bytes <= 0) continue;
    allocations.push({
      nodeId: item.node.id,
      nodeName: item.node.name,
      serviceSeconds: Math.round(serviceSeconds),
      setupSeconds: item.setup,
      allocatedBytes: bytes,
      backlogBytes: item.node.backlogBytes,
      fullCollection: bytes >= item.node.backlogBytes,
      priorityScore: Number(item.score.toFixed(3)),
      reason: item.node.status === "alert" ? "Alert node" : item.node.oldestDataHours >= 24 ? "Oldest data first" : "Best data return per second"
    });
    budget -= serviceSeconds;
  }
  const allocatedSeconds = allocations.reduce((sum, a) => sum + a.serviceSeconds, 0);
  return {
    allocations,
    remainingSeconds,
    batteryBudgetSeconds,
    reserveSeconds,
    usableSeconds,
    allocatedSeconds,
    unusedUsableSeconds: Math.max(0, usableSeconds - allocatedSeconds),
    estimatedBytes: allocations.reduce((sum, a) => sum + a.allocatedBytes, 0),
    safeBatteryPercent: safeBattery,
    feasible: remainingSeconds > reserveSeconds && safeBattery > 0,
    note: remainingSeconds <= reserveSeconds
      ? "The return reserve uses all remaining flight time. No node visits are scheduled."
      : safeBattery <= 0
        ? "Battery reserve has been reached. No node visits are scheduled."
        : "Schedule is an estimate. Actual airtime depends on link quality, retries, and the node protocol."
  };
}

export function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} kB`;
  return `${bytes} B`;
}
