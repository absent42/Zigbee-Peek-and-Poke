# Zigbee Manufacturer-Specific Clusters & Codes

Quick-reference for configuring the Attribute Tool's `TARGET_CLUSTER` and `manufacturerCode` settings. Sourced from zigbee-herdsman, zigbee2mqtt converters, ZCL spec, and community reverse engineering.

Please make a PR to add any other clusters/codes.


## How Manufacturer-Specific Clusters Work

Standard ZCL clusters occupy IDs `0x0000`–`0x7FFF`. Manufacturer-specific clusters live in `0xFC00`–`0xFFFF`. Multiple manufacturers frequently reuse the same cluster ID for completely different purposes — the manufacturer code in the ZCL frame header is what disambiguates them. This is why the tool needs both `TARGET_CLUSTER` and `manufacturerCode` set correctly.

Some manufacturers also add proprietary attributes to standard clusters (e.g. Ubisys adds attributes `0x1000`+ to the standard Window Covering cluster). These still require the manufacturer code in read/write frames but use the standard cluster name.


## Manufacturer Codes

Codes used in ZCL frame headers. Extracted from zigbee-herdsman's `ManufacturerCode` enum.

### Commonly Encountered in Home Automation

| Code | Manufacturer | Notes |
|------|-------------|-------|
| `0x100B` | Signify (Philips Hue) | Formerly Philips Lighting |
| `0x1021` | Legrand | Netatmo, BTicino |
| `0x105E` | Schneider Electric | Wiser series |
| `0x110A` | Centralite | SmartThings-era sensors |
| `0x1015` | Develco | frient branded devices |
| `0x1037` | Jennic / NXP | Used by some DIY Zigbee firmware |
| `0x10F2` | Ubisys | German shutter/relay modules |
| `0x1141` | Lumi / Aqara (CN entity) | Older Xiaomi devices |
| `0x115F` | Lumi United Technology (Shenzhen) | Primary Aqara code — most Aqara devices |
| `0x117C` | IKEA of Sweden | TRÅDFRI, DIRIGERA ecosystem |
| `0x1189` | Samsung | SmartThings multi-sensors |
| `0x1233` | Sinopé Technologies | Canadian thermostats |
| `0x1246` | Danfoss | Ally TRVs |
| `0x126E` | ELKO | Norwegian switches/dimmers |
| `0x1277` | Stelpro | Thermostats |
| `0x1286` | Innr | LED bulbs/strips |
| `0x1337` | Datek / Namron | Rebranded Sunricher |
| `0x1168` | Viessman Elektro | Climate products |

### Tuya Ecosystem

| Code | Manufacturer | Notes |
|------|-------------|-------|
| `0x1002` | Ember / Silicon Labs | Default on many Tuya modules |
| `0x1141` | Tuya (varies) | Some Tuya devices report Lumi codes |

Tuya devices generally don't use a manufacturer code in the traditional sense — they funnel everything through the `manuSpecificTuya` cluster (`0xEF00`) using a proprietary datapoint protocol instead of standard ZCL attributes.

### Full Registry

The Connectivity Standards Alliance (formerly Zigbee Alliance) maintains the official manufacturer code registry. The complete list in zigbee-herdsman contains 600+ entries. The table above covers the codes you're most likely to encounter when exploring smart home devices. For the full enum, see:
`zigbee-herdsman/src/zspec/zcl/definition/manufacturerCode.ts`


## Manufacturer-Specific Clusters

Cluster names as defined in zigbee-herdsman's `cluster.ts`. These are the strings you can use for `TARGET_CLUSTER` in the Attribute Tool.

### Aqara / Lumi

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `manuSpecificLumi` | `0xFCC0` | `0x115F` | Nearly all modern Aqara devices (T1, T2, P1, H1, etc.) |

This is the primary cluster for Aqara's proprietary features: power-on behavior, LED settings, color temp limits, segment colors, effects, sensitivity, and more. Attributes are typically in the `0x0500`–`0x0535` range. The Attribute Tool's default `KNOWN_ATTRIBUTES` map covers this cluster.

Older Xiaomi/Aqara devices (pre-2020) sometimes use attributes on `genBasic` (`0x0000`) with manufacturer code `0x115F` instead of a dedicated cluster — notably attribute `0xFF01` (a packed struct with battery voltage, temperature, and other readings) and `0xFF02`.

