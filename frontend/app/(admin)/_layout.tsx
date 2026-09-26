import React from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { Slot, useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { SquaresFour, Receipt, Users, Headset, UsersThree, Newspaper, Bell, GearSix, FileText, Tray } from "phosphor-react-native";

import { api } from "@/src/api";
import { BoltyWordmark } from "@/src/components/logo";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

// Admin panel shell: sidebar on desktop/tablet, scrollable top menu on phones. Server enforces the role.
const MENU = [
  { href: "/(admin)", match: ["/", "/(admin)"], label: "Dashboard", Icon: SquaresFour },
  { href: "/(admin)/bollette", match: ["/bollette"], label: "Bollette", Icon: Receipt },
  { href: "/(admin)/queue", match: ["/queue"], label: "Da analizzare", Icon: Tray },
  { href: "/(admin)/clienti", match: ["/clienti"], label: "Clienti", Icon: Users },
  { href: "/(admin)/contatti", match: ["/contatti"], label: "Richieste di contatto", Icon: Headset },
  { href: "/(admin)/contratti", match: ["/contratti"], label: "Contratti", Icon: FileText },
  { href: "/(admin)/referral", match: ["/referral"], label: "Referral", Icon: UsersThree },
  { href: "/(admin)/news", match: ["/news"], label: "News", Icon: Newspaper },
  { href: "/(admin)/notifiche", match: ["/notifiche"], label: "Notifiche", Icon: Bell },
  { href: "/(admin)/impostazioni", match: ["/impostazioni"], label: "Impostazioni", Icon: GearSix },
];

export default function AdminLayout() {
  const s = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const wide = width >= 900;

  const { data: notif } = useQuery({ queryKey: ["admin-notifications"], queryFn: () => api("/admin/notifications?limit=1"), refetchInterval: 30000 });
  const unread = notif?.unread || 0;

  const isActive = (m: (typeof MENU)[number]) => m.match.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));

  if (wide) {
    return (
      <View style={[s.row, { paddingTop: insets.top }]}>
        <View style={s.sidebar} testID="admin-sidebar">
          <View style={s.brand}>
            <BoltyWordmark size={24} />
            <Text style={s.brandTag}>ADMIN</Text>
          </View>
          {MENU.map((m) => {
            const active = isActive(m);
            return (
              <Pressable key={m.href} onPress={() => router.replace(m.href as any)} style={[s.item, active && s.itemActive]} testID={`admin-menu-${m.label}`}>
                <m.Icon size={20} color={active ? colors.brand : colors.muted} weight={active ? "fill" : "regular"} />
                <Text style={[s.itemText, active && s.itemTextActive]}>{m.label}</Text>
                {m.label === "Notifiche" && unread > 0 ? <View style={s.badge}><Text style={s.badgeText}>{unread}</Text></View> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={s.content}>
          <Slot />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.topbar, { paddingTop: insets.top + spacing.sm }]} testID="admin-topbar">
        <View style={s.brandRow}>
          <BoltyWordmark size={20} />
          <Text style={s.brandTag}>ADMIN</Text>
        </View>
        <ScrollView horizontal showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {MENU.map((m) => {
            const active = isActive(m);
            return (
              <Pressable key={m.href} onPress={() => router.replace(m.href as any)} style={[s.chip, active && s.chipActive]} testID={`admin-menu-${m.label}`}>
                <m.Icon size={16} color={active ? colors.onBrand : colors.onSurfaceTertiary} weight={active ? "fill" : "regular"} />
                <Text style={[s.chipText, active && { color: colors.onBrand }]}>{m.label}</Text>
                {m.label === "Notifiche" && unread > 0 ? <View style={s.dot} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flex: 1, flexDirection: "row", backgroundColor: colors.surface },
  sidebar: { width: 250, borderRightWidth: 1, borderRightColor: colors.border, paddingVertical: spacing.xl, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSecondary, gap: 2 },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.xl },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  brandTag: { fontFamily: fonts.bold, fontSize: fontSize.sm, color: colors.brand, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, letterSpacing: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md, minHeight: 44 },
  itemActive: { backgroundColor: colors.accentSoft },
  itemText: { flex: 1, fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  itemTextActive: { color: colors.brand, fontFamily: fonts.semibold },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.onError },
  content: { flex: 1, backgroundColor: colors.surface },
  topbar: { backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, minHeight: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  chipActive: { backgroundColor: colors.brand },
  chipText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },
}));
