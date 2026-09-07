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

function parseQcsq(raw) {
	var line = responseLines(raw).filter(function(item) { return item.indexOf('+QCSQ:') === 0; })[0] || '';
	var match = line.match(/^\+QCSQ:\s*"([^"]+)"\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/);
	if (!match)
		return {};
	return {
		mode: match[1],
		rssi: Number(match[2]),
		rsrp: Number(match[3]),
		sinr: Number(match[4]),
		rsrq: Number(match[5])
	};
}

function parseCsq(raw) {
	var match = String(raw || '').match(/\+CSQ:\s*(\d+)\s*,\s*(\d+)/);
	var csq = match ? Number(match[1]) : null;
	return {
		csq: csq,
		rssi: csq !== null && csq <= 31 ? -113 + (2 * csq) : null
	};
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

function parseServingCell(raw) {
	var line = responseLines(raw).filter(function(item) { return item.indexOf('+QENG:') === 0 && item.indexOf('servingcell') !== -1; })[0] || '';
	var values = parseCsv(line.replace(/^\+QENG:\s*/, ''));
	if (values.length < 10)
		return {};
	return {
		state: values[1],
		mode: values[2],
		duplex: values[3],
		mcc: values[4],
		mnc: values[5],
		cell_id: values[6],
		pci: values[7],
		channel: values[8],
		band: values[9],
		bandwidth: values[10] || '',
		rsrp: values[11] || '',
		rsrq: values[12] || '',
		sinr: values[13] || ''
	};
}

function parseTemperature(raw) {
	var values = [], match, lines = responseLines(raw), i;
	for (i = 0; i < lines.length; i++) {
		match = lines[i].match(/"(-?\d+(?:\.\d+)?)"?\s*$/);
		if (match && Number(match[1]) >= -40 && Number(match[1]) <= 125)
			values.push(Number(match[1]));
	}
	return values.length ? Math.max.apply(Math, values) : null;
}

function parseOperator(raw) {
	var match = String(raw || '').match(/\+COPS:\s*\d+\s*,\s*\d+\s*,\s*"([^"]*)"/);
	return match ? match[1] : '';
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
	parseQcsq: parseQcsq,
	parseCsq: parseCsq,
	parseNetworkInfo: parseNetworkInfo,
	parseServingCell: parseServingCell,
	parseTemperature: parseTemperature,
	parseOperator: parseOperator,
	parseIdentifier: parseIdentifier,
	maskIdentifier: maskIdentifier,
	parseNetworkJson: parseNetworkJson
};
