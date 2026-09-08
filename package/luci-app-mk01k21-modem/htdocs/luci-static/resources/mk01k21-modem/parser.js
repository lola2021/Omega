'use strict';

function responseLines(raw) {
	return String(raw || '')
		.replace(/\r/g, '')
		.split('\n')
		.map(function(line) { return line.trim(); })
		.filter(function(line) {
			return line && line !== 'OK' && line !== 'ERROR' && !/^AT(?:\+|I$|$)/.test(line);
		});
}

function firstValue(raw) {
	var lines = responseLines(raw);
	return lines.length ? lines[0] : '';
}

function parseCsv(text) {
	var values = [], value = '', quoted = false, i, ch;
	for (i = 0; i < text.length; i++) {
		ch = text.charAt(i);
		if (ch === '"') {
			quoted = !quoted;
		} else if (ch === ',' && !quoted) {
			values.push(value.trim());
			value = '';
		} else {
			value += ch;
		}
	}
	values.push(value.trim());
	return values;
}

/* A radio metric is only shown when it lands inside the range the quantity can
 * physically occupy. This is the guard that keeps a wrong field layout from
 * being rendered as a confident number: an out-of-range value is dropped, so
 * the UI shows a blank rather than a plausible-looking lie. */
function plausible(value, low, high) {
	value = Number(value);
	if (value === null || isNaN(value) || value < low || value > high)
		return undefined;
	return value;
}

function numberOrNull(value) {
	var parsed;
	value = String(value === undefined || value === null ? '' : value).trim();
	if (value === '' || value === '-')
		return null;
	parsed = Number(value);
	return isNaN(parsed) ? null : parsed;
}

/* AT+QCSQ's field layout depends on the reported system mode, and on NR5G-SA
 * the RM520N does not report RSSI at all. Verified against a real RM520N-GL
 * (firmware as shipped) attached to NR5G-SA band n41:
 *
 *   +QCSQ: "NR5G",-75,4,-11      -> RSRP -75 dBm, SINR 4 dB, RSRQ -11 dB
 *
 * Cross-checked against AT+QENG="servingcell" from the same modem in the same
 * second, which reported RSRP -75, RSRQ -11, SINR 5. The five-field form the
 * earlier revision assumed is the LTE one, and matching it against NR5G-SA
 * output failed outright, blanking the whole signal panel. */
function parseQcsq(raw) {
	var line = responseLines(raw).filter(function(item) { return item.indexOf('+QCSQ:') === 0; })[0] || '';
	var values, mode, n, out;
	if (!line)
		return {};
	values = parseCsv(line.replace(/^\+QCSQ:\s*/, ''));
	mode = values.shift() || '';
	n = values.map(numberOrNull);
	out = { mode: mode };

	if (/NR5G/i.test(mode) && !/NSA|EN-?DC/i.test(mode) && values.length >= 3) {
		/* NR5G-SA: <RSRP>,<SINR>,<RSRQ> -- no RSSI field exists */
		out.rsrp = plausible(n[0], -160, -30);
		out.sinr = plausible(n[1], -30, 50);
		out.rsrq = plausible(n[2], -40, 0);
	} else if (/NSA|EN-?DC/i.test(mode) && values.length >= 7) {
		/* EN-DC: LTE anchor <RSSI>,<RSRP>,<SINR>,<RSRQ> then NR <RSRP>,<SINR>,<RSRQ>.
		 * The NR leg is reported as the headline; the LTE anchor is kept beside it. */
		out.rssi = plausible(n[0], -120, -20);
		out.lte = {
			rsrp: plausible(n[1], -160, -30),
			sinr: plausible(n[2], -30, 50),
			rsrq: plausible(n[3], -40, 0)
		};
		out.rsrp = plausible(n[4], -160, -30);
		out.sinr = plausible(n[5], -30, 50);
		out.rsrq = plausible(n[6], -40, 0);
	} else if (/WCDMA|HSPA|TDSCDMA/i.test(mode) && values.length >= 3) {
		/* WCDMA: <RSSI>,<RSCP>,<ECIO> */
		out.rssi = plausible(n[0], -120, -20);
		out.rscp = plausible(n[1], -140, -20);
		out.ecio = plausible(n[2], -30, 10);
	} else if (values.length >= 4) {
		/* LTE and anything else reporting the four-metric form:
		 * <RSSI>,<RSRP>,<SINR>,<RSRQ> */
		out.rssi = plausible(n[0], -120, -20);
		out.rsrp = plausible(n[1], -160, -30);
		out.sinr = plausible(n[2], -30, 50);
		out.rsrq = plausible(n[3], -40, 0);
	}
	return out;
}

