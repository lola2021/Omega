include $(TOPDIR)/rules.mk

PKG_NAME:=mk01k21-modem
PKG_VERSION:=0.1.0
PKG_RELEASE:=1
PKG_LICENSE:=GPL-2.0-only
PKG_MAINTAINER:=Omega MK01K21 project
PKGARCH:=all

include $(INCLUDE_DIR)/package.mk

define Package/mk01k21-modem
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=MK01K21 RM520N modem backend
  # jshn ships /usr/share/libubox/jshn.sh (NOT libubox); rpcd hosts the
  # /usr/libexec/rpcd/ exec plugin this package installs into.
  DEPENDS:=+sms-tool +jshn +rpcd +ubus +uci
endef

define Package/mk01k21-modem/description
 Lightweight rpcd backend for Quectel RM520N status, AT commands,
 port discovery, AT-based modem restart, and a connection watchdog.
endef

define Package/mk01k21-modem/conffiles
/etc/config/mk01k21-modem
endef

define Build/Compile
endef

define Package/mk01k21-modem/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/mk01k21-modem $(1)/etc/config/mk01k21-modem
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./files/usr/libexec/rpcd/mk01k21-modem $(1)/usr/libexec/rpcd/mk01k21-modem
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./files/usr/libexec/mk01k21-modem-led $(1)/usr/libexec/mk01k21-modem-led
	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface
	$(INSTALL_BIN) ./files/etc/hotplug.d/iface/30-mk01k21-modem-led $(1)/etc/hotplug.d/iface/30-mk01k21-modem-led
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/mk01k21-watchdog $(1)/etc/init.d/mk01k21-watchdog
endef

$(eval $(call BuildPackage,mk01k21-modem))
