# OpenWrt 25.12 Port for Mesh MK01K21 (MT7621 + MT7915)

This repository contains the complete port configuration to bring the **Mesh MK01K21** router from OpenWrt 22.03 (Linux Kernel 5.10) to **OpenWrt 25.12 (Linux Kernel 6.6)**.

---

## Hardware Specifications

| Component | Specification |
| :--- | :--- |
| **SoC** | MediaTek MT7621A (Dual-Core MIPS 1004Kc @ 880MHz) |
| **RAM** | 256MB DDR3 |
| **Flash** | 16MB SPI NOR Flash (`jedec,spi-nor`) |
| **Wireless** | MediaTek MT7915 (PCIe Wi-Fi 6 802.11ax 2x2 2.4GHz + 2x2 5GHz) |
| **Ethernet** | Internal MT7530 Gigabit DSA Switch (4x LAN, 1x WAN) |
| **Cellular Modem** | USB 3.0/2.0 host controller interface with MBIM protocol |
| **Reset Button** | **GPIO 18** (Active LOW, mapped to `KEY_RESTART`) |
| **Modem Power** | **GPIO 6** (Active HIGH, enabled via `regulator-modem` & init script) |
| **Target Architecture** | `ramips / mt7621` |

---

## 1. Key Device Tree (DTS) Adaptations (Kernel 5.10 vs Kernel 6.6)

### A. The Critical `rgmii2` & `sdhci` Pinctrl Fix
On the MT7621 SoC, pin groups are multiplexed between dedicated controllers and general-purpose I/Os:

```dts
&state_default {
	gpio {
		groups = "i2c", "uart2", "uart3", "rgmii2", "sdhci", "wdt";
		function = "gpio";
	};
};
```

1. **`rgmii2` Fix**:
   - Pins 22 to 33 are shared between **GMAC1 (RGMII2)** and GPIOs.
   - In standard single-CPU-port MT7621 topologies, the internal MT7530 switch connects solely through GMAC0 (RGMII1 / TRGMII). GMAC1 is unused.
   - When `rgmii2` is left unassigned or claimed by GMAC1, the pins oscillate with clock noise, cause electrical contention on the MDIO/bus lines, and cause packet loss on the internal switch link. Muxing `rgmii2` to `"gpio"` releases these pins cleanly.
2. **`sdhci` Fix**:
   - Pins 18 to 21 are shared with the SDXC/SDHCI controller.
   - The **Reset Button** is wired to **GPIO 18**. If the `sdhci` group is not explicitly set to `"gpio"`, GPIO 18 cannot be allocated as an interrupt input by `gpio-keys`, rendering the reset button completely non-functional.

### B. Linux 6.6 Modern `nvmem-layout`
In OpenWrt 22.03 (kernel 5.10), calibration data and MAC addresses were parsed via legacy `compatible = "nvmem-cells"` or `mediatek,mtd-eeprom`. Linux kernel 6.6 requires the `nvmem-layout` sub-block with `compatible = "fixed-layout"`:

```dts
factory: partition@40000 {
	label = "factory";
	reg = <0x00040000 0x00010000>;
	read-only;

	nvmem-layout {
		compatible = "fixed-layout";
		#address-cells = <1>;
		#size-cells = <1>;

		macaddr_factory_4: macaddr@4 {
			reg = <0x4 0x6>;
		};

		macaddr_factory_2e: macaddr@2e {
			reg = <0x2e 0x6>;
		};

		eeprom_factory_0: eeprom@0 {
			reg = <0x0 0x1000>;
		};
	};
};
```

### C. Modem Power Management (GPIO 6)
The cellular modem rail is handled natively through a fixed regulator:

```dts
reg_modem: regulator-modem {
	compatible = "regulator-fixed";
	regulator-name = "modem_power";
	regulator-min-microvolt = <3300000>;
	regulator-max-microvolt = <3300000>;
	gpio = <&gpio 6 GPIO_ACTIVE_HIGH>;
	enable-active-high;
	regulator-always-on;
	regulator-boot-on;
};
```
In addition, `/etc/init.d/modem-power` provides manual power cycling and cold recovery commands.

---

## 2. 16MB Flash Optimization Strategy

On a 16MB SPI NOR flash router running Linux 6.6, LuCI, MT7915 Wi-Fi 6 firmware, and MBIM cellular tools, flash space is tight. The following optimizations are configured in `diffconfig`:

1. **Kernel Footprint**:
   - `CONFIG_STRIP_KERNEL_EXPORTS=y`: Drops unneeded kernel symbol exports (~200KB saved).
   - `# CONFIG_KERNEL_KALLSYMS is not set`: Drops symbol lookup table (~350KB compressed saved).
   - `# CONFIG_KERNEL_DEBUG_FS is not set`: Removes debugfs overhead.
2. **Squashfs Block Size**:
   - `CONFIG_TARGET_SQUASHFS_BLOCK_SIZE=256` (or `1024`): Provides superior XZ compression ratio for the rootfs.
3. **Partition Budget**:
   - `u-boot`: 192KB (`0x00000000 - 0x00030000`)
   - `u-boot-env`: 64KB (`0x00030000 - 0x00040000`)
   - `factory`: 64KB (`0x00040000 - 0x00050000`)
   - `firmware`: 16,064KB (`0x00050000 - 0x01000000`)
   The combined kernel + squashfs image must remain strictly below **15.68 MB (16,449,536 bytes)**.

---

## 3. Cellular & MBIM Protocol Configuration

### Installed Packages
- `luci-proto-mbim`: Web GUI interface selector for MBIM.
- `umbim`: Lightweight userspace daemon communicating with `/dev/cdc-wdm0`.
- `kmod-usb-net-cdc-mbim`: Kernel network driver for MBIM.
- `kmod-usb-serial-option` & `kmod-usb-serial-wwan`: Serial AT command ports for diagnostics and SMS.
- `usb-modeswitch`: Handles USB device switching from mass storage to modem.

### UCI Network Configuration (`/etc/config/network`)
```uci
config interface 'wan_cellular'
	option proto 'mbim'
	option device '/dev/cdc-wdm0'
	option apn 'internet'
	option pdptype 'ip'
	option metric '10'
	option auto '1'
	option peerdns '1'
	option defaultroute '1'
```

### Useful CLI Commands for Cellular Debugging
- Check modem status:
  ```sh
  umbim -d /dev/cdc-wdm0 caps
  umbim -d /dev/cdc-wdm0 subscriber
  umbim -d /dev/cdc-wdm0 registration-state
  ```
- Send AT command:
  ```sh
  chat -t 3 -v "" "AT+CSQ" "OK" >/dev/ttyUSB2 </dev/ttyUSB2
  ```
- Power cycle modem:
  ```sh
  /etc/init.d/modem-power restart
  ```

---

## 4. GitHub Actions Workflow

The automated build workflow is located at `.github/workflows/build.yml`.

### How to Trigger:
1. Push this repository to GitHub.
2. Go to **Actions** -> **Build OpenWrt 25.12 for Mesh MK01K21**.
3. Click **Run workflow**:
   - Choose branch: `main` (or `openwrt-25.12`).
   - Check `Publish GitHub Release` if you want automatic release creation with download links.
4. Download the generated `openwrt-mesh-mk01k21-firmware` artifact containing:
   - `openwrt-ramips-mt7621-mesh_mk01k21-squashfs-sysupgrade.bin`
   - `SHA256SUMS.txt`
   - `config.buildinfo`
