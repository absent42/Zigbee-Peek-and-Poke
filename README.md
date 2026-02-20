# Zigbee Peek and Poke (ZPP) v4

A Zigbee2MQTT external converter tool for reading, writing, scanning, and exploring manufacturer-specific cluster attributes on any Zigbee device. Originally built to poke around Aqara/Lumi devices, now configurable for any manufacturer.


## Installation

 1. Edit the TARGET_ZIGBEE_MODEL, TARGET_CLUSTER, manufacturerCode constants, DEVICE_DEFINITION, and import statements below to match your device and cluster
 2. In Z2M go to Settings-Dev Console-External Converters
 3. Create a new converter and name it (e.g.) "zpp.mjs"
 4. Paste this code into the editor
5. Save
6. Restart Zigbee2MQTT
7. Device appears as the model name defined below


## Configuration

All settings live at the top of the file. Edit these before starting Z2M.

### `TARGET_ZIGBEE_MODEL`

The Zigbee model string your device reports. Find this on the device's "About" page in the Z2M frontend.

```js
const TARGET_ZIGBEE_MODEL = 'lumi.plug.aeu002';
```

### `TARGET_CLUSTER`

The Z2M cluster name to target for all reads and writes. For Aqara devices this is `manuSpecificLumi`. For other manufacturers, check the Zigbee Cluster Library or your device's cluster list (see the Cluster Discovery feature below).

```js
const TARGET_CLUSTER = 'manuSpecificLumi';
```

### `manufacturerCode`

The 16-bit manufacturer code included in read/write frames. `0x115F` is Aqara/Lumi. Common codes include `0x1021` (Legrand), `0x1037` (Schneider), `0x100B` (Philips), `0x117C` (Ikea). The Zigbee Alliance maintains the full registry.

```js
const manufacturerCode = 0x115f;
```

### `AUTO_SCAN_ATTRIBUTES`

An array of hex-string attribute IDs to automatically read every time Z2M starts. Leave empty to disable.

```js
const AUTO_SCAN_ATTRIBUTES = ['0515', '0516', '0517'];
```

### `AUTO_SCAN_ENDPOINT`

Which endpoint the auto-scan reads from.

```js
const AUTO_SCAN_ENDPOINT = 1;
```

### `WRITE_HISTORY_MAX`

How many entries the rolling write log keeps before discarding the oldest.

```js
const WRITE_HISTORY_MAX = 20;
```

### `KNOWN_ATTRIBUTES`

A lookup table mapping attribute IDs (4-digit hex keys) to human-readable names. These labels appear in all read/scan/snapshot output and populate the `select_attribute` dropdown in the frontend. You can gut this and start fresh for a non-Aqara device, or leave it empty:

```js
const KNOWN_ATTRIBUTES = {};
```

### Z2M Library Imports

At the very top of the file (before global settings) is a commented-out imports section. Uncomment or add any imports your device's existing Z2M definition needs. These are standard `import` statements — the same ones you'd find at the top of any converter file in `zigbee-herdsman-converters/src/devices/`.

```js
import * as m from 'zigbee-herdsman-converters/lib/modernExtend';
import fz from 'zigbee-herdsman-converters/converters/fromZigbee';
import tz from 'zigbee-herdsman-converters/converters/toZigbee';
import * as reporting from 'zigbee-herdsman-converters/lib/reporting';
import * as lumi from 'zigbee-herdsman-converters/lib/lumi';
```

Only add the imports that the definition you're pasting actually uses. Leaving unused imports is harmless but unnecessary.

### `DEVICE_DEFINITION`

This object lets you paste pieces from your device's existing Z2M converter so the tool retains full device functionality (on/off, power reporting, etc.) alongside the exploration controls. Located after `KNOWN_ATTRIBUTES` and before the helpers section.

Supported fields — all optional:

| Field | Type | Merge Behavior |
|-------|------|---------------|
| `extend` | Array | Passed to Z2M as-is (modern extend system) |
| `fromZigbee` | Array | Device converters run before the tool's report listener |
| `toZigbee` | Array | Device converters listed before the tool's controls |
| `exposes` | Array | Device exposes appear above the tool's controls in the UI |
| `configure` | Function | Runs before the tool's auto-scan handler |
| `onEvent` | Function | Runs before the tool's auto-scan handler |
| `meta` | Object | Shallow-merged (device meta wins on conflicts) |

Example using modern extends (recommended for most current devices):

```js
import * as m from 'zigbee-herdsman-converters/lib/modernExtend';
import * as lumi from 'zigbee-herdsman-converters/lib/lumi';

const DEVICE_DEFINITION = {
    extend: [
        m.onOff(),
        m.electricityMeter(),
        lumi.lumiModernExtend.lumiPowerOnBehavior(),
    ],
};
```

Example using legacy-style fromZigbee/toZigbee arrays:

