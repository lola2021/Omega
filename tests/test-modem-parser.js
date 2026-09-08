'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const parserPath = path.join(__dirname, '..', 'package', 'luci-app-mk01k21-modem', 'htdocs', 'luci-static', 'resources', 'mk01k21-modem', 'parser.js');
const parser = new Function(fs.readFileSync(parserPath, 'utf8'))();

const signal = parser.parseQcsq('AT+QCSQ\r\n+QCSQ: "NR5G-SA",-51,-80,2,-11\r\nOK\r\n');
assert.deepStrictEqual(signal, { mode: 'NR5G-SA', rssi: -51, rsrp: -80, sinr: 2, rsrq: -11 });
assert.deepStrictEqual(parser.parseQrsrp('+QRSRP: -83,-77,-140,-140,NR5G\r\nOK'), { chains: [-83, -77, -140, -140], primary: -83, diversity: -77 });
assert.strictEqual(parser.signalPercent(-80), 100);
assert.strictEqual(parser.signalPercent(-100), 50);
assert.strictEqual(parser.parsePhoneNumber('+CNUM: "","+15550100000",145\r\nOK'), '+15550100000');

const network = parser.parseNetworkInfo('+QNWINFO: "NR5G-SA","310260","NR5G BAND 41",516270\r\nOK');
assert.deepStrictEqual(network, { mode: 'NR5G-SA', plmn: '310260', band: 'NR5G BAND 41', channel: '516270' });

const cell = parser.parseServingCell('+QENG: "servingcell","NOCONN","NR5G-SA","TDD",310,260,ABCDEF12F,335,516270,41,100,-80,-11,2,794E00\r\nOK');
assert.strictEqual(cell.mode, 'NR5G-SA');
assert.strictEqual(cell.pci, '335');
assert.strictEqual(cell.band, '41');
assert.strictEqual(cell.bandwidth, '100');
assert.strictEqual(cell.cell_id, 'ABCDEF12F');
assert.strictEqual(cell.short_cell, '12F (303)');
assert.strictEqual(cell.node_id, 'ABCDEF (11259375)');
assert.strictEqual(cell.tac, '794E00 (7949824)');

assert.strictEqual(parser.parseTemperature('+QTEMP: "qfe_wtr_pa0","57"\r\n+QTEMP: "modem-ambient","48"\r\nOK'), 57);
assert.strictEqual(parser.parseIdentifier('+QCCID: 8901000000000000000\r\nOK'), '8901000000000000000');
assert.strictEqual(parser.maskIdentifier('8901000000000000000'), '8901••••••0000');
assert.deepStrictEqual(parser.parseNetworkJson('{"up":true,"uptime":123}'), { up: true, uptime: 123 });

console.log('modem parser fixture tests passed');
