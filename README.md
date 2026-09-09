# OpenWrt 25.12 port for the Mesh MK01K21 (MT7621 + MT7915 + RM520N-GL)

Brings the **Mesh MK01K21** 5G CPE from ROOTer (OpenWrt 22.03, Linux 5.10) to
**OpenWrt 25.12** (Linux 6.12), and adds a small LuCI application for the
Quectel RM520N-GL modem so the device does not lose its cellular tooling in the
move.

**Status: CI-built and internally checked, not device-validated, not yet
flashed.** An *earlier* image did pass the running router's own `sysupgrade`
validation (checksum match, board name and compat version accepted, no force
required), which is what establishes that the format, board name and compat
metadata are right. No image built since has been put through that check, and
the metadata has not changed in between. Run `sysupgrade -T` against whichever
image you intend to flash before you flash it. Everything in the
"[Unverified until first boot](#unverified-until-first-boot)" section below is
exactly that — unverified.

---

## 1. Hardware

| Component | Specification |
| :--- | :--- |
| SoC | MediaTek MT7621A — dual-core MIPS 1004Kc @ 880 MHz |
| RAM | 256 MB DDR3 |
| Flash | 16 MB SPI NOR (`jedec,spi-nor`) |
| Wireless | MediaTek MT7915 DBDC — 2×2 2.4 GHz + 2×2 5 GHz 802.11ax, on PCIe0 |
| Ethernet | MT7530 gigabit DSA switch — **2 × LAN + 1 × WAN** |
| Modem | Quectel RM520N-GL 5G on USB, **MBIM** (`/dev/cdc-wdm0`), AT on `/dev/ttyUSB2` |
| Buttons | reset GPIO 18, WPS GPIO 10, rfkill GPIO 12 (all active low) |
| Target | `ramips / mt7621`, board compatible `mesh,mk01k21` |

The switch has two LAN ports, not four. Earlier revisions of this document said
four; the DTS enables `wan`, `lan2` and `lan1` only.

---

## 2. Key device-tree decisions

### A. The `rgmii2` and `sdhci` pinmux release

```dts
&state_default {
	gpio {
		groups = "i2c", "uart2", "uart3", "rgmii2", "sdhci", "wdt", "jtag";
		function = "gpio";
	};
};
```

* **`rgmii2`** — pins 22–33 are shared between GMAC1 (RGMII2) and GPIO. This
  board routes the MT7530 switch through GMAC0 only, so GMAC1 is unused. Left
  unassigned, those pins carry clock noise onto the MDIO lines and cost packets
  on the internal switch link. Muxing them to `"gpio"` releases them cleanly.
* **`sdhci`** — pins 18–21 are shared with the SD controller, and the **reset
  button is GPIO 18**. Without this group muxed to `"gpio"`, `gpio-keys` cannot
  claim pin 18 as an interrupt and the reset button does nothing.

This is a superset of the OEM muxing: the OEM device tree relies on reset
defaults for `uart2`, which is declared explicitly here.

### B. Linux 6.12 `nvmem-layout`, and where the MACs and calibration come from

Kernel 6.x replaced the legacy `nvmem-cells` / `mediatek,mtd-eeprom` parsing
with a `nvmem-layout` sub-node. The factory partition declares one cell:

```dts
factory: partition@40000 {
	label = "factory";
	reg = <0x00040000 0x00010000>;	/* 64KB */
	read-only;

	nvmem-layout {
		compatible = "fixed-layout";
		#address-cells = <1>;
		#size-cells = <1>;

		/* OEM MAC address stored at offset 0xc00 */
		macaddr_factory_c00: macaddr@c00 {
			reg = <0xc00 0x6>;
		};
	};
};
```

Three nodes consume it: the `wan` switch port (with
`mac-address-increment = <1>`) and both PCIe Wi-Fi nodes. **Keep those
`nvmem-cells` / `mac-address` properties** — they are correct and have been
removed by mistake before.

