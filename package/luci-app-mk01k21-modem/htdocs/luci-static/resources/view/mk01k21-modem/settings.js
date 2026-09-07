'use strict';
'require form';
'require view';

return view.extend({
	render: function() {
		var map = new form.Map('mk01k21-modem', _('Modem Settings'), _('Configure the RM520N communication ports, live refresh behavior and privacy defaults.'));
		var section = map.section(form.NamedSection, 'main', 'modem', _('Quectel RM520N-GL'));
		section.addremove = false;

		var option = section.option(form.Value, 'at_port', _('AT command port'));
		option.datatype = 'string';
		option.placeholder = '/dev/ttyUSB2';
		option.rmempty = false;

		option = section.option(form.Value, 'wdm_device', _('MBIM/QMI control device'));
		option.datatype = 'string';
		option.placeholder = '/dev/cdc-wdm0';
		option.rmempty = false;

		option = section.option(form.Value, 'interface', _('Cellular network interface'));
		option.datatype = 'uciname';
		option.placeholder = 'wan_cellular';
		option.rmempty = false;

		option = section.option(form.ListValue, 'refresh_interval', _('Dashboard refresh interval'));
		option.value('0', _('Off'));
		option.value('10', _('10 seconds'));
		option.value('30', _('30 seconds'));
		option.value('60', _('60 seconds'));
		option.default = '10';

		option = section.option(form.Flag, 'mask_identifiers', _('Mask subscriber identifiers'));
		option.description = _('Hide the middle digits of IMEI, IMSI and ICCID on the status page.');
		option.default = option.enabled;
		option.rmempty = false;

		option = section.option(form.Value, 'at_timeout', _('AT command timeout'));
		option.datatype = 'range(2,30)';
		option.default = '8';
		option.rmempty = false;

		return map.render();
	}
});
