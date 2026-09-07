include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for the MK01K21 RM520N modem
LUCI_DESCRIPTION:=Signal-first RM520N dashboard, AT console and recovery controls
LUCI_DEPENDS:=+mk01k21-modem +luci-base
LUCI_PKGARCH:=all
PKG_VERSION:=0.1.0
PKG_RELEASE:=1
PKG_LICENSE:=GPL-2.0-only

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
