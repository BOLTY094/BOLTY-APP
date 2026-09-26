import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  User,
  Bell,
  Gift,
  Lifebuoy,
  ShieldCheck,
  FileText,
  SignOut,
  Trash,
  CaretRight,
  AppleLogo,
  GoogleLogo,
  EnvelopeSimple,
} from "phosphor-react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/toast";
import { openLegal } from "@/src/legal";
import { H1, Muted } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

export default function Profilo() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { show } = useToast();

  const { data: notifs = [] } = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications") });
  const unread = (notifs as any[]).filter((n) => !n.read).length;

  const initials = (user?.name || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const provider = user?.auth_provider === "apple" ? "Apple" : user?.auth_provider === "google" ? "Google" : "Email e password";
  const ProviderIcon = user?.auth_provider === "apple" ? AppleLogo : user?.auth_provider === "google" ? GoogleLogo : EnvelopeSimple;

  const open = (kind: "privacy" | "terms") => openLegal(kind).catch(() => show("Impossibile aprire la pagina", "error"));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing["3xl"], paddingHorizontal: spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <H1 style={{ marginBottom: spacing.lg }}>Profilo</H1>

      {/* Identity card */}
      <View style={s.card} testID="profile-card">
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} testID="profile-name">{user?.name}</Text>
          {user?.email ? <Muted numberOfLines={1}>{user.email}</Muted> : <Muted>Email nascosta (Apple)</Muted>}
          <View style={s.providerRow}>
            <ProviderIcon size={14} color={colors.muted} weight="fill" />
            <Muted style={{ fontSize: fontSize.sm }}>Accesso con {provider}</Muted>
          </View>
        </View>
      </View>

      {/* Account */}
      <Text style={s.sectionLabel}>Account</Text>
      <View style={s.group}>
        <Item icon={<Bell size={20} color={colors.brand} weight="fill" />} label="Notifiche" badge={unread > 0 ? String(unread) : undefined} onPress={() => router.push("/notifications")} testID="profile-notifications" />
        <Item icon={<Gift size={20} color={colors.brand} weight="fill" />} label="Invita e Guadagna" onPress={() => router.push("/referral")} testID="profile-referral" />
      </View>

      {/* Support & legal */}
      <Text style={s.sectionLabel}>Assistenza e informazioni</Text>
      <View style={s.group}>
        <Item icon={<Lifebuoy size={20} color={colors.brand} weight="fill" />} label="Assistenza" sub="Scrivici, rispondiamo entro 2 giorni" onPress={() => router.push("/support")} testID="profile-support" />
        <Item icon={<ShieldCheck size={20} color={colors.brand} weight="fill" />} label="Privacy Policy" onPress={() => open("privacy")} testID="profile-privacy" />
        <Item icon={<FileText size={20} color={colors.brand} weight="fill" />} label="Termini di servizio" onPress={() => open("terms")} last testID="profile-terms" />
      </View>

      {/* Session */}
      <Text style={s.sectionLabel}>Sessione</Text>
      <View style={s.group}>
        <Item icon={<SignOut size={20} color={colors.onSurface} weight="regular" />} label="Esci" onPress={logout} last testID="profile-logout" />
      </View>

      {/* Danger zone */}
      <Pressable
        style={({ pressed }) => [s.danger, pressed && { opacity: 0.9 }]}
        onPress={() => router.push("/delete-account")}
        testID="profile-delete-account"
      >
        <Trash size={20} color={colors.error} weight="fill" />
        <View style={{ flex: 1 }}>
          <Text style={s.dangerTitle}>Elimina account</Text>
          <Muted style={{ fontSize: fontSize.sm }}>Rimuove definitivamente account e dati personali</Muted>
        </View>
        <CaretRight size={18} color={colors.error} weight="bold" />
      </Pressable>

      <Muted style={{ textAlign: "center", marginTop: spacing.xl, fontSize: fontSize.sm }}>Bolty v1.1.0</Muted>
    </ScrollView>
  );
}

function Item({ icon, label, sub, badge, onPress, last, testID }: { icon: React.ReactNode; label: string; sub?: string; badge?: string; onPress: () => void; last?: boolean; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.item, !last && s.itemBorder, pressed && { backgroundColor: colors.surfaceTertiary }]} testID={testID}>
      <View style={s.itemIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.itemLabel}>{label}</Text>
        {sub ? <Muted style={{ fontSize: fontSize.sm }}>{sub}</Muted> : null}
      </View>
      {badge ? (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <CaretRight size={18} color={colors.muted} weight="bold" />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { flexDirection: "row", alignItems: "center", gap: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.brand },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  sectionLabel: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: spacing.xs },
  group: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  itemLabel: { fontFamily: fonts.medium, fontSize: fontSize.lg, color: colors.onSurface },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.onError },
  danger: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xl, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.surfaceSecondary },
  dangerTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.error },
}));
