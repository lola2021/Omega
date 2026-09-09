#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
MK01K21_MODEM_TEST=1 . "$ROOT/package/mk01k21-modem/files/usr/libexec/rpcd/mk01k21-modem"

expect_valid_command() {
	valid_at_command "$1" || { echo "expected valid command: $1" >&2; exit 1; }
}

expect_invalid_command() {
	if valid_at_command "$1"; then echo "expected invalid command: $1" >&2; exit 1; fi
}

expect_valid_command 'AT'
expect_valid_command 'ATI'
expect_valid_command 'AT+QENG="servingcell"'
expect_valid_command 'AT+QNWPREFCFG="nr5g_band",41'
expect_invalid_command 'QENG="servingcell"'
expect_invalid_command 'at+qcsq'
expect_invalid_command "AT+QCSQ
AT+CGSN"
expect_invalid_command "AT$(printf '\001')"

valid_port '/dev/ttyUSB2'
valid_port '/dev/ttyACM10'
! valid_port '/dev/ttyUSB2;reboot'
! valid_port '/tmp/modem'

valid_uci_name 'wan_cellular'
valid_uci_name 'wan6'
! valid_uci_name 'wan cellular'
! valid_uci_name 'wan;reboot'
! valid_uci_name '../network'
! valid_uci_name ''

# --- SMS input validation --------------------------------------------------
valid_phone_number '+15550100000'
valid_phone_number '15550100000'
valid_phone_number '611'
! valid_phone_number ''
! valid_phone_number '+'
! valid_phone_number '555-0100'
! valid_phone_number '5550100000;reboot'
! valid_phone_number '+1 555 0100'

valid_sms_body 'hello'
valid_sms_body "line one
line two"
! valid_sms_body ''
! valid_sms_body "$(printf 'bad\001bell')"

valid_sms_index '0'
valid_sms_index '12'
valid_sms_index 'all'
! valid_sms_index ''
! valid_sms_index '-1'
! valid_sms_index 'all;reboot'
! valid_sms_index '3.5'

# --- locking ---------------------------------------------------------------
# Exercised against a scratch directory so a real backend on this host is not
# disturbed. These guard the invariant the whole design rests on: at most one
# caller may hold the serial port at a time.

LOCK_DIR="${TMPDIR:-/tmp}/mk01k21-modem-test-$$.lock"
rm -rf "$LOCK_DIR"

fail() { echo "$1" >&2; rm -rf "$LOCK_DIR"; exit 1; }

# A free lock is granted, records our pid, and marks itself held.
acquire_lock || fail 'expected to acquire a free lock'
[ "$LOCK_HELD" = "1" ] || fail 'LOCK_HELD should be 1 after acquiring'
[ "$(cat "$LOCK_DIR/pid")" = "$$" ] || fail 'lock should record our pid'

# A second acquisition by the same live owner must be refused, not granted.
if acquire_lock; then fail 'expected a live lock to block a second acquire'; fi

# The owner can release it.
release_lock
[ -d "$LOCK_DIR" ] && fail 'release_lock should remove a lock we own'
[ "$LOCK_HELD" = "0" ] || fail 'LOCK_HELD should be 0 after release'

# A lock held by a different LIVE process must never be released or stolen by
# us. Use a real child we own so this holds on any host, regardless of whether
# /proc exists or what "kill -0" is permitted to see.
sleep 30 &
live_pid=$!
mkdir "$LOCK_DIR"
printf '%s\n' "$live_pid" > "$LOCK_DIR/pid"
LOCK_HELD=1
release_lock
[ -d "$LOCK_DIR" ] || fail 'release_lock must not remove a lock owned by another process'
if acquire_lock; then fail 'expected a lock owned by a live pid to block acquire'; fi
kill "$live_pid" 2>/dev/null || true
wait "$live_pid" 2>/dev/null || true
rm -rf "$LOCK_DIR"

# process_alive must not confuse a garbage pid file with a running owner.
process_alive '' && fail 'empty pid should not be alive'
process_alive 'not-a-pid' && fail 'non-numeric pid should not be alive'
process_alive "$$" || fail 'our own pid should be alive'

# A lock whose owner has died is stale and must be reclaimed.
sh -c 'exit 0' & dead_pid=$!
wait "$dead_pid" 2>/dev/null || true
mkdir "$LOCK_DIR"
printf '%s\n' "$dead_pid" > "$LOCK_DIR/pid"
LOCK_HELD=0
acquire_lock || fail 'expected to reclaim a lock whose owner is dead'
[ "$(cat "$LOCK_DIR/pid")" = "$$" ] || fail 'reclaimed lock should record our pid'
release_lock

# A lock directory with no pid published yet is treated as HELD, not stale:
# assuming stale here is what would put two callers on the serial port.
mkdir "$LOCK_DIR"
LOCK_HELD=0
if acquire_lock; then fail 'a pidless fresh lock must be treated as held'; fi
rm -rf "$LOCK_DIR"

printf '%s\n' 'backend validation tests passed'
