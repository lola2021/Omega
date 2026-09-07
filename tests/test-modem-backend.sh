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

printf '%s\n' 'backend validation tests passed'
