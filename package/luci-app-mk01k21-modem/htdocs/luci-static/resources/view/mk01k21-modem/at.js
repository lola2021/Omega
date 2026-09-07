'use strict';
'require dom';
'require rpc';
'require ui';
'require uci';
'require view';

var callAt = rpc.declare({ object: 'mk01k21-modem', method: 'at', params: [ 'command' ], expect: {} });
var callPorts = rpc.declare({ object: 'mk01k21-modem', method: 'ports', expect: {} });

var presets = [
	[ '', '— ' + _('Choose a preset') + ' —' ],
	[ 'ATI', _('Modem identification') ],
	[ 'AT+GMR', _('Firmware version') ],
	[ 'AT+QNWINFO', _('Current network') ],
	[ 'AT+QCSQ', _('Extended signal') ],
	[ 'AT+QENG="servingcell"', _('Serving cell') ],
	[ 'AT+QCAINFO', _('Carrier aggregation') ],
	[ 'AT+QTEMP', _('Temperature sensors') ],
	[ 'AT+QNWPREFCFG="mode_pref"', _('Radio mode preference') ],
	[ 'AT+QNWPREFCFG="lte_band"', _('LTE band preference') ],
	[ 'AT+QNWPREFCFG="nr5g_band"', _('5G SA band preference') ],
	[ 'AT+QNWPREFCFG="nsa_nr5g_band"', _('5G NSA band preference') ]
];

return view.extend({
	load: function() {
		return Promise.all([ uci.load('mk01k21-modem'), L.resolveDefault(callPorts(), {}) ]);
	},

	validate: function(command) {
		return command.length <= 256 && /^AT/.test(command) && !/[\r\n\x00-\x1f\x7f]/.test(command);
	},

	choosePreset: function(ev) {
		if (ev.target.value)
			document.getElementById('mkmodem-command').value = ev.target.value;
	},

	send: function() {
		var input = document.getElementById('mkmodem-command');
		var button = document.getElementById('mkmodem-send');
		var command = input.value.trim();
		if (!this.validate(command)) {
			ui.addNotification(null, E('p', {}, _('Enter an AT command of at most 256 characters without line breaks.')), 'error');
			return;
		}

		button.disabled = true;
		return callAt(command).then(L.bind(function(result) {
			this.history.unshift({ command: command, output: result.output || result.error || '', ok: result.ok !== false });
			if (this.history.length > 20)
				this.history.length = 20;
			this.renderHistory();
			if (!result.ok)
				ui.addNotification(null, E('p', {}, result.error || _('Command failed.')), 'error');
		}, this)).catch(function(error) {
			ui.addNotification(null, E('p', {}, error.message || String(error)), 'error');
		}).finally(function() {
			button.disabled = false;
			input.focus();
		});
	},

	renderHistory: function() {
		var target = document.getElementById('mkmodem-history');
		if (!this.history.length) {
			dom.content(target, E('p', { 'class': 'cbi-map-descr' }, _('Command responses appear here. History is kept only in this browser tab.')));
			return;
		}
		dom.content(target, this.history.map(function(item) {
			return E('section', { 'class': 'cbi-section mkmodem-response' }, [
				E('div', { 'class': 'mkmodem-response-title' }, [
					E('code', {}, '> ' + item.command),
					E('span', { 'class': item.ok ? 'ok' : 'error' }, item.ok ? _('Completed') : _('Failed'))
				]),
				E('pre', {}, item.output)
			]);
		}));
	},

	clear: function() {
		this.history = [];
		this.renderHistory();
	},

	render: function(loadResults) {
		var configuredPort = uci.get('mk01k21-modem', 'main', 'at_port') || '/dev/ttyUSB2';
		var detected = loadResults[1].at_ports || [];
		this.history = [];
		return E('div', { 'class': 'cbi-map' }, [
			E('style', {}, '.mkmodem-console-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(15rem,1fr);gap:1rem}.mkmodem-console-grid .cbi-section{margin:0}.mkmodem-command-row{display:flex;gap:.5rem}.mkmodem-command-row input{flex:1}.mkmodem-response-title{display:flex;justify-content:space-between;gap:1rem;align-items:center}.mkmodem-response-title .ok{color:var(--success-color,currentColor)}.mkmodem-response-title .error{color:var(--error-color,currentColor)}.mkmodem-response pre{white-space:pre-wrap;overflow-wrap:anywhere;min-height:3rem}@media(max-width:700px){.mkmodem-console-grid{grid-template-columns:1fr}.mkmodem-command-row{flex-direction:column}}'),
			E('h2', {}, _('AT Console')),
			E('div', { 'class': 'cbi-map-descr' }, _('Send one validated command directly to the configured modem port. Commands and responses are not written to persistent history.')),
			E('div', { 'class': 'mkmodem-console-grid' }, [
				E('section', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Command')),
					E('div', { 'class': 'mkmodem-command-row' }, [
						E('input', { 'id': 'mkmodem-command', 'class': 'cbi-input-text', 'type': 'text', 'maxlength': '256', 'placeholder': 'AT+QENG="servingcell"', 'keydown': L.bind(function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); this.send(); } }, this) }),
						E('button', { 'id': 'mkmodem-send', 'class': 'btn cbi-button-action', 'click': ui.createHandlerFn(this, 'send') }, _('Send'))
					]),
					E('label', { 'for': 'mkmodem-preset' }, _('Preset command')),
					E('select', { 'id': 'mkmodem-preset', 'class': 'cbi-input-select', 'change': L.bind(this.choosePreset, this) }, presets.map(function(preset) {
						return E('option', { 'value': preset[0] }, preset[1]);
					}))
				]),
				E('section', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Active port')),
					E('p', {}, E('code', {}, configuredPort)),
					E('p', { 'class': 'cbi-map-descr' }, detected.length ? _('Detected serial ports: ') + detected.join(', ') : _('No serial ports were detected.')),
					E('a', { 'class': 'btn cbi-button-neutral', 'href': L.url('admin/modem/settings') }, _('Change port'))
				])
			]),
			E('div', { 'class': 'mkmodem-response-title' }, [ E('h3', {}, _('Responses')), E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.createHandlerFn(this, 'clear') }, _('Clear')) ]),
			E('div', { 'id': 'mkmodem-history' }, E('p', { 'class': 'cbi-map-descr' }, _('Command responses appear here. History is kept only in this browser tab.')))
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