### Tuya

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `manuSpecificTuya` | `0xEF00` | — | All Tuya MCU-based devices (TS0601) |
| `manuSpecificTuya2` | `0xE002` | — | Tuya alarm/threshold attributes |
| `manuSpecificTuya3` | `0xE001` | — | Tuya power/breaker options |
| `manuSpecificTuya4` | `0xE000` | — | Tuya device options |

Tuya's `0xEF00` cluster doesn't use standard ZCL attributes. It wraps a proprietary "datapoint" (DP) protocol: each DP has an ID, type, and payload. Standard ZCL attribute reads/writes won't work — you need Tuya-specific commands (`dataRequest`, `dataResponse`, `dataReport`). The Attribute Tool's scan/read features will not discover Tuya DPs; use Zigbee2MQTT's built-in Tuya support instead.

The `0xE000`/`0xE001`/`0xE002` clusters do use normal ZCL attributes and are scannable.

### Philips Hue / Signify

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `manuSpecificPhilips` | `0xFC00` | `0x100B` | Hue bulbs, buttons, motion sensors |
| `manuSpecificPhilips2` | `0xFC03` | `0x100B` | Hue entertainment, newer firmware |

Philips uses `0xFC00` for features like the Hue button event notification command. Note that `0xFC00` is also used by Ubisys and Assa Abloy for completely different purposes — the manufacturer code disambiguates.

### IKEA

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `manuSpecificIkeaAirPurifier` | `0xFC7D` | `0x117C` | STARKVIND air purifier |
| `manuSpecificIkeaPM25Measurement` | `0x042A` | `0x117C` | VINDSTYRKA air quality sensor |
| `manuSpecificIkeaVocMeasurement` | `0xFC7E` | `0x117C` | VINDSTYRKA VOC index |

IKEA also uses manufacturer-specific commands (not just attributes) on standard clusters — for example, custom scene commands on the Scenes cluster with manufacturer code `0x117C`.

### Ubisys

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `manuSpecificUbisysDeviceSetup` | `0xFC00` | `0x10F2` | J1, S1, S2, C4 — input configuration |

Ubisys also extends standard clusters with proprietary attributes. For example, attributes `0x1000`–`0x1007` on the standard `closuresWindowCovering` cluster (with manufacturer code `0x10F2`) control calibration parameters on the J1 shutter controller.

### Schneider Electric

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `manuSpecificSchneiderElectric` | `0xFF17` | `0x105E` | Wiser switches, dimmers, shutters |

### Legrand

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `manuSpecificLegrand` | `0xFC01` | `0x1021` | Céliane, Mosaic, Netatmo |
| `manuSpecificLegrand2` | `0xFC40` | `0x1021` | Newer Legrand devices |

### Develco / frient

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `develcoSpecificAirQuality` | `0xFC03` | `0x1015` | AQSZB-110 air quality sensor |

Develco also adds proprietary attributes to `genBasic` with code `0x1015` — for example `develcoPrimarySwVersion` and `develcoPrimaryHwVersion`.

### Centralite / SmartThings

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `manuSpecificCentraliteHumidity` | `0xFC45` | `0x110A` | Centralite 3310-S humidity sensor |
| `manuSpecificSamsungAccelerometer` | `0xFC02` | `0x1189` | SmartThings multi-sensor |

### Danfoss

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `manuSpecificDanfoss` | — | `0x1246` | Ally TRV |

Danfoss primarily extends `hvacThermostat` with manufacturer-specific attributes (e.g. `0x4000` for viewing direction, `0x4003` for external measurement) rather than using a separate cluster.

### Sinopé

| Cluster Name | ID | Mfr Code | Used By |
|-------------|-----|----------|---------|
| `manuSpecificSinope` | `0xFF01` | `0x1233` | Sinopé thermostats, load controllers |

Sinopé also extends `hvacThermostat` with attributes at IDs `0x0400`+ using code `0x1233`.

### Other Notable Clusters

| Cluster Name | ID | Mfr Code | Manufacturer | Used By |
|-------------|-----|----------|-------------|---------|
| `manuSpecificNodOnPilotWire` | `0xFC00` | — | NodOn | Pilot wire heating |
| `manuSpecificClusterAduroSmart` | `0xFCCC` | — | AduroSmart / Terncy | Knob/dial controls |
| `manuSpecificOsram` | `0xFC0F` | — | OSRAM/Ledvance | Older OSRAM lights |
| `manuSpecificAssaDoorLock` | `0xFC00` | — | Assa Abloy | Door locks |
| `manuSpecificBosch` | varies | — | Bosch | Bosch smart home |
| `manuSpecificInnr` | varies | `0x1286` | Innr | LED strips/bulbs |
| `zosungIRTransmit` | `0xED00` | — | Zosung | IR blasters (Tuya-based) |
| `heimanSpecificPM25Measurement` | `0x042A` | — | Heiman | PM2.5 sensor (same ID as IKEA, no mfr code) |


