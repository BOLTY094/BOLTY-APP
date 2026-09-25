import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Bell, SignOut, Lightning, Flame, WifiHigh, ArrowRight } from "phosphor-react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BoltyWordmark } from "@/src/components/logo";
import { H1, H2, Body, Muted, eur, statusMeta, Badge } from "@/src/components/ui";
import { CategoryIcon } from "@/src/components/category-icon";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1635776062043-223faf322554?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTZ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMHNvZnQlMjB3YXJtJTIwbGlnaHQlMjBncmFkaWVudCUyMGJhY2tncm91bmR8ZW58MHx8fHwxNzkwMzY5MDE2fDA&ixlib=rb-4.1.0&q=85";

const CATS = [
  { key: "luce", label: "Luce", Icon: Lightning },
  { key: "gas", label: "Gas", Icon: Flame },
  { key: "telefonia", label: "Telefonia", Icon: WifiHigh },
];

export default function Home() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();

  const { data: bills = [] } = useQuery({ queryKey: ["bills"], queryFn: () => api("/bills") });
  const { data: notifs = [] } = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications") });
  const unread = (notifs as any[]).filter((n) => !n.read).length;
  const recent = (bills as any[]).slice(0, 3);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingBottom: spacing["2xl"] }}
      showsVerticalScrollIndicator={false}
    >
      {/* Top bar */}
      <View style={[s.topbar, { paddingTop: insets.top + spacing.sm }]}>
        <View>
          <BoltyWordmark size={24} />
          <Muted style={{ marginTop: 2 }}>Ciao, {user?.name?.split(" ")[0] || "utente"} 👋</Muted>
        </View>
        <View style={s.topActions}>
          <Pressable style={s.iconBtn} onPress={() => router.push("/notifications")} testID="home-notifications">
            <Bell size={22} color={colors.onSurface} weight="regular" />
            {unread > 0 ? <View style={s.dot} /> : null}
          </Pressable>
          <Pressable style={s.iconBtn} onPress={logout} testID="home-logout">
            <SignOut size={22} color={colors.onSurface} weight="regular" />
          </Pressable>
        </View>
      </View>

      {/* Hero */}
      <Animated.View entering={FadeInDown.duration(400)} style={s.heroWrap}>
        <View style={s.hero}>
          <Image source={{ uri: HERO }} style={s.heroImg} contentFit="cover" />
          <LinearGradient
            colors={["rgba(28,28,30,0.05)", "rgba(28,28,30,0.75)"]}
            style={s.heroScrim}
          />
          <View style={s.heroContent}>
            <H1 style={s.heroTitle}>La tua bolletta.{"\n"}Il tuo risparmio.</H1>
            <Text style={s.heroSub}>Carica la tua bolletta e scopri se puoi spendere meno.</Text>
            <Pressable
              style={({ pressed }) => [s.heroCta, pressed && { opacity: 0.9 }]}
              onPress={() => router.push("/upload")}
              testID="analyze-cta"
            >
              <Text style={s.heroCtaText}>Analizza la mia bolletta</Text>
              <ArrowRight size={20} color={colors.onBrandPrimary} weight="bold" />
            </Pressable>
          </View>
        </View>
      </Animated.View>

      {/* Categories */}
      <View style={s.section}>
        <H2 style={{ marginBottom: spacing.md }}>Cosa vuoi analizzare?</H2>
        <View style={s.catRow}>
          {CATS.map((c) => {
            const cc = categoryColors(colors, c.key);
            return (
              <Pressable
                key={c.key}
                style={({ pressed }) => [s.catCard, { backgroundColor: cc.soft }, pressed && { opacity: 0.9 }]}
                onPress={() => router.push(`/upload?category=${c.key}`)}
                testID={`cat-${c.key}`}
              >
                <View style={[s.catIcon, { backgroundColor: cc.accent }]}>
                  <c.Icon size={22} color={cc.on} weight="fill" />
                </View>
                <Text style={s.catLabel}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Recent bills */}
      {recent.length > 0 ? (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <H2>Le tue ultime bollette</H2>
            <Pressable onPress={() => router.push("/(tabs)/bollette")} hitSlop={8}>
              <Text style={s.link}>Vedi tutte</Text>
            </Pressable>
          </View>
          {recent.map((b: any) => {
            const cc = categoryColors(colors, b.category);
            const st = statusMeta(b.status);
            return (
              <Pressable key={b.bill_id} style={s.billRow} onPress={() => router.push(`/bill/${b.bill_id}`)} testID={`home-bill-${b.bill_id}`}>
                <View style={[s.billIcon, { backgroundColor: cc.soft }]}>
                  <CategoryIcon category={b.category} color={cc.accent} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontFamily: fonts.medium, color: colors.onSurface }}>{cc.label} · {b.extracted?.fornitore || "—"}</Body>
                  <Muted>{eur(b.analysis?.spesa_attuale_mese)} / mese</Muted>
                </View>
                <Badge label={st.label} tone={st.tone} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={s.section}>
          <View style={s.tipCard}>
            <Body style={{ color: colors.onBrandTertiary }}>
              💡 Bastano 2 minuti: carica una foto o il PDF della tua bolletta e ricevi un’analisi gratuita.
            </Body>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  topbar: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.brandPrimary, letterSpacing: 0.5 },
  topActions: { flexDirection: "row", gap: spacing.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { position: "absolute", top: 8, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.error, borderWidth: 1.5, borderColor: colors.surfaceSecondary },
  heroWrap: { paddingHorizontal: spacing.xl, marginTop: spacing.xs },
  hero: { height: 300, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end" },
  heroImg: { ...StyleSheetAbsolute() },
  heroScrim: { ...StyleSheetAbsolute() },
  heroContent: { padding: spacing.xl },
  heroTitle: { color: "#FFFFFF", fontSize: fontSize["2xl"], fontFamily: fonts.semibold, lineHeight: 32 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontFamily: fonts.regular, fontSize: fontSize.base, marginTop: spacing.sm, marginBottom: spacing.lg },
  heroCta: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  heroCtaText: { color: colors.onBrandPrimary, fontFamily: fonts.semibold, fontSize: fontSize.lg },
  section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  link: { color: colors.brandPrimary, fontFamily: fonts.medium, fontSize: fontSize.base },
  catRow: { flexDirection: "row", gap: spacing.md },
  catCard: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: "center", gap: spacing.sm },
  catIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  catLabel: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurface },
  billRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  billIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  tipCard: { backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg },
}));

function StyleSheetAbsolute() {
  return { position: "absolute" as const, left: 0, right: 0, top: 0, bottom: 0 };
}
