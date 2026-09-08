#!/bin/sh
# Cellular status LED state machine tests.
#
# Runs the real /usr/libexec/mk01k21-modem-led against a fake /sys/class/leds
# tree, so the mapping from connection state to lamp is verified without a
# router attached.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"

# --- cellular status LEDs --------------------------------------------------
# Driven against a fake /sys/class/leds so the state machine is checked without
# a router. Mirrors ROOTer's semantics: 4gblue=connected, 4gorange=activity,
# 5gblue=5G NR, 5gorange=attached but not 5G.

LED_SCRIPT="$ROOT/package/mk01k21-modem/files/usr/libexec/mk01k21-modem-led"
[ -r "$LED_SCRIPT" ] || { echo "missing $LED_SCRIPT" >&2; exit 1; }

FAKE="${TMPDIR:-/tmp}/mk01k21-leds-$$"
rm -rf "$FAKE"
for led in 'led:4gblue' 'led:4gorange' 'led:5gblue' 'led:5gorange'; do
	mkdir -p "$FAKE/$led"
	for attr in trigger brightness delay_on delay_off; do : > "$FAKE/$led/$attr"; done
done

led_run() {
	# Run the real script with LED_ROOT redirected at the fake tree.
	sed "s|^LED_ROOT=.*|LED_ROOT=$FAKE|" "$LED_SCRIPT" > "$FAKE/led.sh"
	sh "$FAKE/led.sh" "$@"
}

led_val() { cat "$FAKE/$1/$2" 2>/dev/null; }

expect_led() {
	[ "$(led_val "$1" "$2")" = "$3" ] || {
		echo "expected $1/$2 = '$3', got '$(led_val "$1" "$2")'" >&2
		rm -rf "$FAKE"; exit 1
	}
}

led_run off
expect_led 'led:4gblue'   brightness 0
expect_led 'led:4gorange' brightness 0
expect_led 'led:5gblue'   brightness 0
expect_led 'led:5gorange' brightness 0

led_run searching
expect_led 'led:4gorange' trigger   timer
expect_led 'led:4gorange' delay_on  500
expect_led 'led:4gorange' delay_off 500
expect_led 'led:4gblue'   brightness 0

led_run connecting
expect_led 'led:4gorange' trigger   timer
expect_led 'led:4gorange' delay_on  200
expect_led 'led:4gorange' delay_off 200

led_run connected 5G
expect_led 'led:4gblue'   brightness 1
expect_led 'led:4gorange' brightness 0
expect_led 'led:5gblue'   brightness 1
expect_led 'led:5gorange' brightness 0

led_run connected LTE
expect_led 'led:4gblue'   brightness 1
expect_led 'led:5gblue'   brightness 0
expect_led 'led:5gorange' brightness 1

# An unknown RAT must leave the 5g pair as-is rather than assert a wrong one.
led_run connected
expect_led 'led:4gblue'   brightness 1
expect_led 'led:5gorange' brightness 1

# An absent LED must be skipped silently, not error.
rm -rf "$FAKE/led:5gblue"
led_run connected 5G || { echo 'led script must tolerate a missing LED' >&2; rm -rf "$FAKE"; exit 1; }

rm -rf "$FAKE"

printf '%s\n' 'LED state machine tests passed'
