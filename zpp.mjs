/**
 * Zigbee Peek and Poke (ZPP) v4.0
 *
 * Tool to read, write, scan, and compare manufacturer-specific cluster attributes
 * on any Zigbee device. Configure the target device model, cluster, and manufacturer
 * code in the settings below.
 *
 * Features:
 *   - Read/write individual attributes
 *   - Batch read from a comma-separated list
 *   - Bulk write multiple attributes in one go
 *   - Endpoint selection (any valid endpoint on the device)
 *   - Range scan (e.g. "0515-0530") to sweep unknown attributes
 *   - Write with type override (e.g. "0524:uint16:0014")
 *   - Automatic read-back after write to confirm
 *   - Snapshot/compare to detect attribute changes
 *   - Export/import snapshots as JSON for persistence
 *   - Auto-scan configurable attributes on startup
 *   - Passive report listener for unsolicited attribute reports
 *   - Raw hex display toggle
 *   - Cluster discovery (list clusters on each endpoint)
 *   - Rolling write history log
 *   - Merge with existing device definition (keep normal device functionality)
 *
 * Installation:
 *   1. Edit the TARGET_ZIGBEE_MODEL, TARGET_CLUSTER, manufacturerCode constants,
 *      DEVICE_DEFINITION, and import statements below to match your device and cluster
 *   2. In Z2M go to Settings-Dev Console-External Converters
 *   3. Create a new converter and name it (e.g.) "zpp.mjs"
 *   4. Paste this code into the editor
 *   5. Save
 *   6. Restart Zigbee2MQTT
 *   7. Device appears as the model name defined below
 */

// ============================================================================
// Z2M LIBRARY IMPORTS — paste any imports your device definition needs here
// ============================================================================
// Uncomment or add imports required by the definition you paste into
// DEVICE_DEFINITION below. Common examples:
//
// import * as m from 'zigbee-herdsman-converters/lib/modernExtend';
// import fz from 'zigbee-herdsman-converters/converters/fromZigbee';
// import tz from 'zigbee-herdsman-converters/converters/toZigbee';
// import * as reporting from 'zigbee-herdsman-converters/lib/reporting';
// import * as e from 'zigbee-herdsman-converters/lib/exposes';
// import {Zcl} from 'zigbee-herdsman';
//
// Vendor-specific:
// import * as lumi from 'zigbee-herdsman-converters/lib/lumi';
// import * as tuya from 'zigbee-herdsman-converters/lib/tuya';
// import * as ikea from 'zigbee-herdsman-converters/lib/ikea';
// import * as legrand from 'zigbee-herdsman-converters/lib/legrand';

// ============================================================================
// GLOBAL SETTINGS — edit these to target your device and cluster
// ============================================================================

// The Zigbee model string your device reports (visible in Z2M device info)
const TARGET_ZIGBEE_MODEL = 'lumi.light.acn032';

// The Z2M cluster name to read/write attributes on
const TARGET_CLUSTER = 'manuSpecificLumi';

// Manufacturer code sent with read/write commands (0x115F = Aqara/Lumi)
const manufacturerCode = 0x115f;

// Auto-scan: list of attribute IDs (hex strings) to read on device startup.
// Leave empty [] to disable. Example: ['0515', '0516', '0517']
const AUTO_SCAN_ATTRIBUTES = [];

// Auto-scan: endpoint to use for startup reads (default 1)
const AUTO_SCAN_ENDPOINT = 1;

// Write history: how many entries to keep in the rolling log
const WRITE_HISTORY_MAX = 20;

// Known attributes (customize for your device, or leave empty for pure exploration)
const KNOWN_ATTRIBUTES = {
    '0500': 'Unknown',
    '0501': 'Unknown', 
    '0502': 'Unknown',
    '0503': 'Unknown',
    '0504': 'Unknown',
};

// ============================================================================
// DEVICE DEFINITION — paste your device's existing Z2M definition pieces here
// ============================================================================
// Copy fields from your device's existing Z2M converter definition or the one
// generated in a new device's Z2M Dev console to keep its normal
// functionality alongside the exploration tool. Arrays (extend, fromZigbee,
// toZigbee, exposes) are merged with the tool's own converters. configure 
// and onEvent functions are chained (device definition runs first, then 
// the tool's). meta objects are shallow-merged.
//
// Example — an Aqara plug with power reporting:
//
//   import * as lumi from 'zigbee-herdsman-converters/lib/lumi';
//   import * as m from 'zigbee-herdsman-converters/lib/modernExtend';
//   ...
//   const DEVICE_DEFINITION = {
//       extend: [
//           m.onOff(),
//           m.electricityMeter(),
//           lumi.lumiModernExtend.lumiPowerOnBehavior(),
//       ],
//   };
//
// Or pasting raw fromZigbee/toZigbee/exposes arrays from an older-style def:
//
//   const DEVICE_DEFINITION = {
//       fromZigbee: [fz.on_off, fz.electrical_measurement, fz.metering],
//       toZigbee: [tz.on_off],
//       exposes: [e.presets.switch(), e.presets.power(), e.presets.energy()],
//       configure: async (device, coordinatorEndpoint, logger) => {
//           const ep = device.getEndpoint(1);
//           await reporting.bind(ep, coordinatorEndpoint, ['genOnOff', 'haElectricalMeasurement']);
//       },
//   };
//
const DEVICE_DEFINITION = {
    // extend: [],
    // fromZigbee: [],
    // toZigbee: [],
    // exposes: [],
    // configure: async (device, coordinatorEndpoint, logger) => {},
    // meta: {},
    // onEvent: async (type, data, device) => {},
};

// ============================================================================
// HELPERS
// ============================================================================

