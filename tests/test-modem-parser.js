'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const parserPath = path.join(__dirname, '..', 'package', 'luci-app-mk01k21-modem', 'htdocs', 'luci-static', 'resources', 'mk01k21-modem', 'parser.js');
const parser = new Function(fs.readFileSync(parserPath, 'utf8'))();

const signal = parser.parseQcsq('AT+QCSQ\r\n+QCSQ: "NR5G-SA",-51,-80,2,-11\r\nOK\r\n');
assert.deepStrictEqual(signal, { mode: 'NR5G-SA', rssi: -51, rsrp: -80, sinr: 2, rsrq: -11 });

const network = parser.parseNetworkInfo('+QNWINFO: "NR5G-SA","310260","NR5G BAND 41",516270\r\nOK');
assert.deepStrictEqual(network, { mode: 'NR5G-SA', plmn: '310260', band: 'NR5G BAND 41', channel: '516270' });

const cell = parser.parseServingCell('+QENG: "servingcell","NOCONN","NR5G-SA","TDD",310,260,000000001,335,516270,41,100,-80,-11,2\r\nOK');
assert.strictEqual(cell.mode, 'NR5G-SA');
assert.strictEqual(cell.pci, '335');
assert.strictEqual(cell.band, '41');
assert.strictEqual(cell.bandwidth, '100');
assert.strictEqual(cell.cell_id, '000000001');

assert.strictEqual(parser.parseTemperature('+QTEMP: "qfe_wtr_pa0","57"\r\n+QTEMP: "modem-ambient","48"\r\nOK'), 57);
assert.strictEqual(parser.parseIdentifier('+QCCID: 8901000000000000000\r\nOK'), '8901000000000000000');
assert.strictEqual(parser.maskIdentifier('8901000000000000000'), '8901••••••0000');
assert.deepStrictEqual(parser.parseNetworkJson('{"up":true,"uptime":123}'), { up: true, uptime: 123 });

console.log('modem parser fixture tests passed');
