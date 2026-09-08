'use strict';

/*
 * Fixture tests for the LuCI modem parser.
 *
 * Every fixture marked REAL is literal output captured from the project's own
 * Quectel RM520N-GL attached to T-Mobile NR5G-SA on band n41. Fixtures marked
 * DOCUMENTED come from Quectel's published field order and have not yet been
 * observed on this modem -- the parser range-checks anything it derives from
 * them, so a wrong layout degrades to a blank field instead of a wrong number.
 *
 * Runs under Node (CI) and under macOS JavaScriptCore's jsc shell for local
 * checks on machines without Node. Under jsc, run it from the repository root:
 *
 *   jsc tests/test-modem-parser.js
 */

var PARSER_REL = 'package/luci-app-mk01k21-modem/htdocs/luci-static/resources/mk01k21-modem/parser.js';
var readSource, report, failures = 0;

if (typeof require === 'function') {
	var fs = require('fs');
	var path = require('path');
	readSource = function (rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); };
	report = console.log;
} else {
	readSource = function (rel) { return read(rel); };
	report = print;
}

var parser = new Function(readSource(PARSER_REL))();

function fail(message) {
	failures++;
	report('FAIL: ' + message);
}

function eq(actual, expected, label) {
	if (actual !== expected)
		fail(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function deepEq(actual, expected, label) {
	var a = JSON.stringify(actual), b = JSON.stringify(expected);
	if (a !== b)
		fail(label + ': expected ' + b + ', got ' + a);
}

function isUndef(actual, label) {
	if (actual !== undefined && actual !== null)
		fail(label + ': expected no value, got ' + JSON.stringify(actual));
}

/* ---------------------------------------------------------------- AT+QCSQ */

/* REAL. Four fields, no RSSI: on NR5G-SA the RM520N reports RSRP, SINR, RSRQ
 * only. An earlier revision required five fields and returned {} here, which
 * blanked the entire signal panel on this network. */
var qcsqNr = parser.parseQcsq('AT+QCSQ\r\n+QCSQ: "NR5G",-75,4,-11\r\n\r\nOK\r\n');
eq(qcsqNr.mode, 'NR5G', 'QCSQ NR5G mode');
eq(qcsqNr.rsrp, -75, 'QCSQ NR5G RSRP');
eq(qcsqNr.sinr, 4, 'QCSQ NR5G SINR');
eq(qcsqNr.rsrq, -11, 'QCSQ NR5G RSRQ');
isUndef(qcsqNr.rssi, 'QCSQ NR5G RSSI is not reported on SA');

/* DOCUMENTED: LTE prepends RSSI. */
var qcsqLte = parser.parseQcsq('+QCSQ: "LTE",-63,-92,14,-9\r\nOK');
eq(qcsqLte.rssi, -63, 'QCSQ LTE RSSI');
eq(qcsqLte.rsrp, -92, 'QCSQ LTE RSRP');
eq(qcsqLte.sinr, 14, 'QCSQ LTE SINR');
eq(qcsqLte.rsrq, -9, 'QCSQ LTE RSRQ');

/* DOCUMENTED: EN-DC reports the LTE anchor first, then the NR leg. The NR leg
 * is the headline; the anchor is kept alongside it. */
var qcsqNsa = parser.parseQcsq('+QCSQ: "NR5G_NSA",-70,-95,12,-10,-80,9,-12\r\nOK');
eq(qcsqNsa.rsrp, -80, 'QCSQ EN-DC headline RSRP is the NR leg');
eq(qcsqNsa.sinr, 9, 'QCSQ EN-DC headline SINR is the NR leg');
eq(qcsqNsa.lte.rsrp, -95, 'QCSQ EN-DC anchor RSRP');

/* A field outside the physically possible range is dropped, not displayed. */
var qcsqBad = parser.parseQcsq('+QCSQ: "NR5G",12,4,-11\r\nOK');
isUndef(qcsqBad.rsrp, 'QCSQ implausible RSRP dropped');
eq(qcsqBad.rsrq, -11, 'QCSQ plausible neighbour still reported');

eq(Object.keys(parser.parseQcsq('ERROR')).length, 0, 'QCSQ error response yields nothing');

/* ----------------------------------------------------------------- AT+CSQ */

/* REAL. 99 is the 3GPP "not known or not detectable" sentinel, which is what
 * this modem returns on NR5G-SA -- it must not surface as a reading. */
var csqUnknown = parser.parseCsq('AT+CSQ\r\n+CSQ: 99,99\r\n\r\nOK\r\n');
eq(csqUnknown.csq, null, 'CSQ 99 is unknown');
eq(csqUnknown.ber, null, 'BER 99 is unknown');
eq(csqUnknown.rssi, null, 'CSQ 99 yields no RSSI');

var csqReal = parser.parseCsq('+CSQ: 20,0\r\nOK');
eq(csqReal.csq, 20, 'CSQ value');
eq(csqReal.rssi, -73, 'CSQ to RSSI conversion');

/* -------------------------------------------------- AT+QENG="servingcell" */

/* REAL. Field order for NR5G-SA is:
 *   state, rat, duplex, mcc, mnc, cellID, PCI, TAC, ARFCN, band,
 *   DL bandwidth index, RSRP, RSRQ, SINR, scs, srxlev
 * Note the TAC at index 8, BEFORE the ARFCN -- the reverse of LTE. Reading
 * this line with the LTE map shifted every column from 8 onward and displayed
 * the bandwidth index (12) as the RSRP. */
var nrCell = parser.parseServingCell(
	'+QENG: "servingcell","NOCONN","NR5G-SA","TDD",310,260,18666712F,335,794E00,516270,41,12,-75,-11,5,1,-\r\nOK');
eq(nrCell.mode, 'NR5G-SA', 'NR serving cell mode');
eq(nrCell.state, 'NOCONN', 'NR serving cell state');
eq(nrCell.duplex, 'TDD', 'NR duplex');
eq(nrCell.mcc, '310', 'NR MCC');
eq(nrCell.mnc, '260', 'NR MNC');
eq(nrCell.cell_id, '18666712F', 'NR cell identity');
eq(nrCell.cell_id_dec, '6549827887', 'NR cell identity in decimal');
eq(nrCell.short_cell, undefined, 'NR NCI is not split into eNB/cell');
eq(nrCell.pci, '335', 'NR PCI');
eq(nrCell.tac, '794E00 (7949824)', 'NR TAC');
eq(nrCell.channel, '516270', 'NR ARFCN');
eq(nrCell.band, '41', 'NR band');
eq(nrCell.bandwidth, '100', 'NR bandwidth index 12 is 100 MHz');
eq(nrCell.rsrp, -75, 'NR RSRP');
eq(nrCell.rsrq, -11, 'NR RSRQ');
eq(nrCell.sinr, 5, 'NR SINR');
eq(nrCell.scs, '30', 'NR subcarrier spacing index 1 is 30 kHz');

/* Cross-check: QCSQ and QENG were captured seconds apart and must agree. */
eq(nrCell.rsrp, qcsqNr.rsrp, 'QENG and QCSQ agree on RSRP');
eq(nrCell.rsrq, qcsqNr.rsrq, 'QENG and QCSQ agree on RSRQ');

/* DOCUMENTED LTE order:
 *   ...,cellID, PCI, EARFCN, band, UL bw, DL bw, TAC, RSRP, RSRQ, RSSI, SINR, ... */
var lteCell = parser.parseServingCell(
	'+QENG: "servingcell","NOCONN","LTE","FDD",310,260,1A2B3C4,177,2000,4,5,5,794E,-92,-9,-63,14,10,23,-\r\nOK');
eq(lteCell.mode, 'LTE', 'LTE mode');
eq(lteCell.pci, '177', 'LTE PCI');
eq(lteCell.channel, '2000', 'LTE EARFCN');
eq(lteCell.band, '4', 'LTE band');
eq(lteCell.bandwidth, '20', 'LTE DL bandwidth index 5 is 20 MHz');
eq(lteCell.tac, '794E (31054)', 'LTE TAC');
eq(lteCell.rsrp, -92, 'LTE RSRP');
eq(lteCell.rsrq, -9, 'LTE RSRQ');
eq(lteCell.rssi, -63, 'LTE RSSI');
eq(lteCell.sinr, 14, 'LTE SINR');
eq(lteCell.short_cell, 'C4 (196)', 'LTE ECI low byte is the cell');
eq(lteCell.node_id, '1A2B3 (107187)', 'LTE ECI high bits are the eNB');

/* An EN-DC report has a layout this parser has never seen real output for, so
 * it reports only the unambiguous identity fields and blanks the metrics
 * rather than guessing at column positions. */
var nsaCell = parser.parseServingCell(
	'+QENG: "servingcell","NOCONN","NR5G-NSA",310,260,335,-80,9,-12,516270,41\r\nOK');
eq(nsaCell.mode, 'NR5G-NSA', 'EN-DC mode is still reported');
isUndef(nsaCell.rsrp, 'EN-DC metrics are left blank rather than guessed');
eq(nsaCell.band, undefined, 'EN-DC band is left blank rather than guessed');

deepEq(parser.parseServingCell('ERROR'), {}, 'QENG error response yields nothing');

/* ------------------------------------------------------------- AT+QCAINFO */

/* REAL. One carrier: type, ARFCN, bandwidth index, band, PCI. */
var carriers = parser.parseCaInfo('AT+QCAINFO\r\n+QCAINFO: "PCC",516270,12,"NR5G BAND 41",335\r\n\r\nOK\r\n');
eq(carriers.length, 1, 'one aggregated carrier');
eq(carriers[0].type, 'PCC', 'carrier type');
eq(carriers[0].channel, '516270', 'carrier ARFCN');
eq(carriers[0].band, 'NR5G BAND 41', 'carrier band');
eq(carriers[0].bandwidth, '100', 'carrier bandwidth uses the NR table');
eq(carriers[0].pci, '335', 'carrier PCI');
eq(parser.formatCaInfo(carriers), 'PCC NR5G BAND 41 @ 100 MHz', 'carrier summary');
eq(parser.formatCaInfo(parser.parseCaInfo('ERROR')), '', 'no carriers yields an empty summary');

/* --------------------------------------------------------------- AT+QTEMP */

/* REAL. Idle SDR PAs report 0 and the absent mmWave sensor reports -273;
 * neither is a temperature. The named ambient sensor wins when present. */
var qtempReal = [
	'+QTEMP:"modem-lte-sub6-pa1","53"',
	'+QTEMP:"modem-sdr0-pa0","0"',
	'+QTEMP:"modem-sdr1-pa2","0"',
	'+QTEMP:"modem-mmw0","-273"',
	'+QTEMP:"aoss-0-usr","54"',
	'+QTEMP:"mdmq6-0-usr","53"',
	'+QTEMP:"modem-ambient-usr","54"',
	'OK'
].join('\r\n');
eq(parser.parseTemperature(qtempReal), 54, 'ambient sensor is preferred');
eq(parser.parseTemperature('+QTEMP: "qfe_wtr_pa0","57"\r\n+QTEMP: "modem-mmw0","-273"\r\nOK'), 57,
	'without an ambient sensor the hottest real reading is used');
eq(parser.parseTemperature('+QTEMP: "modem-sdr0-pa0","0"\r\nOK'), null, 'only sentinels yields nothing');

/* ------------------------------------------------------------- AT+QNWINFO */

/* REAL. Note the mode string is "TDD NR5G", not "NR5G-SA" -- the LED helper's
 * 5G test matches on the substring for exactly this reason. */
var radio = parser.parseNetworkInfo('AT+QNWINFO\r\n+QNWINFO: "TDD NR5G","310260","NR5G BAND 41",516270\r\n\r\nOK\r\n');
deepEq(radio, { mode: 'TDD NR5G', plmn: '310260', band: 'NR5G BAND 41', channel: '516270' }, 'QNWINFO');

/* ---------------------------------------------------------------- AT+COPS */

/* REAL. Format 2 means the operator arrives as a numeric PLMN, and <AcT> 11
 * is NR standalone. */
var operator = parser.parseOperatorInfo('AT+COPS?\r\n+COPS: 0,2,"310260",11\r\n\r\nOK\r\n');
eq(operator.operator, '310260', 'operator PLMN');
eq(operator.numeric, true, 'operator is reported numerically');
eq(operator.act, 'NR5G-SA', 'access technology 11 is NR5G-SA');
eq(parser.parseOperator('+COPS: 0,0,"T-Mobile",11\r\nOK'), 'T-Mobile', 'alphanumeric operator name');

/* ------------------------------------------------------- unchanged helpers */

deepEq(parser.parseQrsrp('+QRSRP: -83,-77,-140,-140,NR5G\r\nOK'),
	{ chains: [-83, -77, -140, -140], primary: -83, diversity: -77 }, 'QRSRP chains');
eq(parser.signalPercent(-80), 100, 'signal percent ceiling');
eq(parser.signalPercent(-100), 50, 'signal percent midpoint');
eq(parser.signalPercent(undefined), null, 'signal percent with no RSRP');
eq(parser.parsePhoneNumber('+CNUM: "","+15550100000",145\r\nOK'), '+15550100000', 'CNUM');
eq(parser.parseIdentifier('+QCCID: 8901000000000000000\r\nOK'), '8901000000000000000', 'ICCID');
eq(parser.maskIdentifier('8901000000000000000'), '8901••••••0000', 'identifier masking');
deepEq(parser.parseNetworkJson('{"up":true,"uptime":123}'), { up: true, uptime: 123 }, 'network JSON');
deepEq(parser.parseNetworkJson('not json'), {}, 'malformed network JSON');

if (failures) {
	report(failures + ' modem parser fixture test(s) failed');
	if (typeof process !== 'undefined')
		process.exit(1);
	throw new Error('modem parser fixture tests failed');
}
report('modem parser fixture tests passed');
