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

if [ "$fails" -gt 0 ]; then
	echo "$fails watchdog escalation test(s) failed" >&2
	exit 1
fi
echo 'watchdog escalation tests passed'
