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
  DEPENDS:=+sms-tool +libubox +ubus +uci
endef

define Package/mk01k21-modem/description
 Lightweight rpcd backend for Quectel RM520N status, AT commands,
 port discovery, restart and GPIO power-cycle recovery.
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
endef

$(eval $(call BuildPackage,mk01k21-modem))
