'use strict';
'require dom';
'require rpc';
'require ui';
'require uci';
'require view';

/* All four actions go through the one rpcd method, which serialises them on the
 * modem lock. The view never talks to the port -- it only calls this. */
var callSms = rpc.declare({
	object: 'mk01k21-modem',
	method: 'sms',
	params: [ 'action', 'number', 'message', 'index' ],
	expect: {}
});

/* sms_tool -j recv returns a JSON array of messages. Field names have varied
 * across sms_tool versions, so read each field from a small list of aliases
 * and fall back to a blank rather than guessing -- blank over a wrong value,
 * the same rule the AT parser follows. */
function pick(obj, names) {
	for (var i = 0; i < names.length; i++)
		if (obj[names[i]] !== undefined && obj[names[i]] !== null && obj[names[i]] !== '')
			return String(obj[names[i]]);
	return '';
}

function parseMessages(output) {
	var data;
	try { data = JSON.parse(output || '[]'); }
	catch (e) { return null; }          /* not JSON -> caller shows raw output */
	if (!Array.isArray(data))
		data = (data && Array.isArray(data.messages)) ? data.messages : [];
	return data.map(function(m) {
		return {
			index:  pick(m, [ 'index', 'idx', 'id' ]),
			sender: pick(m, [ 'sender', 'number', 'from', 'oa' ]),
			time:   pick(m, [ 'time', 'date', 'timestamp', 'scts' ]),
			text:   pick(m, [ 'text', 'message', 'body', 'content' ]),
			status: pick(m, [ 'status', 'stat' ])
		};
	});
}

return view.extend({
	load: function() {
		return uci.load('mk01k21-modem');
	},

	refresh: function() {
		var self = this;
		var target = document.getElementById('mkmodem-sms-list');
		dom.content(target, E('p', { 'class': 'cbi-map-descr' }, _('Loading messages…')));
		return callSms('list', '', '', '').then(function(result) {
			if (!result || result.ok === false) {
				dom.content(target, E('p', { 'class': 'cbi-map-descr' },
					(result && result.error) || _('Could not read messages. The modem may be busy.')));
				return;
			}
			var messages = parseMessages(result.output);
			if (messages === null) {
				/* sms_tool answered but not as JSON -- show it verbatim rather
				 * than pretend to have parsed it. */
				dom.content(target, [
					E('p', { 'class': 'cbi-map-descr' }, _('Unrecognised message output; showing it raw.')),
					E('pre', {}, result.output || '')
				]);
				return;
			}
			self.renderList(target, messages);
		}).catch(function(err) {
			dom.content(target, E('p', { 'class': 'cbi-map-descr' }, err.message || String(err)));
		});
	},

	renderList: function(target, messages) {
		if (!messages.length) {
			dom.content(target, E('p', { 'class': 'cbi-map-descr' }, _('No messages in modem storage.')));
			return;
		}
		var self = this;
		var rows = messages.map(function(m) {
			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, m.sender || '—'),
				E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, m.time || '—'),
				E('td', { 'class': 'td', 'style': 'overflow-wrap:anywhere' }, m.text || '—'),
				E('td', { 'class': 'td', 'style': 'white-space:nowrap' },
					m.index !== '' ? E('button', {
						'class': 'btn cbi-button-remove',
						'click': ui.createHandlerFn(self, 'remove', m.index)
					}, _('Delete')) : '')
			]);
		});
		dom.content(target, E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('From')),
				E('th', { 'class': 'th' }, _('Received')),
				E('th', { 'class': 'th' }, _('Message')),
				E('th', { 'class': 'th' }, _('Action'))
			])
		].concat(rows)));
	},

	remove: function(index) {
		var self = this;
		if (!confirm(_('Delete message %s from modem storage?').format(index)))
			return;
		return callSms('delete', '', '', String(index)).then(function(result) {
			if (!result || result.ok === false)
				ui.addNotification(null, E('p', {}, (result && result.error) || _('Delete failed.')), 'error');
			return self.refresh();
		});
	},

	send: function() {
		var self = this;
		var number = document.getElementById('mkmodem-sms-number').value.trim();
		var message = document.getElementById('mkmodem-sms-text').value;
		var button = document.getElementById('mkmodem-sms-send');
		if (!/^\+?[0-9]{3,20}$/.test(number)) {
			ui.addNotification(null, E('p', {}, _('Enter a destination number: an optional + followed by 3-20 digits.')), 'error');
			return;
		}
		if (!message.length) {
			ui.addNotification(null, E('p', {}, _('Enter a message to send.')), 'error');
			return;
		}
		button.disabled = true;
		return callSms('send', number, message, '').then(function(result) {
			if (!result || result.ok === false) {
				ui.addNotification(null, E('p', {}, (result && result.error) || _('Send failed.')), 'error');
				return;
			}
			ui.addNotification(null, E('p', {}, _('Message sent.')), 'info');
			document.getElementById('mkmodem-sms-text').value = '';
			return self.refresh();
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, err.message || String(err)), 'error');
		}).finally(function() {
			button.disabled = false;
		});
	},

	render: function() {
		var self = this;
		var node = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Messages')),
			E('div', { 'class': 'cbi-map-descr' }, _('SMS in the modem\'s own storage. Reading and sending briefly lock the modem, so a status refresh may report the modem busy while a message is in flight.')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Send a message')),
				E('div', { 'style': 'display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-start' }, [
					E('input', { 'id': 'mkmodem-sms-number', 'class': 'cbi-input-text', 'type': 'text', 'placeholder': '+15550100000', 'style': 'flex:0 0 12rem' }),
					E('textarea', { 'id': 'mkmodem-sms-text', 'class': 'cbi-input-textarea', 'rows': '2', 'placeholder': _('Message text'), 'style': 'flex:1;min-width:15rem' }),
					E('button', { 'id': 'mkmodem-sms-send', 'class': 'btn cbi-button-action', 'click': ui.createHandlerFn(self, 'send') }, _('Send'))
				])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center' }, [
					E('h3', {}, _('Inbox')),
					E('button', { 'class': 'btn cbi-button-neutral', 'click': ui.createHandlerFn(self, 'refresh') }, _('Refresh'))
				]),
				E('div', { 'id': 'mkmodem-sms-list' }, E('p', { 'class': 'cbi-map-descr' }, _('Loading messages…')))
			])
		]);
		this.refresh();
		return node;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