/* 99 is the 3GPP "not known or not detectable" sentinel, and it is what the
 * RM520N returns for both fields while attached to NR5G-SA. Reporting it as a
 * signal reading would be meaningless, so it is treated as absent. */
function parseCsq(raw) {
	var match = String(raw || '').match(/\+CSQ:\s*(\d+)\s*,\s*(\d+)/);
	var csq = match ? Number(match[1]) : null;
	var ber = match ? Number(match[2]) : null;
	if (csq === 99)
		csq = null;
	return {
		csq: csq,
		ber: ber === 99 ? null : ber,
		rssi: csq !== null && csq <= 31 ? -113 + (2 * csq) : null
	};
}

function parseQrsrp(raw) {
	var line = responseLines(raw).filter(function(item) { return item.indexOf('+QRSRP:') === 0; })[0] || '';
	var matches = line.replace(/^\+QRSRP:\s*/, '').match(/-?\d+/g) || [];
	var chains = matches.map(Number).filter(function(value) { return value >= -160 && value <= -40; });
	return {
		chains: chains,
		primary: chains.length ? chains[0] : null,
		diversity: chains.length > 1 ? chains[1] : null
	};
}

function signalPercent(rsrp) {
	if (rsrp === undefined || rsrp === null || isNaN(Number(rsrp)))
		return null;
	rsrp = Number(rsrp);
	if (rsrp <= -120)
		return 0;
	if (rsrp >= -80)
		return 100;
	return Math.round((rsrp + 120) * 2.5);
}

function parsePhoneNumber(raw) {
	var line = responseLines(raw).filter(function(item) { return item.indexOf('+CNUM:') === 0; })[0] || '';
	var values = parseCsv(line.replace(/^\+CNUM:\s*/, ''));
	return values.length > 1 ? values[1] : '';
}

function parseNetworkInfo(raw) {
	var line = responseLines(raw).filter(function(item) { return item.indexOf('+QNWINFO:') === 0; })[0] || '';
	var values = parseCsv(line.replace(/^\+QNWINFO:\s*/, ''));
	return values.length >= 4 ? {
		mode: values[0],
		plmn: values[1],
		band: values[2],
		channel: values[3]
	} : {};
}

/* AT+QENG="servingcell" uses a DIFFERENT field order per radio access
 * technology, which is the single most dangerous thing in this file: read with
 * the wrong map, every column after the sixth is shifted and the page displays
 * confident nonsense.
 *
 * NR5G_SA is verified byte-for-byte against a real RM520N-GL:
 *
 *   +QENG: "servingcell","NOCONN","NR5G-SA","TDD",310,260,18666712F,335,
 *          794E00,516270,41,12,-75,-11,5,1,-
 *
 * Note that the TAC sits at index 8, BEFORE the ARFCN -- the opposite of the
 * LTE layout, where the TAC comes after the bandwidth pair. LTE is taken from
 * Quectel's documented order and has NOT been seen on this modem yet, so every
 * metric it produces is range-checked before display and an unrecognised mode
 * reports only the fields whose position is unambiguous. */
var SERVING_LAYOUTS = {
	nr5g_sa: {
		state: 1, mode: 2, duplex: 3, mcc: 4, mnc: 5, cell_id: 6,
		pci: 7, tac: 8, channel: 9, band: 10, bandwidth: 11,
		rsrp: 12, rsrq: 13, sinr: 14, scs: 15
	},
	lte: {
		state: 1, mode: 2, duplex: 3, mcc: 4, mnc: 5, cell_id: 6,
		pci: 7, channel: 8, band: 9, bandwidth: 11, tac: 12,
		rsrp: 13, rsrq: 14, rssi: 15, sinr: 16
	}
};

/* Both technologies report bandwidth as a table index, not as MHz. */
var NR_BANDWIDTH_MHZ = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 200, 400];
var LTE_BANDWIDTH_MHZ = [1.4, 3, 5, 10, 15, 20];
var NR_SCS_KHZ = [15, 30, 60, 120, 240];

function lookupIndex(table, value) {
	var index = numberOrNull(value);
	if (index === null || index < 0 || index >= table.length)
		return '';
	return String(table[index]);
}

function hexCellId(value, splitLowNibbles) {
	var low = '', high = '';
	value = String(value || '');
	if (!/^[0-9A-F]+$/i.test(value) || !/[A-F]/i.test(value) || value.length <= splitLowNibbles)
		return { low: '', high: '' };
	low = value.slice(-splitLowNibbles).toUpperCase();
	high = value.slice(0, -splitLowNibbles).toUpperCase();
	return { low: low, high: high };
}

