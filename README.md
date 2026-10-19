# Sky Mule field dashboard

A dependency-free browser demo for the Sky Mule environmental data-mule project. It displays example sensor readings and backlog, previews a battery- and time-aware node schedule, and lets you simulate a collection run.

## Run it

Open `index.html` in a modern browser. If the browser blocks JavaScript modules from a local file, serve this folder with any static HTTP server and open its local address. No build step or package install is needed.

## What is implemented

- Overview cards for temperature, humidity, soil moisture, and queued data.
- A five-node status table with latest readings, link quality, and backlog age.
- A selectable environmental trend chart using the most recent 12 sample points.
- Mission controls for remaining flight time, return reserve, and current battery.
- A scheduler preview with visit order, data window, estimated transfer, and partial/full backlog labels.
- A simulated sortie that drains the allocated bytes from node backlogs, so the dashboard can be demonstrated without radios or a flight controller.
- A data-provider boundary (`DemoDataProvider` / `HttpDataProvider`) to replace simulated data with a future ground-station endpoint.

## Scheduling algorithm

`planSchedule(nodes, mission)` in `src/scheduler.js` ranks reachable nodes by:

`priority × (1 + ln(1 + oldestDataHours) / 5) × linkQuality ÷ estimatedFullServiceSeconds`

For each node, estimated service time is a setup/handshake allowance plus backlog bytes divided by the configured effective radio throughput. In ranked order, the scheduler assigns the smaller of the remaining time and the node's full service estimate. If only part of the service window fits, it assigns a partial transfer. Offline nodes and empty backlogs are skipped.

The usable budget is:

`max(0, min(remainingFlightTime, remainingFlightTime × max(0, batteryPercent − 20) / batteryPercent) − returnReserve)`

The 20% battery reserve and the mapping from remaining battery to time are demo assumptions. They make the battery input affect the plan, but they are not a flight-safety guarantee. Replace this estimate with measured pod/drone current draw and flight-controller telemetry before relying on it in flight. The 800 bytes/second throughput and each node's setup seconds are also illustrative; LoRa airtime, packet size, acknowledgement/retry overhead, spreading factor and link quality need calibration. This demo doesn't model route travel time or flight geography.

### Example to inspect manually

With the sample network and default controls (12 minutes remaining, 4 minutes return reserve, 68% battery), the battery-capped contact window is about 4.5 minutes. The sample ranks South ridge first because its small backlog yields the best bytes per service second, then allocates the remaining airtime to North field. This is the intended effect of the score: older/high-priority data gains weight, while short, efficient contacts can rank well too. Move the battery slider to 20% or less: the scheduler should produce no visits. Raise the return reserve beyond the budget: no node visits should fit. Mark a future node `offline` in `src/data.js`: it should disappear from the schedule while remaining visible in the node table.

## Data contract for a real adapter

The dashboard consumes a snapshot with:

```js
{
  source: "simulated" | "live",
  updatedAt: "ISO timestamp",
  nodes: [{
    id, name, location, status, priority, linkQuality, backlogBytes,
    oldestDataHours, lastSeen, temperature, humidity, soilMoisture,
    battery, setupSeconds, sf, color
  }],
  readings: [{ nodeId, timestamp, temperature, humidity, soilMoisture }]
}
```

`HttpDataProvider` is a minimal fetch adapter scaffold; its endpoint must return this shape. A future ESP32/LoRa/microSD path can export JSON or CSV to a ground-station service which maps into this contract. The actual wire protocol, data schema, MSP telemetry mapping, and firmware readiness are not established by the available handover.

## Assumptions and hardware-dependent work

- All displayed readings, node positions, link metrics, battery values, priorities, and stored-byte counts are fabricated for demonstration.
- The technical handover says the ESP32/Ra-02 wiring, microSD path, sensor code, and power path were not reported as physically tested. No live connection is claimed.
- The presentation proposes ESP32-C3 sensor nodes, ESP32-S3 collector, 868 MHz LoRa and MSP telemetry; the handover says the available hardware is classic ESP32 DevKit and 433 MHz-class Ra-02, with the band decision and compatibility unresolved. This UI does not resolve those differences.
- Before live use, agree a node packet/data format with the firmware and ground station, verify legal radio frequency and radio settings, measure real transfer throughput and setup time per spreading factor, determine a trusted battery-to-flight-time estimate, and add route travel time and failed-contact/retry handling.