## Extended Attributes on Standard Clusters

Some manufacturers don't create new clusters at all — they add proprietary attributes to standard ZCL clusters, protected by their manufacturer code. These require setting `TARGET_CLUSTER` to the standard cluster name and `manufacturerCode` to the manufacturer's code.

| Standard Cluster | Attribute Range | Mfr Code | Manufacturer | Purpose |
|-----------------|----------------|----------|-------------|---------|
| `closuresWindowCovering` | `0x1000`–`0x1007` | `0x10F2` | Ubisys | J1 shutter calibration |
| `closuresWindowCovering` | `0xE000`–`0xE015` | `0x126E` | ELKO | Shutter drive timing |
| `hvacThermostat` | `0x4000`–`0x4012` | `0x1246` | Danfoss | Ally TRV config |
| `hvacThermostat` | `0x4000`–`0x401C` | `0x1233` | Sinopé | Thermostat config |
| `hvacThermostat` | `0x4000`–`0x4012` | `0x1168` | Viessman | TRV window detection |
| `hvacThermostat` | `0x1001`–`0x1100` | Sunricher | Namron / Sunricher | Panel heater config |
| `genLevelCtrl` | `0xE000`–`0xE002` | `0x126E` | ELKO | Dimmer config |
| `genBasic` | `0xFF01`, `0xFF02` | `0x115F` | Lumi/Aqara | Legacy packed struct |
| `genBasic` | `0xFFFE`, `0xFFDE`, `0xFFE2`, `0xFFE4` | — | Tuya | Tuya init sequence |
| `genOnOff` | `0x8001`–`0x8002` | — | Tuya | Power-on behavior, backlight |
| `genBasic` | `0x4000`–`0x4001` | `0x1015` | Develco | FW/HW version |


## Cluster ID Collision Map

Multiple manufacturers reuse the same cluster ID. This is the most common source of confusion.

| Cluster ID | Manufacturers Using It |
|-----------|----------------------|
| `0xFC00` | Philips Hue, Ubisys, Assa Abloy, NodOn |
| `0xFC03` | Philips Hue (v2), Develco |
| `0xFC01` | Legrand |
| `0x042A` | IKEA (PM2.5), Heiman (PM2.5) |
| `0xEF00` | Tuya (universal) |
| `0xFF01` | Sinopé |

When you see an unknown cluster ID on a device, check the device's manufacturer name first — it tells you which definition applies.


## Exploration Strategy by Brand

Quick-start settings for the Attribute Tool when targeting common device families.

### Aqara / Lumi
```js
const TARGET_CLUSTER = 'manuSpecificLumi';
const manufacturerCode = 0x115F;
// Scan: 0x0500–0x0535
```

### IKEA TRÅDFRI
```js
const TARGET_CLUSTER = 'manuSpecificIkeaAirPurifier'; // or the relevant IKEA cluster
const manufacturerCode = 0x117C;
// Run discover_clusters first — IKEA feature clusters vary by device
```

### Philips Hue
```js
const TARGET_CLUSTER = 'manuSpecificPhilips';
const manufacturerCode = 0x100B;
```

### Schneider Wiser
```js
const TARGET_CLUSTER = 'manuSpecificSchneiderElectric';
const manufacturerCode = 0x105E;
```

### Legrand / Netatmo
```js
const TARGET_CLUSTER = 'manuSpecificLegrand';
const manufacturerCode = 0x1021;
```

### Unknown Device
```js
// Step 1: Use discover_clusters to see what the device exposes
// Step 2: Look for cluster IDs in the 0xFC00–0xFFFF range
// Step 3: Check the manufacturer name on the device's About page
// Step 4: Look up the manufacturer code in the table above
// Step 5: Set TARGET_CLUSTER to the numeric cluster ID if no named definition exists
```


## Sources

- `zigbee-herdsman/src/zspec/zcl/definition/manufacturerCode.ts` — full manufacturer code enum
- `zigbee-herdsman/src/zcl/definition/cluster.ts` — cluster definitions with manufacturer-specific attributes
- `zigbee-herdsman-converters/src/devices/*.ts` — per-vendor device converters showing real-world usage
- Zigbee Cluster Library Specification (ZCL8, document 07-5123-08)
- Zigbee2MQTT community discussions and device support threads
