'use strict';
'require form';
'require view';

return view.extend({
	render: function() {
		var map = new form.Map('network', _('Modem Connection Profile'), _('Connection settings for the RM520N cellular interface. These values are applied directly to network.wan_cellular.'));
		var section = map.section(form.NamedSection, 'wan_cellular', 'interface', _('Default Profile'));
		section.addremove = false;
		section.tab('general', _('General'));
		section.tab('advanced', _('Advanced'));

		var option = section.taboption('general', form.Value, 'device', _('MBIM control device'));
		option.placeholder = '/dev/cdc-wdm0';
		option.rmempty = false;

		option = section.taboption('general', form.Value, 'apn', _('APN'));
		option.rmempty = false;
		option.validate = function(sectionId, value) {
			return /^[A-Za-z0-9.-]*[A-Za-z0-9]$/.test(value) ? true : _('Enter a valid APN.');
		};

		option = section.taboption('general', form.ListValue, 'pdptype', _('PDP type'));
		option.value('ipv4', _('IPv4'));
		option.value('ipv6', _('IPv6'));
		option.value('ipv4v6', _('IPv4/IPv6'));
		option.default = 'ipv4';

		option = section.taboption('general', form.Value, 'pincode', _('SIM PIN'));
		option.datatype = 'and(uinteger,minlength(4),maxlength(8))';
		option.password = true;

		option = section.taboption('general', form.ListValue, 'auth', _('Authentication protocol'));
		option.value('none', _('None'));
		option.value('pap', _('PAP'));
		option.value('chap', _('CHAP'));
		option.value('both', _('PAP/CHAP'));
		option.default = 'none';

		option = section.taboption('general', form.Value, 'username', _('Connection username'));
		option.depends('auth', 'pap');
		option.depends('auth', 'chap');
		option.depends('auth', 'both');

		option = section.taboption('general', form.Value, 'password', _('Connection password'));
		option.password = true;
		option.depends('auth', 'pap');
		option.depends('auth', 'chap');
		option.depends('auth', 'both');

		option = section.taboption('advanced', form.Flag, 'allow_roaming', _('Allow roaming'));
		option.default = option.disabled;

		option = section.taboption('advanced', form.Flag, 'allow_partner', _('Allow partner networks'));
		option.default = option.disabled;

		option = section.taboption('advanced', form.ListValue, 'dhcp', _('Use DHCP for IPv4'));
		option.value('', _('Automatic'));
		option.value('0', _('Disabled'));
		option.value('1', _('Enabled'));
		option.default = '';

		option = section.taboption('advanced', form.ListValue, 'dhcpv6', _('Use DHCPv6'));
		option.value('', _('Automatic'));
		option.value('0', _('Disabled'));
		option.value('1', _('Enabled'));
		option.default = '';

		option = section.taboption('advanced', form.Value, 'delay', _('Connection delay'), _('Seconds to wait for the modem to become ready.'));
		option.datatype = 'range(1,120)';
		option.placeholder = '10';

		option = section.taboption('advanced', form.Value, 'mtu', _('Custom MTU'));
		option.datatype = 'range(1420,1500)';
		option.placeholder = '1500';

		option = section.taboption('advanced', form.Value, 'metric', _('Gateway metric'));
		option.datatype = 'uinteger';
		option.placeholder = '10';

		option = section.taboption('advanced', form.Flag, 'peerdns', _('Use network-provided DNS'));
		option.default = option.enabled;

		option = section.taboption('advanced', form.DynamicList, 'dns', _('Custom DNS servers'));
		option.datatype = 'ipaddr';
		option.depends('peerdns', '0');

		// Deliberately NOT exposed until there is runtime enforcement behind
		// them: mk_ttl, mk_auto_timezone, mk_provider_lock, mk_startup_at,
		// mk_watchdog_disabled, mk_connection_logging. netifd's mbim handler
		// does not know these options, and nothing in this package acts on
		// them, so showing them would offer settings that silently do nothing.
		// Re-add each one together with the code that implements it.

		return map.render();
	}
});