**The MAC at `0xc00` is blank on this unit**, which is why the Ethernet MAC is
random on every boot until a UCI override is set. That is a post-first-boot fix,
not a device-tree one.

Wi-Fi **calibration** does not come from this partition either. The MT7915
reports `eeprom load fail, use default bin`, so the image ships two rescued
generic EEPROM blobs in `files/lib/firmware/mediatek/`. The practical
consequence: radiated power is approximate relative to the reported figure.
That is equally true on ROOTer today, and a newer driver does not change it —
only restoring genuine per-unit calibration would.

### C. GPIO 6 is **PCIe0 power**, not modem power

This is the most important correction to earlier versions of this document,
which described GPIO 6 as a modem rail driven by a `regulator-fixed` node.
Evidence gathered from the running device:

* The OEM device tree names the pin `gpio_pcie0_power`.
* **PCIe0 hosts the MT7915 host interface**, so cutting this rail at runtime
  would likely drop *both* Wi-Fi bands and would not touch the modem.
* ROOTer never toggles it. Its scripts look for `/sys/class/gpio/gpio6`, which
  does not exist under this kernel's GPIO numbering (base 480), and for named
  exports (`cellular-control`, `pci_power`, `lte_power`, `modem1`, `4g1-pwr`, …)
  none of which this board provides.
* No `GPIOPIN=` exists anywhere in ROOTer's `/etc`, and `uci show` has no GPIO
  or power entries — meaning **ROOTer has no modem-power GPIO configured on
  this board at all**. Its modem recovery is AT-based (`AT+CFUN=1,1`).

The DTS therefore exports the pin once, read-only in practice, reproducing
ROOTer's boot state (output, value 0):

```dts
gpio-export {
	compatible = "gpio-export";
	modem-power {
		gpio-export,name = "modem-power";
		gpio-export,output = <0>;
		gpios = <&gpio 6 GPIO_ACTIVE_HIGH>;
	};
};
```

The export keeps the historical name `modem-power`, which is misleading — treat
the name as a legacy label, not a description. **Do not toggle this pin.** The
LuCI "power cycle" button that used to drive it was removed for this reason;
only the AT-based "Restart modem" action remains.
`/usr/libexec/mk01k21-pcie0-power-probe` survives as a shell-only instrument for
a future supervised experiment. It is **not** an init script and not in
`/etc/init.d`, on purpose: as a service it showed up on LuCI's **System →
Startup** page with a one-click Stop, and first boot used to `enable` it, which
creates an `/etc/rc.d/K90` link and so would have written to the line on every
clean shutdown. Its default action is read-only.

### D. Flash layout

| Partition | Offset | Size |
| :--- | :--- | :--- |
| `u-boot` | `0x00000000` | 192 KB |
| `u-boot-env` | `0x00030000` | 64 KB |
| `factory` | `0x00040000` | 64 KB (calibration + MACs) |
| `firmware` | `0x00050000` | 16,064 KB |

Kernel + squashfs must stay under **16,449,536 bytes**. CI asserts this.

---

## 3. Status LEDs

Seven LEDs, all confirmed against the OEM device tree including polarity. There
is **one** Wi-Fi LED and **two bi-colour cellular lamps** — not one LED per
Wi-Fi band.

| LED | GPIO | Meaning | Driven by |
| :--- | :--- | :--- | :--- |
| `top:5gblue` | 14 (active low) | blinks while booting, solid when up | DTS `led-boot` / `led-running` alias, handled by `diag.sh` |
| `top:5gred` | 15 | failsafe / sysupgrade | DTS `led-failsafe` / `led-upgrade` alias |
| `blue:wifi` | 0 | Wi-Fi **traffic** on phy0 | `phy0tpt` trigger, configured by `files/etc/uci-defaults/98-leds` |
| `led:4gblue` | 11 | solid = **connected** | `mk01k21-modem-led` |
| `led:4gorange` | 17 | 500 ms blink = searching · 200 ms = connecting | `mk01k21-modem-led` |
| `led:5gblue` | 9 | solid = **on 5G NR** | `mk01k21-modem-led`, via the `rat` ubus method |
| `led:5gorange` | 13 | solid = attached but not 5G | same |