```js
import fz from 'zigbee-herdsman-converters/converters/fromZigbee';
import tz from 'zigbee-herdsman-converters/converters/toZigbee';
import * as e from 'zigbee-herdsman-converters/lib/exposes';
import * as reporting from 'zigbee-herdsman-converters/lib/reporting';

const DEVICE_DEFINITION = {
    fromZigbee: [fz.on_off, fz.electrical_measurement, fz.metering],
    toZigbee: [tz.on_off],
    exposes: [e.presets.switch(), e.presets.power(), e.presets.energy()],
    configure: async (device, coordinatorEndpoint, logger) => {
        const ep = device.getEndpoint(1);
        await reporting.bind(ep, coordinatorEndpoint, ['genOnOff', 'haElectricalMeasurement']);
        await reporting.onOff(ep);
    },
};
```

To find your device's existing definition, search for its Zigbee model string in `zigbee-herdsman-converters/src/devices/`. Copy the relevant fields into `DEVICE_DEFINITION` and add the corresponding imports to the imports section at the top.


## Features

All features are accessed through the Z2M device page. Fields marked **(set)** accept input; fields marked **(read)** are output-only.

---

### Endpoint Selection

**Field:** `endpoint` (set)

Selects which device endpoint subsequent commands target. Defaults to 1. Devices like the Aqara T1M have a second endpoint for the RGB ring.

| Value | Use |
|-------|-----|
| `1` | Main/default endpoint |
| `2` | Secondary (e.g. T1M ring) |
| Any positive integer | Any valid endpoint on the device |

---

### Read Single Attribute

**Fields:** `select_attribute` (set), `read_attribute` (set), `attribute_value` (read), `attribute_status` (read)

Two ways to read:

- **`select_attribute`** — dropdown of everything in `KNOWN_ATTRIBUTES`. Pick one and the read fires immediately.
- **`read_attribute`** — free-text hex input for any attribute ID (e.g. `051a`, `0x0515`).

The result appears in `attribute_value` with a status line in `attribute_status`. If the device returns `UNSUPPORTED_ATTRIBUTE`, the status shows "Not supported".

---

### Batch Read

**Fields:** `read_list` (set), `read_list_result` (read)

Read multiple specific attributes in one operation. Provide a comma-separated list of hex IDs:

```
0515,0516,0517,0522,0530
```

Up to 64 attributes per call. Results are listed one per line in `read_list_result` with a summary count of found/errors.

This is useful when you already know which attributes matter and don't want to scan an entire range.

---

### Write Single Attribute

**Fields:** `write_attribute` (set), `write_result` (read)

Three formats:

| Format | Example | Behavior |
|--------|---------|----------|
| `ATTR:VALUE` | `0515:0a` | Auto-detect type from byte length (1B→uint8, 2B→uint16, 4B→uint32, else→buffer) |
| `ATTR:TYPE:VALUE` | `0524:uint16:0014` | Explicit type override |
| `ATTR:TYPE:VALUE` | `0527:buf:0101030bff` | Force raw buffer |

Supported types: `uint8`, `uint16`, `uint32`, `int8`, `int16`, `int32`, `buf`, `str`.

After every write, the tool automatically reads the attribute back and includes the result in `write_result`. If the read-back fails (write-only attribute), it notes that too. Every write is appended to the write history log.

---

### Bulk Write

**Fields:** `bulk_write` (set), `bulk_write_result` (read)

Write multiple attributes in one go using the same format as single writes, comma-separated:

```
0515:0a,0516:ff,0517:uint8:01
```

Up to 32 writes per call. Each write gets its own read-back. Results are listed individually in `bulk_write_result` with a summary. All writes are appended to the write history.

---

### Range Scan

**Fields:** `scan_range` (set), `scan_result` (read)

Sweep a contiguous range of attribute IDs:

```
0515-0530
```

Reads every ID from start to end inclusive. Max range is 128 attributes. There's a 50ms pause between each read to avoid flooding the Zigbee network. Results show each attribute's value (or error/unsupported status) and a summary of found/errors/empty.

Good starting strategy for an unknown device: scan `0000-007F`, then `0100-017F`, and so on in chunks.

---

### Snapshot and Compare

**Field:** `snapshot` (set), `snapshot_result` (read), `snapshot_export` (read)

A workflow for detecting what changes when you interact with a device through its physical controls or other Zigbee commands.

#### Take a Snapshot

```
snapshot:0515-0530
```

Reads the range and stores all values in Z2M state. `snapshot_result` shows what was captured.

#### Compare

```
compare
```

Re-reads the same range on the same endpoint and diffs against the stored snapshot. Changed attributes are shown with their old and new values. Unchanged attributes are counted but not listed.

Typical workflow: snapshot, change something on the device (via its app, physical button, etc.), then compare to see which attributes moved.

#### Export

```
export
```