function formatValue(value, rawHex) {
    if (rawHex) {
        if (typeof value === 'number') {
            if (!Number.isInteger(value)) return `${value}`;
            // Show as zero-padded hex, width based on magnitude
            const nibbles = Math.max(2, Math.ceil(value.toString(16).length / 2) * 2);
            return value.toString(16).toUpperCase().padStart(nibbles, '0');
        }
        if (Buffer.isBuffer(value)) {
            return value.toString('hex').toUpperCase();
        }
        if (Array.isArray(value)) {
            return value.map((v) => (typeof v === 'number' ? v.toString(16).toUpperCase().padStart(2, '0') : String(v))).join(' ');
        }
        return JSON.stringify(value);
    }

    if (typeof value === 'number') {
        if (!Number.isInteger(value)) return `${value}`;
        const hex = `0x${value.toString(16).toUpperCase()}`;
        if (value >= 256) {
            const bytes = [];
            let temp = value;
            while (temp > 0) {
                bytes.unshift(temp & 0xff);
                temp = temp >>> 8;
            }
            const byteStr = bytes.map((b) => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`).join(', ');
            return `${value} (${hex}, bytes: [${byteStr}])`;
        }
        return `${value} (${hex})`;
    }
    if (Buffer.isBuffer(value)) {
        return `Buffer[${value.length}]: ${value.toString('hex').toUpperCase()}`;
    }
    if (Array.isArray(value)) {
        return `Array[${value.length}]: ${JSON.stringify(value)}`;
    }
    return JSON.stringify(value);
}

function parseAttrHex(str) {
    const clean = str.replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase();
    if (!/^[0-9a-f]{1,4}$/.test(clean)) {
        return null;
    }
    return Number.parseInt(clean, 16);
}

function attrHexStr(id) {
    return `0x${id.toString(16).toUpperCase().padStart(4, '0')}`;
}

function attrLabel(id) {
    const key = id.toString(16).toLowerCase().padStart(4, '0');
    const name = KNOWN_ATTRIBUTES[key] || 'Unknown';
    return `${attrHexStr(id)} (${name})`;
}

function getEndpoint(entity, epNum) {
    if (entity.getEndpoint) {
        const ep = entity.getEndpoint(epNum);
        if (!ep) {
            throw new Error(`Endpoint ${epNum} not found on device`);
        }
        return ep;
    }
    return entity;
}

function getRawHexSetting(meta) {
    return !!(meta.state && meta.state.raw_hex);
}

function getWriteHistory(meta) {
    return (meta.state && meta.state.write_history) || [];
}

function appendWriteHistory(meta, entry) {
    const history = getWriteHistory(meta);
    history.push(entry);
    while (history.length > WRITE_HISTORY_MAX) {
        history.shift();
    }
    return history;
}

const DATA_TYPES = {
    uint8: 0x20,
    uint16: 0x21,
    uint32: 0x23,
    int8: 0x28,
    int16: 0x29,
    int32: 0x2b,
    buf: 0x41,
    str: 0x42,
};

function inferTypeAndValue(hexStr) {
    const byteLen = hexStr.length / 2;
    if (byteLen === 1) return {type: 0x20, value: Number.parseInt(hexStr, 16)};
    if (byteLen === 2) return {type: 0x21, value: Number.parseInt(hexStr, 16)};
    if (byteLen === 4) return {type: 0x23, value: Number.parseInt(hexStr, 16)};
    return {type: 0x41, value: Buffer.from(hexStr, 'hex')};
}

function parseTypedValue(typeStr, hexStr) {
    const typeCode = DATA_TYPES[typeStr.toLowerCase()];
    if (typeCode === undefined) {
        throw new Error(`Unknown type "${typeStr}". Valid: ${Object.keys(DATA_TYPES).join(', ')}`);
    }
    if (typeCode === 0x41) return {type: typeCode, value: Buffer.from(hexStr, 'hex')};
    if (typeCode === 0x42) return {type: typeCode, value: hexStr};
    return {type: typeCode, value: Number.parseInt(hexStr, 16)};
}

async function readOneAttr(endpoint, attrId) {
    const result = await endpoint.read(TARGET_CLUSTER, [attrId], {manufacturerCode});
    if (result && result[attrId] !== undefined) {
        return {ok: true, value: result[attrId]};
    }
    return {ok: false, error: 'No data returned'};
}

function parseWriteSpec(spec) {
    const parts = spec.split(':');
    if (parts.length < 2 || parts.length > 3) {
        throw new Error('Format: "ATTR:VALUE" or "ATTR:TYPE:VALUE"');
    }

    const attrId = parseAttrHex(parts[0]);
    if (attrId === null) {
        throw new Error(`Invalid attribute: "${parts[0]}"`);
    }

    let hexStr;
    let typeInfo;

    if (parts.length === 3) {
        hexStr = parts[2].trim().replace(/^0x/i, '').replace(/[\s:]/g, '');
        typeInfo = parseTypedValue(parts[1].trim(), hexStr);
    } else {
        hexStr = parts[1].trim().replace(/^0x/i, '').replace(/[\s:]/g, '');
        typeInfo = inferTypeAndValue(hexStr);
    }

    if (!/^[0-9a-f]*$/i.test(hexStr)) {
        throw new Error(`Invalid hex value: "${hexStr}"`);
    }

    return {attrId, hexStr, typeInfo};
}

function timestamp() {
    return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

// ============================================================================
// DEFINITION
// ============================================================================

const definition = {
    zigbeeModel: [TARGET_ZIGBEE_MODEL],
    model: 'ATTR-TOOL',
    vendor: 'Custom',
    description: 'Manufacturer-Specific Attribute Reader/Writer v4 (scan, compare, batch, bulk, discover)',

    // =================================================================
    // FROM ZIGBEE — passive report listener
    // =================================================================
    fromZigbee: [
        {
            cluster: TARGET_CLUSTER,
            type: ['attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                const epNum = msg.endpoint && msg.endpoint.ID ? msg.endpoint.ID : '?';
                const entries = [];

                for (const [attrId, value] of Object.entries(msg.data)) {
                    const id = Number(attrId);
                    const label = attrLabel(id);
                    const formatted = formatValue(value, false);
                    entries.push(`EP${epNum} ${label} = ${formatted}`);
                    console.log(`[ATTR-TOOL] 📡 Report: EP${epNum} ${label} = ${formatted}`);
                }

                if (entries.length === 0) return;

                // Build rolling report log
                const existing = (meta.state && meta.state.report_log) || [];
                const now = timestamp();
                for (const entry of entries) {
                    existing.push(`[${now}] ${entry}`);
                }
                // Keep last 50 report entries
                while (existing.length > 50) {
                    existing.shift();
                }

                return {
                    last_report: entries.join('\n'),
                    report_log: existing,
                    report_log_display: existing.join('\n'),
                };
            },
        },
    ],

    // =================================================================
    // ON EVENT — auto-scan on startup
    // =================================================================
    onEvent: async (type, data, device) => {
        if (type !== 'start' || AUTO_SCAN_ATTRIBUTES.length === 0) return;

        console.log(`[ATTR-TOOL] Auto-scan: reading ${AUTO_SCAN_ATTRIBUTES.length} attributes on EP${AUTO_SCAN_ENDPOINT}...`);

        try {
            const endpoint = device.getEndpoint(AUTO_SCAN_ENDPOINT);
            if (!endpoint) {
                console.error(`[ATTR-TOOL] Auto-scan: EP${AUTO_SCAN_ENDPOINT} not found`);
                return;
            }

            const results = [];
            for (const hexStr of AUTO_SCAN_ATTRIBUTES) {
                const attrId = parseAttrHex(hexStr);
                if (attrId === null) {
                    console.error(`[ATTR-TOOL] Auto-scan: invalid attr "${hexStr}"`);
                    continue;
                }
                try {
                    const result = await readOneAttr(endpoint, attrId);
                    if (result.ok) {
                        const label = attrLabel(attrId);
                        const formatted = formatValue(result.value, false);
                        results.push(`${label} = ${formatted}`);
                        console.log(`[ATTR-TOOL] Auto-scan: ✓ ${label} = ${formatted}`);
                    }
                } catch (error) {
                    console.error(`[ATTR-TOOL] Auto-scan: ✗ ${attrHexStr(attrId)}: ${error.message}`);
                }
                await new Promise((resolve) => setTimeout(resolve, 50));
            }

            if (results.length > 0) {
                console.log(`[ATTR-TOOL] Auto-scan complete: ${results.length}/${AUTO_SCAN_ATTRIBUTES.length} read`);
            }
        } catch (error) {
            console.error(`[ATTR-TOOL] Auto-scan error: ${error.message}`);
        }
    },

    toZigbee: [
        // =================================================================
        // ENDPOINT SELECTOR
        // =================================================================
        {
            key: ['endpoint'],
            convertSet: async (entity, key, value, meta) => {
                const ep = Number(value);
                if (ep < 1 || !Number.isInteger(ep)) {
                    throw new Error('Endpoint must be a positive integer');
                }
                console.log(`[ATTR-TOOL] Endpoint set to ${ep}`);
                return {state: {endpoint: ep}};
            },
        },

        // =================================================================
        // RAW HEX TOGGLE
        // =================================================================
        {
            key: ['raw_hex'],
            convertSet: async (entity, key, value, meta) => {
                const enabled = value === true || value === 'true' || value === 'ON' || value === 1;
                console.log(`[ATTR-TOOL] Raw hex display: ${enabled ? 'ON' : 'OFF'}`);
                return {state: {raw_hex: enabled}};
            },
        },

        // =================================================================
        // READ SINGLE ATTRIBUTE
        // =================================================================
        {
            key: ['read_attribute', 'select_attribute'],
            convertSet: async (entity, key, value, meta) => {
                const input = key === 'select_attribute' ? value : value.toString().trim();
                const attrId = parseAttrHex(input);
                const rawHex = getRawHexSetting(meta);

                if (attrId === null) {
                    return {state: {attribute_value: 'ERROR', attribute_status: `Invalid hex: "${value}"`}};
                }

                const epNum = (meta.state && meta.state.endpoint) || 1;
                const label = attrLabel(attrId);
                console.log(`[ATTR-TOOL] Reading ${label} on EP${epNum}`);

                try {
                    const endpoint = getEndpoint(entity, epNum);
                    const result = await readOneAttr(endpoint, attrId);

                    if (result.ok) {
                        const formatted = formatValue(result.value, rawHex);
                        console.log(`[ATTR-TOOL] ✓ ${label} = ${formatted}`);
                        return {
                            state: {
                                read_attribute: attrHexStr(attrId),
                                select_attribute: attrId.toString(16).toLowerCase().padStart(4, '0'),
                                attribute_value: formatted,
                                attribute_status: `✓ EP${epNum} ${label}`,
                            },
                        };
                    }
                    return {state: {attribute_value: 'No data', attribute_status: `${label}: No data on EP${epNum}`}};
                } catch (error) {
                    const msg = error.message.includes('UNSUPPORTED_ATTRIBUTE') ? 'Not supported' : error.message;
                    console.error(`[ATTR-TOOL] ✗ ${label}: ${msg}`);
                    return {state: {attribute_value: 'ERROR', attribute_status: `✗ EP${epNum} ${label}: ${msg}`}};
                }
            },
        },

        // =================================================================
        // BATCH READ — comma-separated list of attribute IDs
        //
        // Format: "0515,0516,0517,0522"
        // =================================================================
        {
            key: ['read_list'],
            convertSet: async (entity, key, value, meta) => {
                const ids = value.toString().split(',').map((s) => s.trim()).filter(Boolean);
                if (ids.length === 0) {
                    throw new Error('Provide comma-separated hex IDs, e.g. "0515,0516,0517"');
                }
                if (ids.length > 64) {
                    throw new Error(`Too many attributes (${ids.length}). Max 64.`);
                }

                const epNum = (meta.state && meta.state.endpoint) || 1;
                const endpoint = getEndpoint(entity, epNum);
                const rawHex = getRawHexSetting(meta);

                console.log(`[ATTR-TOOL] Batch reading ${ids.length} attributes on EP${epNum}...`);

                const results = [];
                let found = 0;
                let errors = 0;

                for (const idStr of ids) {
                    const attrId = parseAttrHex(idStr);
                    if (attrId === null) {
                        results.push(`"${idStr}": invalid hex`);
                        errors++;
                        continue;
                    }
                    const label = attrLabel(attrId);
                    try {
                        const result = await readOneAttr(endpoint, attrId);
                        if (result.ok) {
                            const formatted = formatValue(result.value, rawHex);
                            results.push(`${label} = ${formatted}`);
                            console.log(`[ATTR-TOOL] ✓ ${label} = ${formatted}`);
                            found++;
                        } else {
                            results.push(`${label}: No data`);
                        }
                    } catch (error) {
                        const msg = error.message.includes('UNSUPPORTED_ATTRIBUTE') ? 'unsupported' : error.message;
                        results.push(`${label}: ${msg}`);
                        errors++;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }

                const summary = `EP${epNum} batch: ${found} found, ${errors} errors out of ${ids.length}`;
                console.log(`[ATTR-TOOL] ${summary}`);

                return {
                    state: {
                        read_list: value,
                        read_list_result: `${summary}\n\n${results.join('\n')}`,
                    },
                };
            },
        },

        // =================================================================
        // WRITE ATTRIBUTE (with optional type override + auto read-back)
        //
        // Formats:
        //   "0524:0c"              - auto-detect type from length
        //   "0524:uint16:0014"     - explicit type override
        //   "0527:buf:0101030bff"  - force buffer type
        // =================================================================
        {
            key: ['write_attribute'],
            convertSet: async (entity, key, value, meta) => {
                const {attrId, hexStr, typeInfo} = parseWriteSpec(value);

                const epNum = (meta.state && meta.state.endpoint) || 1;
                const rawHex = getRawHexSetting(meta);
                const label = attrLabel(attrId);
                const typeNames = Object.entries(DATA_TYPES);
                const typeName = typeNames.find(([, v]) => v === typeInfo.type)?.[0] || `0x${typeInfo.type.toString(16)}`;

                console.log(`[ATTR-TOOL] Writing ${label} on EP${epNum}: ${hexStr} as ${typeName}`);

                try {
                    const endpoint = getEndpoint(entity, epNum);

                    await endpoint.write(
                        TARGET_CLUSTER,
                        {[attrId]: {value: typeInfo.value, type: typeInfo.type}},
                        {manufacturerCode, disableDefaultResponse: false},
                    );

                    // Auto read-back
                    let readBack = '';
                    try {
                        const rb = await readOneAttr(endpoint, attrId);
                        if (rb.ok) {
                            readBack = ` → read-back: ${formatValue(rb.value, rawHex)}`;
                        }
                    } catch {
                        readBack = ' → read-back failed (write-only?)';
                    }

                    const resultMsg = `✓ EP${epNum} Wrote ${typeName} to ${label}${readBack}`;
                    console.log(`[ATTR-TOOL] ${resultMsg}`);

                    const history = appendWriteHistory(meta, `[${timestamp()}] ${resultMsg}`);
                    return {state: {write_attribute: value, write_result: resultMsg, write_history: history, write_history_log: history.join('\n')}};
                } catch (error) {
                    const errorMsg = `✗ EP${epNum} ${label}: ${error.message}`;
                    console.error(`[ATTR-TOOL] ${errorMsg}`);

                    const history = appendWriteHistory(meta, `[${timestamp()}] ${errorMsg}`);
                    return {state: {write_attribute: value, write_result: errorMsg, write_history: history, write_history_log: history.join('\n')}};
                }
            },
        },

        // =================================================================
        // BULK WRITE — multiple writes in one go
        //
        // Format: "0515:0a,0516:ff,0517:01"
        //    or:  "0515:uint8:0a,0516:uint8:ff"
        // =================================================================
        {
            key: ['bulk_write'],
            convertSet: async (entity, key, value, meta) => {
                const specs = value.toString().split(',').map((s) => s.trim()).filter(Boolean);
                if (specs.length === 0) {
                    throw new Error('Provide comma-separated writes, e.g. "0515:0a,0516:ff"');
                }
                if (specs.length > 32) {
                    throw new Error(`Too many writes (${specs.length}). Max 32.`);
                }

                const epNum = (meta.state && meta.state.endpoint) || 1;
                const endpoint = getEndpoint(entity, epNum);
                const rawHex = getRawHexSetting(meta);

                console.log(`[ATTR-TOOL] Bulk writing ${specs.length} attributes on EP${epNum}...`);

                const results = [];
                let ok = 0;
                let fail = 0;
                let history = getWriteHistory(meta);

                for (const spec of specs) {
                    try {
                        const {attrId, hexStr, typeInfo} = parseWriteSpec(spec);
                        const label = attrLabel(attrId);
                        const typeNames = Object.entries(DATA_TYPES);
                        const typeName = typeNames.find(([, v]) => v === typeInfo.type)?.[0] || `0x${typeInfo.type.toString(16)}`;

                        await endpoint.write(
                            TARGET_CLUSTER,
                            {[attrId]: {value: typeInfo.value, type: typeInfo.type}},
                            {manufacturerCode, disableDefaultResponse: false},
                        );

                        let readBack = '';
                        try {
                            const rb = await readOneAttr(endpoint, attrId);
                            if (rb.ok) readBack = ` → ${formatValue(rb.value, rawHex)}`;
                        } catch { /* ignore */ }

                        const msg = `✓ ${label} ← ${typeName}:${hexStr}${readBack}`;
                        results.push(msg);
                        history.push(`[${timestamp()}] EP${epNum} ${msg}`);
                        console.log(`[ATTR-TOOL] ${msg}`);
                        ok++;
                    } catch (error) {
                        const msg = `✗ "${spec}": ${error.message}`;
                        results.push(msg);
                        history.push(`[${timestamp()}] EP${epNum} ${msg}`);
                        console.error(`[ATTR-TOOL] ${msg}`);
                        fail++;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }

                while (history.length > WRITE_HISTORY_MAX) history.shift();

                const summary = `EP${epNum} bulk write: ${ok} ok, ${fail} failed out of ${specs.length}`;
                console.log(`[ATTR-TOOL] ${summary}`);

                return {
                    state: {
                        bulk_write: value,
                        bulk_write_result: `${summary}\n\n${results.join('\n')}`,
                        write_history: history,
                        write_history_log: history.join('\n'),
                    },
                };
            },
        },

        // =================================================================
        // RANGE SCAN
        //
        // Formats:
        //   "0515-0530"     - scan range on current endpoint
        // =================================================================
        {
            key: ['scan_range'],
            convertSet: async (entity, key, value, meta) => {
                const trimmed = value.toString().trim().replace(/^0x/i, '');
                const rangeParts = trimmed.split('-');
                const rawHex = getRawHexSetting(meta);

                if (rangeParts.length !== 2) {
                    throw new Error('Format: "START-END" (e.g. "0515-0530")');
                }

                const startId = parseAttrHex(rangeParts[0]);
                const endId = parseAttrHex(rangeParts[1]);

                if (startId === null || endId === null) {
                    throw new Error(`Invalid range: "${value}"`);
                }
                if (startId > endId) {
                    throw new Error(`Start (${attrHexStr(startId)}) must be <= end (${attrHexStr(endId)})`);
                }

                const count = endId - startId + 1;
                if (count > 128) {
                    throw new Error(`Range too large (${count} attrs). Max 128.`);
                }

                const epNum = (meta.state && meta.state.endpoint) || 1;
                const endpoint = getEndpoint(entity, epNum);

                console.log(`[ATTR-TOOL] Scanning ${attrHexStr(startId)}-${attrHexStr(endId)} (${count} attrs) on EP${epNum}...`);

                const results = [];
                let found = 0;
                let errors = 0;

                for (let id = startId; id <= endId; id++) {
                    const label = attrLabel(id);
                    try {
                        const result = await readOneAttr(endpoint, id);
                        if (result.ok) {
                            const formatted = formatValue(result.value, rawHex);
                            results.push(`${label} = ${formatted}`);
                            console.log(`[ATTR-TOOL] ✓ ${label} = ${formatted}`);
                            found++;
                        } else {
                            results.push(`${label}: No data`);
                        }
                    } catch (error) {
                        const msg = error.message.includes('UNSUPPORTED_ATTRIBUTE') ? 'unsupported' : error.message;
                        results.push(`${label}: ${msg}`);
                        errors++;
                    }

                    // Brief pause between reads to avoid flooding
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }

                const summary = `EP${epNum} scan ${attrHexStr(startId)}-${attrHexStr(endId)}: ${found} found, ${errors} errors, ${count - found - errors} empty`;
                console.log(`[ATTR-TOOL] ${summary}`);

                return {
                    state: {
                        scan_range: value,
                        scan_result: `${summary}\n\n${results.join('\n')}`,
                    },
                };
            },
        },

        // =================================================================
        // SNAPSHOT / COMPARE / EXPORT / IMPORT
        //
        // Values:
        //   "snapshot:0515-0530"  - take a snapshot of the range
        //   "compare"             - re-read the snapshot range and diff
        //   "export"              - export current snapshot as JSON string
        //   "import:{json}"       - import a previously exported snapshot
        //   "clear"               - clear stored snapshot
        // =================================================================
        {
            key: ['snapshot'],
            convertSet: async (entity, key, value, meta) => {
                const trimmed = value.toString().trim();
                const trimmedLower = trimmed.toLowerCase();
                const rawHex = getRawHexSetting(meta);

                // --- CLEAR ---
                if (trimmedLower === 'clear') {
                    console.log('[ATTR-TOOL] Snapshot cleared');
                    return {
                        state: {
                            snapshot: 'clear',
                            snapshot_result: 'Snapshot cleared',
                            snapshot_data: undefined,
                            snapshot_start: undefined,
                            snapshot_end: undefined,
                            snapshot_ep: undefined,
                            snapshot_export: undefined,
                        },
                    };
                }

                // --- EXPORT ---
                if (trimmedLower === 'export') {
                    const snapData = meta.state && meta.state.snapshot_data;
                    const snapStart = meta.state && meta.state.snapshot_start;
                    const snapEnd = meta.state && meta.state.snapshot_end;
                    const snapEp = meta.state && meta.state.snapshot_ep;

                    if (!snapData || snapStart === undefined) {
                        throw new Error('No snapshot to export. Take one first.');
                    }

                    const exportObj = {
                        cluster: TARGET_CLUSTER,
                        manufacturerCode,
                        endpoint: snapEp,
                        rangeStart: snapStart,
                        rangeEnd: snapEnd,
                        timestamp: timestamp(),
                        attributes: snapData,
                    };
                    const json = JSON.stringify(exportObj);
                    console.log(`[ATTR-TOOL] Snapshot exported (${Object.keys(snapData).length} attrs, ${json.length} bytes)`);

                    return {
                        state: {
                            snapshot: 'export',
                            snapshot_result: `Exported ${Object.keys(snapData).length} attributes (copy the snapshot_export field)`,
                            snapshot_export: json,
                        },
                    };
                }

                // --- IMPORT ---
                if (trimmedLower.startsWith('import:')) {
                    const jsonStr = trimmed.substring(7);
                    let importObj;
                    try {
                        importObj = JSON.parse(jsonStr);
                    } catch (e) {
                        throw new Error(`Invalid JSON: ${e.message}`);
                    }

                    if (!importObj.attributes || importObj.rangeStart === undefined || importObj.rangeEnd === undefined) {
                        throw new Error('Invalid snapshot format. Expected {attributes, rangeStart, rangeEnd, endpoint}');
                    }

                    const count = Object.keys(importObj.attributes).length;
                    const ep = importObj.endpoint || 1;
                    console.log(`[ATTR-TOOL] Snapshot imported: ${count} attrs, EP${ep}, range ${attrHexStr(importObj.rangeStart)}-${attrHexStr(importObj.rangeEnd)}`);

                    const detail = Object.entries(importObj.attributes)
                        .map(([k, v]) => `  ${attrLabel(Number.parseInt(k, 16))} = ${v.formatted}`)
                        .join('\n');

                    return {
                        state: {
                            snapshot: 'import',
                            snapshot_result: `Imported ${count} attrs from EP${ep} ${attrHexStr(importObj.rangeStart)}-${attrHexStr(importObj.rangeEnd)}${importObj.timestamp ? ' (taken ' + importObj.timestamp + ')' : ''}\n\n${detail}`,
                            snapshot_data: importObj.attributes,
                            snapshot_start: importObj.rangeStart,
                            snapshot_end: importObj.rangeEnd,
                            snapshot_ep: ep,
                        },
                    };
                }

                const epNum = (meta.state && meta.state.endpoint) || 1;
                const endpoint = getEndpoint(entity, epNum);

                // --- COMPARE ---
                if (trimmedLower === 'compare') {
                    const snapData = meta.state && meta.state.snapshot_data;
                    const snapStart = meta.state && meta.state.snapshot_start;
                    const snapEnd = meta.state && meta.state.snapshot_end;
                    const snapEp = meta.state && meta.state.snapshot_ep;

                    if (!snapData || snapStart === undefined) {
                        throw new Error('No snapshot stored. Use "snapshot:0515-0530" first.');
                    }

                    console.log(`[ATTR-TOOL] Comparing snapshot ${attrHexStr(snapStart)}-${attrHexStr(snapEnd)} on EP${snapEp}...`);

                    const compareEp = getEndpoint(entity, snapEp);
                    const changes = [];
                    let unchanged = 0;

                    for (let id = snapStart; id <= snapEnd; id++) {
                        const hexKey = id.toString(16).toLowerCase().padStart(4, '0');
                        const oldEntry = snapData[hexKey];
                        const label = attrLabel(id);

                        try {
                            const result = await readOneAttr(compareEp, id);
                            if (result.ok) {
                                const newFormatted = formatValue(result.value, rawHex);
                                const oldFormatted = oldEntry ? oldEntry.formatted : '(not in snapshot)';

                                if (newFormatted !== oldFormatted) {
                                    changes.push(`≠ ${label}\n    was: ${oldFormatted}\n    now: ${newFormatted}`);
                                    console.log(`[ATTR-TOOL] CHANGED ${label}: ${oldFormatted} → ${newFormatted}`);
                                } else {
                                    unchanged++;
                                }
                            } else if (oldEntry) {
                                changes.push(`≠ ${label}\n    was: ${oldEntry.formatted}\n    now: (no data)`);
                            }
                        } catch (error) {
                            if (oldEntry) {
                                changes.push(`≠ ${label}\n    was: ${oldEntry.formatted}\n    now: ERROR (${error.message})`);
                            }
                        }

                        await new Promise((resolve) => setTimeout(resolve, 50));
                    }

                    const summary = changes.length > 0
                        ? `${changes.length} changed, ${unchanged} unchanged`
                        : `No changes detected (${unchanged} attributes unchanged)`;

                    const output = changes.length > 0
                        ? `${summary}\n\n${changes.join('\n\n')}`
                        : summary;

                    console.log(`[ATTR-TOOL] Compare result: ${summary}`);
                    return {state: {snapshot: 'compare', snapshot_result: output}};
                }

                // --- SNAPSHOT ---
                if (!trimmedLower.startsWith('snapshot:')) {
                    throw new Error('Format: "snapshot:START-END", "compare", "export", "import:{json}", or "clear"');
                }

                const rangePart = trimmedLower.replace('snapshot:', '').trim().replace(/^0x/i, '');
                const rangeParts = rangePart.split('-');

                if (rangeParts.length !== 2) {
                    throw new Error('Format: "snapshot:0515-0530"');
                }

                const startId = parseAttrHex(rangeParts[0]);
                const endId = parseAttrHex(rangeParts[1]);

                if (startId === null || endId === null) {
                    throw new Error(`Invalid range: "${rangePart}"`);
                }
                if (startId > endId) {
                    throw new Error('Start must be <= end');
                }

                const count = endId - startId + 1;
                if (count > 128) {
                    throw new Error(`Range too large (${count}). Max 128.`);
                }

                console.log(`[ATTR-TOOL] Snapshotting ${attrHexStr(startId)}-${attrHexStr(endId)} (${count} attrs) on EP${epNum}...`);

                const snapData = {};
                let found = 0;

                for (let id = startId; id <= endId; id++) {
                    const hexKey = id.toString(16).toLowerCase().padStart(4, '0');
                    const label = attrLabel(id);

                    try {
                        const result = await readOneAttr(endpoint, id);
                        if (result.ok) {
                            snapData[hexKey] = {
                                raw: result.value,
                                formatted: formatValue(result.value, rawHex),
                            };
                            console.log(`[ATTR-TOOL] ✓ ${label} = ${formatValue(result.value, rawHex)}`);
                            found++;
                        }
                    } catch {
                        // Skip errored attributes
                    }

                    await new Promise((resolve) => setTimeout(resolve, 50));
                }

                const summary = `EP${epNum} snapshot: ${found}/${count} attributes captured from ${attrHexStr(startId)}-${attrHexStr(endId)}`;
                const detail = Object.entries(snapData)
                    .map(([k, v]) => `  ${attrLabel(Number.parseInt(k, 16))} = ${v.formatted}`)
                    .join('\n');

                console.log(`[ATTR-TOOL] ${summary}`);

                return {
                    state: {
                        snapshot: value,
                        snapshot_result: `${summary}\n\n${detail}`,
                        snapshot_data: snapData,
                        snapshot_start: startId,
                        snapshot_end: endId,
                        snapshot_ep: epNum,
                    },
                };
            },
        },

        // =================================================================
        // CLUSTER DISCOVERY
        //
        // Values:
        //   "all"   - list all clusters on all endpoints
        //   "1"     - list clusters on EP1 only
        //   "2"     - list clusters on EP2 only
        // =================================================================
        {
            key: ['discover_clusters'],
            convertSet: async (entity, key, value, meta) => {
                const trimmed = value.toString().trim().toLowerCase();

                // Get device from entity — entity is typically an endpoint in Z2M
                const device = entity.getDevice ? entity.getDevice() : entity;

                if (!device.getEndpoint && !device.endpoints) {
                    throw new Error('Cluster discovery requires access to the device object');
                }

                const formatClusters = (ep) => {
                    const epId = ep.ID || '?';
                    const lines = [`EP${epId}:`];

                    const inputClusters = ep.getInputClusters ? ep.getInputClusters() : (ep.inputClusters || []);
                    const outputClusters = ep.getOutputClusters ? ep.getOutputClusters() : (ep.outputClusters || []);

                    if (inputClusters.length > 0) {
                        const names = inputClusters.map((c) => {
                            const id = typeof c === 'object' ? c.ID : c;
                            const name = typeof c === 'object' && c.name ? c.name : `0x${Number(id).toString(16).padStart(4, '0')}`;
                            return `  ${name} (${typeof c === 'object' ? c.ID : id})`;
                        });
                        lines.push(`  Input clusters (${inputClusters.length}):`);
                        lines.push(...names.map((n) => `    ${n}`));
                    } else {
                        lines.push('  Input clusters: none');
                    }

                    if (outputClusters.length > 0) {
                        const names = outputClusters.map((c) => {
                            const id = typeof c === 'object' ? c.ID : c;
                            const name = typeof c === 'object' && c.name ? c.name : `0x${Number(id).toString(16).padStart(4, '0')}`;
                            return `  ${name} (${typeof c === 'object' ? c.ID : id})`;
                        });
                        lines.push(`  Output clusters (${outputClusters.length}):`);
                        lines.push(...names.map((n) => `    ${n}`));
                    } else {
                        lines.push('  Output clusters: none');
                    }

                    return lines.join('\n');
                };

                let output;

                if (trimmed === 'all') {
                    // Enumerate all endpoints
                    const endpoints = device.endpoints || [];
                    const epList = typeof endpoints === 'object' && !Array.isArray(endpoints)
                        ? Object.values(endpoints)
                        : endpoints;

                    if (epList.length === 0) {
                        output = 'No endpoints found on device';
                    } else {
                        const sections = [];
                        for (const ep of epList) {
                            sections.push(formatClusters(ep));
                        }
                        output = `${epList.length} endpoints found\n\n${sections.join('\n\n')}`;
                    }
                } else {
                    const epNum = Number(trimmed);
                    if (!Number.isInteger(epNum) || epNum < 1) {
                        throw new Error('Value: "all" or endpoint number (e.g. "1", "2")');
                    }
                    const ep = device.getEndpoint ? device.getEndpoint(epNum) : null;
                    if (!ep) {
                        throw new Error(`Endpoint ${epNum} not found`);
                    }
                    output = formatClusters(ep);
                }

                console.log(`[ATTR-TOOL] Cluster discovery:\n${output}`);
                return {state: {discover_clusters: value, cluster_list: output}};
            },
        },

        // =================================================================
        // CLEAR WRITE HISTORY
        // =================================================================
        {
            key: ['clear_write_history'],
            convertSet: async (entity, key, value, meta) => {
                console.log('[ATTR-TOOL] Write history cleared');
                return {state: {write_history: [], write_history_log: 'History cleared'}};
            },
        },

        // =================================================================
        // CLEAR REPORT LOG
        // =================================================================
        {
            key: ['clear_report_log'],
            convertSet: async (entity, key, value, meta) => {
                console.log('[ATTR-TOOL] Report log cleared');
                return {state: {report_log: [], last_report: '', report_log_display: 'Log cleared'}};
            },
        },
    ],

    exposes: [
        // --- Settings ---
        {
            type: 'numeric',
            name: 'endpoint',
            property: 'endpoint',
            access: 7,
            value_min: 1,

            value_step: 1,
            description: 'Target endpoint (default 1)',
            category: 'config',
            presets: [
                {name: 'EP 1 (default)', value: 1, description: 'Main endpoint'},
                {name: 'EP 2', value: 2, description: 'Second endpoint'},
            ],
        },
        {
            type: 'binary',
            name: 'raw_hex',
            property: 'raw_hex',
            access: 7,
            value_on: true,
            value_off: false,
            description: 'Show values as raw hex only (OFF = friendly format with decimal + hex + bytes)',
            category: 'config',
        },
        // --- Read ---
        {
            type: 'enum',
            name: 'select_attribute',
            property: 'select_attribute',
            access: 2,
            values: Object.keys(KNOWN_ATTRIBUTES).sort(),
            description: 'Select a known attribute to read',
        },
        {
            type: 'text',
            name: 'read_attribute',
            property: 'read_attribute',
            access: 2,
            description: 'Read custom attribute hex (e.g. "051a")',
        },
        {
            type: 'text',
            name: 'attribute_value',
            property: 'attribute_value',
            access: 1,
            description: 'Last read value',
        },
        {
            type: 'text',
            name: 'attribute_status',
            property: 'attribute_status',
            access: 1,
            description: 'Status of last read',
        },
        // --- Batch Read ---
        {
            type: 'text',
            name: 'read_list',
            property: 'read_list',
            access: 2,
            description: 'Batch read comma-separated attrs: "0515,0516,0517,0522"',
        },
        {
            type: 'text',
            name: 'read_list_result',
            property: 'read_list_result',
            access: 1,
            description: 'Batch read results',
        },
        // --- Write ---
        {
            type: 'text',
            name: 'write_attribute',
            property: 'write_attribute',
            access: 2,
            description: 'Write: "ATTR:VALUE" or "ATTR:TYPE:VALUE" (types: uint8/uint16/uint32/int8/int16/int32/buf/str)',
        },
        {
            type: 'text',
            name: 'write_result',
            property: 'write_result',
            access: 1,
            description: 'Write result (includes automatic read-back)',
        },
        // --- Bulk Write ---
        {
            type: 'text',
            name: 'bulk_write',
            property: 'bulk_write',
            access: 2,
            description: 'Bulk write: "0515:0a,0516:ff,0517:01" (same format as write, comma-separated)',
        },
        {
            type: 'text',
            name: 'bulk_write_result',
            property: 'bulk_write_result',
            access: 1,
            description: 'Bulk write results',
        },
        // --- Scan ---
        {
            type: 'text',
            name: 'scan_range',
            property: 'scan_range',
            access: 2,
            description: 'Scan attribute range: "0515-0530"',
        },
        {
            type: 'text',
            name: 'scan_result',
            property: 'scan_result',
            access: 1,
            description: 'Scan results',
        },
        // --- Snapshot/Compare ---
        {
            type: 'text',
            name: 'snapshot',
            property: 'snapshot',
            access: 2,
            description: 'Snapshot: "snapshot:0515-0530", "compare", "export", "import:{json}", "clear"',
        },
        {
            type: 'text',
            name: 'snapshot_result',
            property: 'snapshot_result',
            access: 1,
            description: 'Snapshot/compare results',
        },
        {
            type: 'text',
            name: 'snapshot_export',
            property: 'snapshot_export',
            access: 1,
            description: 'Exported snapshot JSON (copy this to save)',
        },
        // --- Cluster Discovery ---
        {
            type: 'text',
            name: 'discover_clusters',
            property: 'discover_clusters',
            access: 2,
            description: 'Discover clusters: "all" or endpoint number (e.g. "1")',
        },
        {
            type: 'text',
            name: 'cluster_list',
            property: 'cluster_list',
            access: 1,
            description: 'Discovered clusters',
        },
        // --- Report Listener ---
        {
            type: 'text',
            name: 'last_report',
            property: 'last_report',
            access: 1,
            description: 'Last unsolicited attribute report received',
        },
        {
            type: 'text',
            name: 'report_log_display',
            property: 'report_log_display',
            access: 1,
            description: 'Report log status',
        },
        {
            type: 'text',
            name: 'clear_report_log',
            property: 'clear_report_log',
            access: 2,
            description: 'Send any value to clear the report log',
        },
        // --- Write History ---
        {
            type: 'text',
            name: 'write_history_log',
            property: 'write_history_log',
            access: 1,
            description: `Rolling log of last ${WRITE_HISTORY_MAX} writes`,
        },
        {
            type: 'text',
            name: 'clear_write_history',
            property: 'clear_write_history',
            access: 2,
            description: 'Send any value to clear write history',
        },
    ],

    meta: {},
};

// ============================================================================
// MERGE — combine tool definition with DEVICE_DEFINITION
// ============================================================================

// Extend (modern Z2M extend array — processed at framework level)
if (DEVICE_DEFINITION.extend && DEVICE_DEFINITION.extend.length > 0) {
    definition.extend = DEVICE_DEFINITION.extend;
}

// fromZigbee: device converters first, then tool's report listener
if (DEVICE_DEFINITION.fromZigbee && DEVICE_DEFINITION.fromZigbee.length > 0) {
    definition.fromZigbee = [...DEVICE_DEFINITION.fromZigbee, ...definition.fromZigbee];
}

// toZigbee: device converters first, then tool converters
if (DEVICE_DEFINITION.toZigbee && DEVICE_DEFINITION.toZigbee.length > 0) {
    definition.toZigbee = [...DEVICE_DEFINITION.toZigbee, ...definition.toZigbee];
}

// Exposes: device exposes first, then tool controls
if (DEVICE_DEFINITION.exposes && DEVICE_DEFINITION.exposes.length > 0) {
    definition.exposes = [...DEVICE_DEFINITION.exposes, ...definition.exposes];
}

// Meta: shallow merge (device meta wins on conflicts)
if (DEVICE_DEFINITION.meta && Object.keys(DEVICE_DEFINITION.meta).length > 0) {
    definition.meta = {...definition.meta, ...DEVICE_DEFINITION.meta};
}

// Configure: chain device configure before tool (tool has no configure by default, but safe to chain)
if (DEVICE_DEFINITION.configure) {
    const toolConfigure = definition.configure;
    definition.configure = async (device, coordinatorEndpoint, logger) => {
        await DEVICE_DEFINITION.configure(device, coordinatorEndpoint, logger);
        if (toolConfigure) {
            await toolConfigure(device, coordinatorEndpoint, logger);
        }
    };
}

// onEvent: chain device onEvent before tool's auto-scan handler
if (DEVICE_DEFINITION.onEvent) {
    const toolOnEvent = definition.onEvent;
    definition.onEvent = async (type, data, device) => {
        await DEVICE_DEFINITION.onEvent(type, data, device);
        if (toolOnEvent) {
            await toolOnEvent(type, data, device);
        }
    };
}

export default definition;