`mesh,mk01k21` is absent from upstream `board.d/01_leds`, so no LED config is
generated at first boot — hence the explicit `uci-defaults` file.

**The Wi-Fi LED does not use ROOTer's configuration, and that is a correction.**
ROOTer drives this lamp with the `netdev` trigger on `wlan0`, mode
`link tx rx` — read off the running device with `uci show system`, and copied
verbatim into this build at first. It cannot work here. OpenWrt 25.12's
`wifi-scripts` default `ifname_prefix` to `"<phy>-"` and name a default AP
`phy0-ap0`, so no interface is called `wlan0`, the trigger matches no device,
and the lamp stays dark with nothing logged. ROOTer gets away with it because
kernel 5.10 on 22.03 really does create a `wlan0`.

`phy0tpt` binds to the phy instead of an interface name, so renaming cannot
break it. It is an interim with two honest limitations: it shows **traffic, not
link**, so the lamp is legitimately dark while Wi-Fi is up but idle; and it
names `phy0`, which may be the 5 GHz radio on this DBDC chip. The intended
replacement is a hotplug hook that resolves the real name at runtime — see
[After first boot](#after-first-boot).

The trigger needs no package. `CONFIG_MAC80211_LEDS` follows
`CONFIG_LEDS_TRIGGERS`, which is enabled, and `/etc/init.d/led` writes an
unrecognised trigger straight to sysfs and logs `Skipping trigger … due to
missing kernel module` if the kernel rejects it — so unlike the `netdev`/`wlan0`
case, a failure is visible in `logread`.

The cellular state machine lives at
`package/mk01k21-modem/files/usr/libexec/mk01k21-modem-led` and is driven by
`/etc/hotplug.d/iface/30-mk01k21-modem-led`. The hook sets the connected state
immediately and resolves the radio technology in a background subshell, because
netifd runs hotplug scripts serially and an 8-second AT timeout inline would
stall interface bring-up.

This reproduces ROOTer's behaviour but **not** two defects in ROOTer's
`modem-led.sh`: its "connecting" state wrote to `.../led:4gorangetrigger`
(a missing slash, so the fast blink only worked if the slow blink had already
run), and its entire signal-strength blink logic sits after an unconditional
`exit 0` and has never executed. Signal-proportional blinking does not exist in
ROOTer and is not implemented here either.

---

## 4. Cellular configuration

The modem is already in MBIM composition, so no mode switch is needed.

```uci
config interface 'wan_cellular'
	option proto 'mbim'
	option device '/dev/cdc-wdm0'
	option apn 'internet'
	option pdptype 'ipv4'
	option metric '10'
	option auto '1'
	option peerdns '1'
	option defaultroute '1'
	option mtu '1500'
```

**`pdptype` must be `ipv4`, not `ip`.** OpenWrt 25.12's `mbim.sh` silently
discards `ip`.

**`mtu 1500` is set on evidence, not theory.** It is what the device runs under
ROOTer, and a lower MTU breaks the owner's work VPN — an encapsulating tunnel
needs the full 1500 underneath it, and path-MTU discovery frequently fails to
negotiate the fragmentation a smaller outer MTU would require. Forcing 1500 is
only harmful when the carrier's real MTU is lower, which is not the case on this
carrier and APN; the symptom to watch for would be small requests working while
large transfers and some HTTPS sites hang. MSS clamping (`mtu_fix` on the wan
zone) is enabled independently and affects only TCP.

### Network tuning

| Setting | State | Why |
| :--- | :--- | :--- |
| MSS clamping (`mtu_fix`) | on | needed across the cellular boundary; TCP only |
| `packet_steering` | on | the modem arrives over USB and IRQ handling otherwise pins to CPU0 |
| Software flow offloading | on | ROOTer runs it on this device today with the work VPN working through it |
| Hardware flow offloading | off | MT7621's PPE only accelerates flows between the switch's own Ethernet ports, so it cannot touch a USB MBIM WAN |

All four settings match what the device runs under ROOTer today, which is the
point: the cellular data path should not be a variable when a brand-new firmware
is first evaluated.

Two consequences of software offloading are worth knowing. Offloaded flows bypass
conntrack accounting, which is why data usage is tracked with `vnstat` (kernel
interface counters) rather than a conntrack-based per-host tool. And offloading is
incompatible with SQM shaping — enable one or the other, never both.

Relevant packages from `diffconfig`: `umbim`, `luci-proto-mbim`,
`kmod-usb-net-cdc-mbim`, `kmod-usb-wdm`, `kmod-usb-serial-option`,
`kmod-usb-serial-wwan`, `usb-modeswitch`, `sms-tool`, `picocom`, `chat`,
`comgt`, plus `luci-app-watchcat`, `kmod-nft-mangle`, `vnstat2` /
`luci-app-vnstat2` for data accounting, and `luci-app-commands`.

Dark mode needs no package: `luci-theme-bootstrap` registers **Bootstrap**,
**BootstrapDark** and **BootstrapLight**, selectable under **System → System →
Language and Style**. `luci-theme-openwrt-2020` and `luci-theme-material` are
also included as the more modern-looking official themes, both light-only.

---

## 5. The `mk01k21-modem` LuCI application

Two packages: `mk01k21-modem` (a data-only rpcd backend) and
`luci-app-mk01k21-modem` (the UI). They appear in LuCI under a top-level
**Modem** menu.

| Page | What it does |
| :--- | :--- |
| **Network Status** | Signal metrics (RSRP/RSRQ/SINR/RSSI), serving cell, carrier aggregation, temperature, operator, modem and SIM identity with masking, and an AT-based "Restart modem" action |
| **Connection Profile** | APN, PDP type, authentication, SIM PIN, MTU, metric, DNS |
| **AT Console** | Send one validated AT command and read the response, with a preset list |
| **Settings** | AT port selection, identity masking |

### Serialisation

Every path to the modem goes through one lock in the rpcd backend, because the
status sweep, the AT console and the LED helper all want `/dev/ttyUSB2`. Two
readers at once interleave AT responses and produce wrong values with no error,
which is worse than an error. The lock uses `mkdir` as the atomic gate,
publishes its pid by atomic rename, treats a pid-less lock directory as **held**
rather than stale, renames on stale reclaim so a race has exactly one winner,
verifies ownership before releasing, and tests liveness through `/proc/<pid>`
rather than `kill -0` (which returns `EPERM` for another user's process and
would falsely reclaim a live lock). busybox `flock` was deliberately avoided:
the applet is not confirmed present, and a missing applet would fail every
modem call.

The LED helper never opens the serial port itself. It calls a narrow `rat` ubus
method that runs exactly one `AT+QNWINFO` under that same lock.

### AT parsing

All parsing lives in one file,
`package/luci-app-mk01k21-modem/htdocs/luci-static/resources/mk01k21-modem/parser.js`,
and is fixture-tested against **real output captured from this project's own
RM520N-GL** on T-Mobile NR5G-SA band n41. Two layout facts caused real bugs and
are worth knowing before touching that file:

* `AT+QCSQ` returns **four** fields on NR5G-SA — `RSRP, SINR, RSRQ`, with no
  RSSI. LTE prepends RSSI for five; EN-DC reports the LTE anchor then the NR
  leg for eight.
* `AT+QENG="servingcell"` places the **TAC at index 8, before the ARFCN** on
  NR5G-SA — the reverse of the LTE order. Reading NR output with the LTE map
  shifts every column from 8 onward and renders the bandwidth index as the
  RSRP.

Layouts are selected per radio technology. A technology whose field order has
not been verified against real output (currently EN-DC) reports only the
unambiguous identity fields and leaves the metrics blank. Every derived metric
is additionally range-checked, so a future layout surprise degrades to a blank
rather than a confident wrong number.

Other quirks handled: `AT+CSQ` answers `99,99` (the 3GPP "not detectable"
sentinel) on NR5G-SA; `AT+QTEMP` reports `0` for idle SDR PAs and `-273` for
the absent mmWave sensor; bandwidth and subcarrier spacing are table indices,
decoded to MHz and kHz; `AT+COPS` returns a numeric PLMN plus an access
technology code.

---

## 6. Building

**Do not build locally.** GitHub Actions is the only supported path; the
workflow is `.github/workflows/build.yml`.

Every build path now targets the **`v25.12.5` release tag** — both the dispatch
default and the push fallback. A push builds only on `main` / `master`, so work
on a feature branch and dispatch explicitly:

```sh
gh workflow run build.yml --ref <branch> \
  -f openwrt_branch=v25.12.5 -f upload_release=false
```

The input also accepts a branch name or a full 40-character commit SHA. Prefer a
tag or a SHA: a branch moves, so two builds a week apart are not the same source
and neither can be reproduced afterwards.

The workflow fails — rather than warns — if a package config check does not
pass, if the image is missing or exceeds 16,449,536 bytes, or if the manifest
does not contain `mk01k21-modem`, `luci-app-mk01k21-modem`, `umbim`,
`sms-tool`, `jshn` and `rpcd`. The artifact contains the sysupgrade image,
`SHA256SUMS.txt`, `config.buildinfo` and `BUILD_SOURCE.txt`.

**`BUILD_SOURCE.txt` records the resolved OpenWrt commit and this repository's
commit, which is not the same thing as a reproducible build.** `feeds.conf.default`
in the OpenWrt tree points the packages, LuCI, routing, telephony and video feeds
at *moving branches*, and no feed revision is recorded anywhere in the artifact.
So the core and this overlay are pinned, the feed inputs are not, and rebuilding
the same core commit later can pull different LuCI and package sources. Locking
them is possible — `./scripts/feeds list -s -f` emits a `feeds.conf` with each
URL suffixed `^<sha>`, and `scripts/feeds` skips updating a feed pinned that way
— but it is **not done yet**.

Last successful build, from the *previous* core pin (`7114f29f`, a
25.12-SNAPSHOT branch commit) rather than the tag this tree now targets:
**9,962,020 bytes**, 60.6 % of the firmware partition, 200 packages, kernel
6.12.103, mac80211 backports 6.18.39. Building the tag gives kernel 6.12.94 and
backports 6.18.26 instead, so expect the figures and the checksum to move.

---

## 7. Tests

```sh
sh tests/test-modem-backend.sh      # rpcd backend: locking, validation
sh tests/test-modem-leds.sh         # LED state machine against a fake sysfs tree
node tests/test-modem-parser.js     # AT parser fixtures
```

The shell suites are checked under both `sh` and `dash` (`dash` being closest
to busybox `ash`). The parser fixtures run under Node *and* under macOS
JavaScriptCore, for machines without Node:

```sh
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  tests/test-modem-parser.js        # run from the repository root
```

---

## 8. Not implemented

Listed because a control that writes config and changes nothing is worse than
an absent one. None of the following exists yet:

* **A connection watchdog.** OpenWrt's MBIM handler recovers from clean
  failures, but there is no ping keepalive, so the common cellular failure —
  interface up, no data flowing — goes undetected. `luci-app-watchcat` ships in
  the image as an interim measure: configure it under **Services → Watchcat**
  against `wan_cellular`.
* **SMS and USSD.** `sms-tool` is installed but has no UI.
* **Band, RAT and cell locking.** The `AT+QNWPREFCFG` presets in the AT console
  can do this by hand today. A UI needs guard rails first: a bad cell lock can
  disconnect the modem until it is cleared.
* **Status caching.** The status handler holds the lock across eight AT
  commands, so two browser tabs contend and one is honestly told the modem is
  busy.

Also open: the rpcd ACL grants write access to the whole `network` config
because rpcd cannot scope narrower — fixing it needs a redesign of the profile
save method. The Ethernet MAC is random each boot because the factory MAC is
blank, and needs a UCI override after first boot. The operator is displayed as
its numeric PLMN because `AT+COPS` reports format 2.

---

## 9. Flashing and first boot

Verify the image first, then flash with **"Keep settings" unchecked** — the
modem stack differs from ROOTer's, so keeping its configuration is not useful:

```sh
sysupgrade -n /tmp/openwrt-ramips-mt7621-mesh_mk01k21-squashfs-sysupgrade.bin
```

`sysupgrade -T` is a safe dry run: `TEST=1` reaches `exit 0` before any
flash-touching code, and before `install_bin /sbin/upgraded`. LuCI's
**System → Backup / Flash Firmware** screen performs the same validation and
shows the checksum with an explicit Cancel, which is the gentler route.

Both images declare `compat_version 1.1`, so no `-F` is needed. The point of no
return is the line `Commencing upgrade. Closing all shell sessions.` — do not
cut power after it appears.

The first boot formats the JFFS2 overlay and OpenWrt typically reboots once on
its own. Allow **five minutes**, and watch with `ping 192.168.1.1` rather than
the LEDs. LuCI should answer well under a minute on subsequent boots, which is
faster than ROOTer's three to four. Cellular data lags the web UI by 20–60 s
while MBIM attaches. The build's LAN address is also `192.168.1.1`.

### After first boot

Three things are deliberately left for the device, because each needs a value
that cannot be known before it runs.

**Point the Wi-Fi LED at the real interface.** `98-leds` ships the `phy0tpt`
trigger, which works without knowing any interface name but shows traffic
rather than link. Read the actual name and check which phy is 2.4 GHz:

```sh
ls /sys/class/net                 # expect phy0-ap0 / phy1-ap0, not wlan0
iw dev phy0-ap0 info              # 'channel' tells you the band
```

Then either switch back to a `netdev` trigger with the correct device:

```sh
uci set system.led_wifi0.trigger='netdev'
uci set system.led_wifi0.dev='<the real name>'
uci set system.led_wifi0.mode='link tx rx'
uci commit system && /etc/init.d/led restart
```

or report the name so a hotplug hook can resolve it at runtime and the fix can
be committed. `iw` is an unconditional dependency of `kmod-cfg80211`, so a hook
can do band detection without `iwinfo`, which is only installed conditionally.

**Set a stable Ethernet MAC.** The factory MAC cell is blank, so the address is
random on every boot. Use the value on the device label if there is one.

**Choose the Wi-Fi encryption.** No `/etc/config/wireless` is shipped, so this is
a first-boot choice in **Network → Wireless**. `wpad-basic-mbedtls` is built with
`CONFIG_SAE=y`, so **WPA3-Personal is available** — as is WPA2/WPA3 mixed, which
is the safer pick if any client predates 802.11w (WPA3-SAE requires PMF, and a
client that cannot do PMF will not associate at all). `CONFIG_OWE=y` is in the
same variant if an encrypted open network is ever wanted.

### Unverified until first boot

That it boots at all; which physical lamp each LED label drives; whether `phy0`
is the 2.4 GHz radio on this build (and what the AP interfaces are actually
named); whether the `phy0tpt` trigger is accepted (`logread | grep -i trigger`);
the reset button after the pinmux change; which physical jack is `lan1` versus
`lan2`; SPI stability at 50 MHz (`dmesg | grep -i squashfs` after a few hours);
whether the first-boot `uci-defaults` applied (`uci show system`); and whether
MBIM attaches with `pdptype ipv4`.

---

## 10. Reference material in this repository

`my_router.dtb` and `mk01k21.dts` at the repository root are a dump of the
**ROOTer** device tree from the running device — kernel ~5.10 / OpenWrt 22.03,
DSA switch, `mtk,mt7621-sysc`. They are *not* the OEM device tree. The OEM
firmware was LEDE 17.01 (BusyBox 1.26.2, kernel 4.4, swconfig), and no dump of
it exists here.