function parseServingCell(raw) {
	var line = responseLines(raw).filter(function(item) {
		return item.indexOf('+QENG:') === 0 && item.indexOf('servingcell') !== -1;
	})[0] || '';
	var values = parseCsv(line.replace(/^\+QENG:\s*/, ''));
	var mode, layout, split, ids, out, tac;

	if (values.length < 7)
		return {};

	mode = values[2] || '';
	out = {
		state: values[1],
		mode: mode,
		duplex: values[3],
		mcc: values[4],
		mnc: values[5],
		cell_id: values[6],
		pci: values[7] || ''
	};

	if (/NR5G[-_]?SA/i.test(mode) && values.length >= 15)
		layout = SERVING_LAYOUTS.nr5g_sa;
	else if (/^LTE$/i.test(mode) && values.length >= 17)
		layout = SERVING_LAYOUTS.lte;

	/* An NR5G-NSA / EN-DC report spans two lines with a layout this code has
	 * never been shown real output for. Rather than guess, the identifying
	 * fields above are reported and the radio metrics are left blank. */
	if (!layout)
		return out;

	/* The NR cell identity is a 36-bit NCI whose gNB/cell split is configured
	 * per network and cannot be recovered from the value, so it is reported
	 * whole. An LTE ECI does have a fixed split: the low byte is the cell. */
	split = layout === SERVING_LAYOUTS.lte ? 2 : 0;
	if (split) {
		ids = hexCellId(out.cell_id, split);
		out.short_cell = ids.low ? ids.low + ' (' + parseInt(ids.low, 16) + ')' : '';
		out.node_id = ids.high ? ids.high + ' (' + parseInt(ids.high, 16) + ')' : '';
	} else if (/^[0-9A-F]+$/i.test(out.cell_id) && /[A-F]/i.test(out.cell_id)) {
		out.cell_id_dec = String(parseInt(out.cell_id, 16));
	}

	tac = values[layout.tac] || '';
	out.tac = /^[0-9A-F]{1,8}$/i.test(tac) ? tac.toUpperCase() + ' (' + parseInt(tac, 16) + ')' : '';
	out.channel = values[layout.channel] || '';
	out.band = values[layout.band] || '';
	out.bandwidth = lookupIndex(layout === SERVING_LAYOUTS.lte ? LTE_BANDWIDTH_MHZ : NR_BANDWIDTH_MHZ,
	                            values[layout.bandwidth]);

	out.rsrp = plausible(numberOrNull(values[layout.rsrp]), -160, -30);
	out.rsrq = plausible(numberOrNull(values[layout.rsrq]), -40, 0);
	out.sinr = plausible(numberOrNull(values[layout.sinr]), -30, 50);
	if (layout.rssi !== undefined)
		out.rssi = plausible(numberOrNull(values[layout.rssi]), -120, -20);
	if (layout.scs !== undefined)
		out.scs = lookupIndex(NR_SCS_KHZ, values[layout.scs]);

	return out;
}

/* AT+QCAINFO reports one line per aggregated carrier. Verified against the
 * real modem, which on a single NR5G-SA carrier answers:
 *
 *   +QCAINFO: "PCC",516270,12,"NR5G BAND 41",335
 *
 * i.e. <type>,<ARFCN>,<bandwidth index>,<band>,<PCI>. The bandwidth index uses
 * the NR table when the band string says NR5G, the LTE table otherwise. */
function parseCaInfo(raw) {
	return responseLines(raw)
		.filter(function(item) { return item.indexOf('+QCAINFO:') === 0; })
		.map(function(item) {
			var values = parseCsv(item.replace(/^\+QCAINFO:\s*/, ''));
			var band = values[3] || '';
			return {
				type: values[0] || '',
				channel: values[1] || '',
				bandwidth: lookupIndex(/NR5G/i.test(band) ? NR_BANDWIDTH_MHZ : LTE_BANDWIDTH_MHZ, values[2]),
				band: band,
				pci: values[4] || ''
			};
		})
		.filter(function(item) { return item.type !== ''; });
}

function formatCaInfo(carriers) {
	return (carriers || []).map(function(item) {
		var label = item.type + ' ' + (item.band || item.channel);
		return item.bandwidth ? label + ' @ ' + item.bandwidth + ' MHz' : label;
	}).join(' + ');
}

/* AT+QTEMP names vary by firmware and unused sensors report sentinels: this
 * modem returns 0 for every idle SDR PA and -273 for the absent mmWave sensor.
 * Prefer the named ambient sensor when it exists, and otherwise fall back to
 * the hottest sensor that reported a real reading. */
