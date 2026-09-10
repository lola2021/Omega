#!/bin/sh
set -eu

# Tests the watchdog's pure escalation logic (next_rung). The reachability
# check, ifdown/ifup and the ubus modem restart are deliberately NOT exercised
# here -- they have side effects and need a live device. What is pinned is the
# state machine: when it acts, which rung it picks, and that it never climbs
# past rung 3 (the reboot rung is not implemented).

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
# Source only to obtain next_rung(); no start_service is called, so the absent
# procd_* helpers do not matter.
. "$ROOT/package/mk01k21-modem/files/etc/init.d/mk01k21-watchdog"

fails=0
expect() {
	# expect <up> <fails> <threshold> <last_rung> <want>
	got="$(next_rung "$1" "$2" "$3" "$4")"
	if [ "$got" != "$5" ]; then
		echo "FAIL: next_rung($1,$2,$3,$4) expected $5, got $got" >&2
		fails=$((fails + 1))
	fi
}

# A passing check never acts, whatever the history.
expect 1 0 3 0 0
expect 1 0 3 3 0

# Below the threshold, a failing check does not act yet.
expect 0 1 3 0 0
expect 0 2 3 0 0

# At the threshold, the first rung fires.
expect 0 3 3 0 1

# Each subsequent failing tick climbs exactly one rung.
expect 0 4 3 1 2
expect 0 5 3 2 3

# Rung 3 is the ceiling: further failures hold there, never a rung 4.
expect 0 6 3 3 3
expect 0 99 3 3 3

# A threshold of 1 acts on the first failure.
expect 0 1 1 0 1

# --- check_reachable: the pin is mandatory --------------------------------
# The actual finding-1 bug was an unpinned ping. Prove check_reachable never
# runs ping at all when no device is given (so it can never follow the default
# route through a working Ethernet WAN), by stubbing ping to record if called.
PING_CALLED=0
ping() { PING_CALLED=1; return 0; }

if check_reachable '' '1.1.1.1 8.8.8.8' 1 3; then
	echo "FAIL: check_reachable with no device should report unreachable" >&2
	fails=$((fails + 1))
fi
if [ "$PING_CALLED" != "0" ]; then
	echo "FAIL: check_reachable ran ping with no device (unpinned ping)" >&2
	fails=$((fails + 1))
fi

# With a device it does ping (stub returns success -> reachable).
if ! check_reachable 'wwan0' '1.1.1.1' 1 3; then
	echo "FAIL: check_reachable with a device and a live target should be reachable" >&2
	fails=$((fails + 1))
fi
unset -f ping

# --- on_iface_down: a down tick must not clear an in-progress rung ---------
# Finding A: interface-down is a state rung 2 (ifdown/ifup) causes, so clearing
# last_rung there strands rung 3 for a slow-to-reattach modem. Down resets fails
# and anomaly but PRESERVES last_rung.
check_down() {
	# check_down <last_rung_in> <want "fails last_rung anomaly">
	got="$(on_iface_down "$1")"
	if [ "$got" != "$2" ]; then
		echo "FAIL: on_iface_down($1) expected '$2', got '$got'" >&2
		fails=$((fails + 1))
	fi
}
check_down 0 '0 0 0'    # at boot / no stall: stays 0
check_down 1 '0 1 0'    # mid-stall after rung 1: rung remembered
check_down 2 '0 2 0'    # after ifdown/ifup: rung 2 remembered, so next up-stall climbs to 3
check_down 3 '0 3 0'    # rung 3 remembered

if [ "$fails" -gt 0 ]; then
	echo "$fails watchdog escalation test(s) failed" >&2
	exit 1
fi
echo 'watchdog escalation tests passed'