Serializes the current snapshot to a JSON string in `snapshot_export`. Copy this value to save it externally — snapshots normally vanish on Z2M restart.

The JSON includes the cluster name, manufacturer code, endpoint, timestamp, attribute range, and all captured values.

#### Import

```
import:{"cluster":"manuSpecificLumi","manufacturerCode":4447,...}
```

Paste a previously exported JSON string (prefixed with `import:`) to restore a snapshot. You can then run `compare` against it.

#### Clear

```
clear
```

Discards the stored snapshot.

---

### Cluster Discovery

**Fields:** `discover_clusters` (set), `cluster_list` (read)

Lists the input and output clusters registered on each endpoint of the device. Useful for figuring out which cluster name to set in `TARGET_CLUSTER` before you start reading attributes.

| Value | Behavior |
|-------|----------|
| `all` | List clusters on every endpoint |
| `1` | List clusters on endpoint 1 only |
| `2` | List clusters on endpoint 2 only |

Output includes cluster names (when available from Z2M's cluster definitions) and numeric IDs.

---

### Raw Hex Display

**Field:** `raw_hex` (set, toggle)

When **OFF** (default), values display in a friendly format with decimal, hex, and byte breakdown:

```
1300 (0x514, bytes: [0x05, 0x14])
```

When **ON**, values display as raw hex only:

```
0514
```

Affects all output: reads, scans, snapshots, write read-backs, and bulk operations. Useful when you're working at the byte level and the friendly formatting is noise.

---

### Report Listener

**Fields:** `last_report` (read), `report_log_display` (read), `clear_report_log` (set)

Passively captures unsolicited attribute reports and read responses that the device sends on the target cluster. This is how you discover which attributes the device pushes on its own — for example, when you toggle a switch, change a color, or adjust a setting through the manufacturer's app.

Reports are timestamped and kept in a rolling log of the last 50 entries. `last_report` shows the most recent one. The full log is visible in `report_log_display`.

Send any value to `clear_report_log` to reset.

The listener only captures reports on the cluster defined in `TARGET_CLUSTER`. Reports on other clusters are not intercepted.

---

### Write History

**Fields:** `write_history_log` (read), `clear_write_history` (set)

Every write (single or bulk) is timestamped and appended to a rolling log. The log holds up to `WRITE_HISTORY_MAX` entries (default 20). This gives you a quick reference of what you've tried without scrolling through Z2M's system log.

Send any value to `clear_write_history` to reset.

---


## MQTT API

All fields are accessible via MQTT publish/subscribe if you prefer scripting over the Z2M frontend.

To set a value, publish to `zigbee2mqtt/<device>/set` with a JSON payload:

```json
{"read_attribute": "0515"}
{"write_attribute": "0515:uint8:0a"}
{"scan_range": "0500-0535"}
{"read_list": "0515,0516,0517"}
{"bulk_write": "0515:0a,0516:ff"}
{"snapshot": "snapshot:0515-0530"}
{"snapshot": "compare"}
{"snapshot": "export"}
{"discover_clusters": "all"}
{"endpoint": 2}
{"raw_hex": true}
```

Results appear in the device's state, published to `zigbee2mqtt/<device>`:

```json
{
  "attribute_value": "10 (0xA)",
  "attribute_status": "✓ EP1 0x0515 (Min Brightness)",
  "scan_result": "EP1 scan 0x0500-0x0535: 12 found ...",
  "write_result": "✓ EP1 Wrote uint8 to 0x0515 → read-back: 10 (0xA)",
  "cluster_list": "EP1:\n  Input clusters (5): ..."
}
```

This means you can script exploration workflows with any MQTT client, Home Assistant automations, or shell scripts using `mosquitto_pub`/`mosquitto_sub`.


## Tips

**Start with cluster discovery.** Before scanning attributes, send `discover_clusters: all` to see what's on the device. Look for manufacturer-specific clusters (usually high cluster IDs like `0xFCC0`, `0xFF01`, etc.) and set `TARGET_CLUSTER` accordingly.

**Scan in chunks.** Don't try `0000-FFFF`. Start with ranges you think are likely (often `0x0000-0x00FF` or `0x0500-0x0600` for Aqara) and narrow from there.

**Use snapshot/compare to reverse engineer.** Take a snapshot, change one thing on the device, compare. Repeat. This is the fastest way to map attributes to functions.

**Export snapshots for different device states.** Take a snapshot with a device in "state A", export it, change to "state B", take another snapshot and export. You now have two baselines you can import and compare against at any time.

**Watch the report log while using physical controls.** The report listener catches attributes the device pushes on its own. Press buttons, toggle switches, or change settings on the device itself, and watch `last_report` update — those are the attributes you want to investigate.

**Raw hex mode for binary protocols.** Some attributes encode structured data in buffers (segment colors, effect definitions, etc.). Raw hex mode strips the friendly formatting so you can focus on the byte patterns.