function parseTemperature(raw) {
	var lines = responseLines(raw), values = [], ambient = null, i, match, name, value;
	for (i = 0; i < lines.length; i++) {
		match = lines[i].match(/^\+QTEMP:\s*"?([^",]*)"?\s*,\s*"?(-?\d+(?:\.\d+)?)"?\s*$/);
		if (!match) {
			match = lines[i].match(/"(-?\d+(?:\.\d+)?)"?\s*$/);
			name = '';
			value = match ? Number(match[1]) : null;
		} else {
			name = match[1];
			value = Number(match[2]);
		}
		if (value === null || isNaN(value) || value <= 0 || value > 125)
			continue;
		if (/ambient/i.test(name))
			ambient = value;
		values.push(value);
	}
	if (ambient !== null)
		return ambient;
	return values.length ? Math.max.apply(Math, values) : null;
}

/* +COPS: 0,2,"310260",11 -- format 2 means the operator is reported as a
 * numeric PLMN rather than a name, which is what this modem does. The <AcT>
 * code is worth keeping because it distinguishes 5G SA from an LTE anchor. */
var COPS_ACT = {
	0: 'GSM', 2: 'UTRAN', 3: 'GSM/EGPRS', 4: 'UTRAN/HSDPA', 5: 'UTRAN/HSUPA',
	6: 'UTRAN/HSPA+', 7: 'LTE', 8: 'EC-GSM-IoT', 9: 'LTE NB-S1',
	10: 'LTE/5GC', 11: 'NR5G-SA', 12: 'NG-RAN', 13: 'EN-DC'
};

function parseOperator(raw) {
	var match = String(raw || '').match(/\+COPS:\s*\d+\s*,\s*\d+\s*,\s*"([^"]*)"/);
	return match ? match[1] : '';
}

function parseOperatorInfo(raw) {
	var match = String(raw || '').match(/\+COPS:\s*(\d+)\s*,\s*(\d+)\s*,\s*"([^"]*)"(?:\s*,\s*(\d+))?/);
	if (!match)
		return {};
	return {
		operator: match[3],
		numeric: match[2] === '2',
		act: match[4] !== undefined && COPS_ACT[Number(match[4])] ? COPS_ACT[Number(match[4])] : ''
	};
}

/* AT+QSPN carries the readable service provider name from the SIM:
 *
 *   +QSPN: "<full name>","<short name>","<SPN>",<alphabet>,"<RPLMN>"
 *
 * Needed because AT+COPS reports a numeric PLMN on this firmware. Some SIMs
 * leave every name field empty, and some report a bare PLMN as the "name", so
 * an all-digit answer is rejected rather than shown as if it were a brand. */
function parseSpn(raw) {
	var line = responseLines(raw).filter(function(item) { return item.indexOf('+QSPN:') === 0; })[0] || '';
	var values = parseCsv(line.replace(/^\+QSPN:\s*/, ''));
	var i, name;
	for (i = 0; i < values.length && i < 3; i++) {
		name = (values[i] || '').trim();
		if (name && !/^\d+$/.test(name))
			return name;
	}
	return '';
}

function parseIdentifier(raw) {
	var lines = responseLines(raw), match;
	for (var i = 0; i < lines.length; i++) {
		match = lines[i].match(/(?:\+QCCID:\s*)?(\d{8,22})/);
		if (match)
			return match[1];
	}
	return '';
}

function maskIdentifier(value) {
	value = String(value || '');
	if (value.length < 8)
		return value || '—';
	return value.slice(0, 4) + '••••••' + value.slice(-4);
}

function parseNetworkJson(raw) {
	try {
		return JSON.parse(raw || '{}');
	} catch (e) {
		return {};
	}
}

return {
	responseLines: responseLines,
	firstValue: firstValue,
	parseCsv: parseCsv,
	plausible: plausible,
	parseQcsq: parseQcsq,
	parseCsq: parseCsq,
	parseQrsrp: parseQrsrp,
	signalPercent: signalPercent,
	parsePhoneNumber: parsePhoneNumber,
	parseNetworkInfo: parseNetworkInfo,
	parseServingCell: parseServingCell,
	parseCaInfo: parseCaInfo,
	formatCaInfo: formatCaInfo,
	parseTemperature: parseTemperature,
	parseOperator: parseOperator,
	parseOperatorInfo: parseOperatorInfo,
	parseSpn: parseSpn,
	parseIdentifier: parseIdentifier,
	maskIdentifier: maskIdentifier,
	parseNetworkJson: parseNetworkJson
};
