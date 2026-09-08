'use strict';
'require dom';
'require poll';
'require rpc';
'require ui';
'require uci';
'require view';
'require mk01k21-modem.parser as parser';

var callStatus = rpc.declare({ object: 'mk01k21-modem', method: 'status', params: [ 'full' ], expect: {} });
var callPower = rpc.declare({ object: 'mk01k21-modem', method: 'power', params: [ 'action' ], expect: {} });

function text(value, suffix) {
	return value === undefined || value === null || value === '' ? '—' : String(value) + (suffix || '');
}

function metric(label, value, suffix) {
	return E('div', { 'class': 'mkmodem-metric' }, [
		E('strong', {}, text(value, suffix)),
		E('span', {}, label)
	]);
}

function row(label, value) {
	return E('tr', {}, [ E('td', {}, label), E('td', {}, text(value)) ]);
}

function chip(value) {
	return E('span', { 'class': 'mkmodem-chip' }, text(value));
}

return view.extend({
	load: function() {
		return Promise.all([ uci.load('mk01k21-modem'), L.resolveDefault(callStatus(true), {}) ]);
	},

	parse: function(data) {
		var qcsq = parser.parseQcsq(data.qcsq);
		var csq = parser.parseCsq(data.csq);
		var qrsrp = parser.parseQrsrp(data.qrsrp);
		var radio = parser.parseNetworkInfo(data.network_info);
		var cell = parser.parseServingCell(data.serving_cell);
		var network = parser.parseNetworkJson(data.network_json);
		return {
			ok: data.ok !== false,
			error: data.error,
			model: parser.firstValue(data.model) || data.usb_product || 'Quectel RM520N-GL',
			firmware: parser.firstValue(data.firmware),
			operator: parser.parseOperator(data.operator),
			imei: parser.parseIdentifier(data.imei),
			imsi: parser.parseIdentifier(data.imsi),
			iccid: parser.parseIdentifier(data.iccid),
			phoneNumber: parser.parsePhoneNumber(data.phone_number),
			sim: parser.firstValue(data.sim).replace(/^\+CPIN:\s*/, ''),
			qcsq: qcsq,
			csq: csq,
			qrsrp: qrsrp,
			signalPercent: parser.signalPercent(qcsq.rsrp),
			radio: radio,
			cell: cell,
			temperature: parser.parseTemperature(data.temperature),
			network: network,
			usbId: data.usb_id,
			usbManufacturer: data.usb_manufacturer,
			atPort: data.at_port,
			wdmDevice: data.wdm_device,
			interface: data.interface,
			apn: data.apn,
			pdpType: data.pdptype,
			atDegraded: data.at_degraded == 1,
			atError: data.at_error,
			raw: data
		};
	},

	identifier: function(value) {
		return this.maskIdentifiers ? parser.maskIdentifier(value) : text(value);
	},

	renderStatus: function(data) {
		var status = this.parse(data);
		if (!status.ok)
			return E('div', { 'class': 'alert-message warning' }, [
				E('h4', {}, _('Modem status unavailable')),
				E('p', {}, status.error || _('The modem did not return status information.'))
			]);

		var connected = !!status.network.up;
		var signal = status.qcsq;
		var cell = status.cell;
		var radio = status.radio;
		return E('div', { 'class': 'mkmodem-layout' }, [
			status.atDegraded ? E('div', { 'class': 'alert-message warning' }, [
				E('h4', {}, _('The modem is not answering fully')),
				E('p', {}, status.atError || _('Some AT commands failed or timed out. Values below may be blank or stale.'))
			]) : '',
			E('section', { 'class': 'cbi-section mkmodem-hero' }, [
				E('div', { 'class': 'mkmodem-titleline' }, [
					E('div', {}, [
						E('h3', {}, status.model),
						E('p', {}, [ text(status.operator || radio.plmn), ' · ', text(signal.mode || radio.mode), ' · MBIM' ])
					]),
					E('span', { 'class': connected ? 'mkmodem-badge up' : 'mkmodem-badge down' }, connected ? _('Connected') : _('Disconnected'))
				]),
				E('div', { 'class': 'mkmodem-metrics' }, [
					metric('RSRP', signal.rsrp, ' dBm'),
					metric('RSRQ', signal.rsrq, ' dB'),
					metric('SINR', signal.sinr, ' dB'),
					metric('RSSI', signal.rssi !== undefined ? signal.rssi : status.csq.rssi, ' dBm')
				]),
				E('div', { 'class': 'mkmodem-chips' }, [
					chip(status.signalPercent !== null ? status.signalPercent + '% signal' : ''),
					chip(radio.band || cell.band),
					chip(cell.bandwidth ? cell.bandwidth + ' MHz' : ''),
					chip(cell.pci ? 'PCI ' + cell.pci : ''),
					chip(status.temperature !== null ? status.temperature + '°C' : '')
				].filter(function(node) { return node.textContent !== '—'; }))
			]),

			E('div', { 'class': 'mkmodem-columns' }, [
				E('section', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Current connection')),
					E('table', { 'class': 'table' }, [
						row(_('Interface'), status.interface),
						row(_('Data interface'), status.network.l3_device),
						row(_('Protocol'), 'MBIM'),
						row(_('APN'), status.apn),
						row(_('PDP type'), status.pdpType),
						row(_('Protocol device'), status.wdmDevice),
						row(_('AT port'), status.atPort),
						row(_('IPv4 address'), status.network['ipv4-address'] && status.network['ipv4-address'][0] ? status.network['ipv4-address'][0].address : ''),
						row(_('Connected'), status.network.uptime ? status.network.uptime + ' s' : '')
					])
				]),
				E('section', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Signal details')),
					E('table', { 'class': 'table' }, [
						row(_('Network'), signal.mode || radio.mode),
						row(_('CSQ'), status.csq.csq),
						row(_('Signal strength'), status.signalPercent !== null ? status.signalPercent + '%' : ''),
						row(_('RSSI'), signal.rssi !== undefined ? signal.rssi + ' dBm' : ''),
						row(_('RSRP'), signal.rsrp !== undefined ? signal.rsrp + ' dBm' : ''),
						row(_('Diversity RSRP'), status.qrsrp.diversity !== null ? status.qrsrp.diversity + ' dBm' : ''),
						row(_('RSRQ'), signal.rsrq !== undefined ? signal.rsrq + ' dB' : ''),
						row(_('SINR'), signal.sinr !== undefined ? signal.sinr + ' dB' : '')
					])
				]),
				E('section', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Serving cell')),
					E('table', { 'class': 'table' }, [
						row(_('Radio mode'), cell.mode || radio.mode),
						row(_('Duplex mode'), cell.duplex),
						row(_('MCC / MNC'), cell.mcc && cell.mnc ? cell.mcc + ' / ' + cell.mnc : radio.plmn),
						row(_('eNB / gNB ID'), cell.node_id),
						row(_('TAC'), cell.tac),
						row(_('Short cell ID'), cell.short_cell),
						row(_('Long cell ID'), cell.cell_id),
						row(_('PCI'), cell.pci),
						row(_('Channel'), cell.channel || radio.channel),
						row(_('Band'), cell.band || radio.band),
						row(_('Bandwidth'), cell.bandwidth ? cell.bandwidth + ' MHz' : '')
					])
				])
			]),

			E('div', { 'class': 'mkmodem-columns' }, [
				E('section', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Modem and SIM')),
					E('table', { 'class': 'table' }, [
						row(_('Model'), status.model),
						row(_('USB ID'), status.usbId),
						row(_('Manufacturer'), status.usbManufacturer),
						row(_('Firmware'), status.firmware),
						row(_('SIM status'), status.sim),
						row(_('SIM phone number'), this.identifier(status.phoneNumber)),
						row(_('IMEI'), this.identifier(status.imei)),
						row(_('IMSI'), this.identifier(status.imsi)),
						row(_('ICCID'), this.identifier(status.iccid))
					])
				]),
				E('section', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Recovery')),
					E('p', {}, _('Restarts the modem firmware with AT+CFUN=1,1. The modem leaves the USB bus and re-attaches a few seconds later.')),
					E('div', { 'class': 'right' }, [
						E('button', { 'class': 'btn cbi-button-action', 'click': ui.createHandlerFn(this, 'confirmPower', 'restart') }, _('Restart modem'))
					])
				])
			]),

			E('details', { 'class': 'cbi-section' }, [
				E('summary', {}, _('Raw diagnostic output')),
				E('h4', {}, 'AT+QENG="servingcell"'),
				E('pre', {}, data.serving_cell || ''),
				E('h4', {}, 'AT+QRSRP'),
				E('pre', {}, data.qrsrp || ''),
				E('h4', {}, 'AT+QCAINFO'),
				E('pre', {}, data.carrier_aggregation || ''),
				E('h4', {}, 'AT+QTEMP'),
				E('pre', {}, data.temperature || '')
			])
		]);
	},

	refresh: function(force) {
		var now = Date.now();
		if (!force && (this.refreshSeconds === 0 || now < this.nextRefresh))
			return Promise.resolve();
		this.nextRefresh = now + (this.refreshSeconds * 1000);
		return L.resolveDefault(callStatus(false), { ok: false, error: _('Status request failed') }).then(L.bind(function(data) {
			this.lastData = Object.assign({}, this.lastData || {}, data);
			dom.content(document.getElementById('mkmodem-content'), this.renderStatus(this.lastData));
		}, this));
	},

	changeRefresh: function(ev) {
		this.refreshSeconds = Number(ev.target.value);
		this.nextRefresh = Date.now() + (this.refreshSeconds * 1000);
		uci.set('mk01k21-modem', 'main', 'refresh_interval', String(this.refreshSeconds));
		return uci.save().then(function() { return uci.apply(); });
	},

	confirmPower: function(action) {
		ui.showModal(_('Restart modem?'), [
			E('p', {}, _('Cellular service will be interrupted while the modem firmware restarts.')),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
				' ',
				E('button', {
					'class': 'btn cbi-button-action',
					'click': L.bind(function(ev) {
						ev.target.disabled = true;
						ui.hideModal();
						return callPower(action).then(function(result) {
							ui.addNotification(null, E('p', {}, result.ok ? _('Recovery action started.') : (result.error || _('Recovery action failed.'))), result.ok ? 'info' : 'error');
						}).catch(function(error) {
							ui.addNotification(null, E('p', {}, _('The modem service could not be reached: ') + (error.message || String(error))), 'error');
						});
					}, this)
				}, _('Restart'))
			])
		]);
	},

	render: function(loadResults) {
		this.refreshSeconds = Number(uci.get('mk01k21-modem', 'main', 'refresh_interval') || 30);
		this.maskIdentifiers = uci.get('mk01k21-modem', 'main', 'mask_identifiers') !== '0';
		this.nextRefresh = Date.now() + (this.refreshSeconds * 1000);
		this.lastData = loadResults[1];
		poll.add(L.bind(this.refresh, this, false), 5);

		return E('div', { 'class': 'cbi-map' }, [
			E('style', {}, '.mkmodem-layout{display:grid;gap:1rem}.mkmodem-titleline{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.mkmodem-titleline h3{margin:0}.mkmodem-titleline p{margin:.25rem 0 0}.mkmodem-badge,.mkmodem-chip{display:inline-block;padding:.3rem .65rem;border:1px solid var(--border-color-medium,currentColor);border-radius:999px}.mkmodem-badge.up{color:var(--success-color,currentColor)}.mkmodem-badge.down{color:var(--warning-color,currentColor)}.mkmodem-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-top:1rem}.mkmodem-metric{padding:.8rem;text-align:center;background:var(--background-color-medium,transparent);border-radius:.5rem}.mkmodem-metric strong,.mkmodem-metric span{display:block}.mkmodem-metric strong{font-size:1.25rem}.mkmodem-metric span{font-size:.8rem;opacity:.75}.mkmodem-chips{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1rem}.mkmodem-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.mkmodem-columns .cbi-section{margin:0}details summary{cursor:pointer;font-weight:600}details pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:700px){.mkmodem-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.mkmodem-columns{grid-template-columns:1fr}.mkmodem-titleline{align-items:stretch;flex-direction:column}}'),
			E('div', { 'class': 'mkmodem-titleline' }, [
				E('div', {}, [ E('h2', {}, _('Mobile Network')), E('div', { 'class': 'cbi-map-descr' }, _('Live RM520N signal, serving-cell and connection information.')) ]),
				E('div', {}, [
					E('label', { 'for': 'mkmodem-refresh' }, _('Refresh: ')),
					E('select', { 'id': 'mkmodem-refresh', 'class': 'cbi-input-select', 'change': L.bind(this.changeRefresh, this) }, [
						E('option', { 'value': '0', 'selected': this.refreshSeconds === 0 }, _('Off')),
						E('option', { 'value': '10', 'selected': this.refreshSeconds === 10 }, _('10 seconds')),
						E('option', { 'value': '30', 'selected': this.refreshSeconds === 30 }, _('30 seconds')),
						E('option', { 'value': '60', 'selected': this.refreshSeconds === 60 }, _('60 seconds'))
					]),
					' ', E('button', { 'class': 'btn cbi-button-action', 'click': ui.createHandlerFn(this, 'refresh', true) }, _('Refresh now'))
				])
			]),
			E('div', { 'id': 'mkmodem-content' }, this.renderStatus(loadResults[1]))
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
