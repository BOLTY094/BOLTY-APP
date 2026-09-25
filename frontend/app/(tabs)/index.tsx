import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Bell, SignOut, Lightning, Flame, WifiHigh, ArrowRight, Gift, ChartLineUp, TrendDown, TrendUp } from "phosphor-react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BoltyWordmark, BoltyBolt } from "@/src/components/logo";
import { H1, H2, Body, Muted, eur, statusMeta, Badge } from "@/src/components/ui";
import { CategoryIcon } from "@/src/components/category-icon";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

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
  const { data: market } = useQuery({ queryKey: ["market"], queryFn: () => api("/market/overview") });
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
          <View style={s.heroBolt}>
            <BoltyBolt size={130} />
          </View>
          <View style={s.heroContent}>
            <H1 style={s.heroTitle}>La tua bolletta.{"\n"}Il tuo risparmio.</H1>
            <Text style={s.heroSub}>Carica la tua bolletta e scopri se puoi spendere meno.</Text>
            <Pressable
              style={({ pressed }) => [s.heroCta, pressed && { opacity: 0.9 }]}
              onPress={() => router.push("/upload")}
              testID="analyze-cta"
            >
              <Text style={s.heroCtaText}>Analizza la mia bolletta</Text>
              <ArrowRight size={20} color={colors.onAccent} weight="bold" />
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

      {/* Market overview */}
      <View style={s.section}>
        <Pressable style={({ pressed }) => [s.market, pressed && { opacity: 0.92 }]} onPress={() => router.push("/market")} testID="home-market">
          <View style={s.marketHead}>
            <View style={s.marketIcon}>
              <ChartLineUp size={22} color={colors.onBrand} weight="bold" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.marketTitle}>Andamento energia e gas</Text>
              <Text style={s.marketSub}>Prezzi di mercato e consigli aggiornati</Text>
            </View>
            <ArrowRight size={20} color={colors.onBrand} weight="bold" />
          </View>
          {market ? (
            <View style={s.marketStats}>
              <MarketStat label="Luce · PUN" value={market.luce.current} unit={market.luce.unit} delta={market.luce.delta_month_pct} testID="home-market-luce" />
              <View style={s.marketDivider} />
              <MarketStat label="Gas · PSV" value={market.gas.current} unit={market.gas.unit} delta={market.gas.delta_month_pct} testID="home-market-gas" />
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Referral promo */}
      <View style={s.section}>
        <Pressable style={s.referral} onPress={() => router.push("/referral")} testID="home-referral">
          <View style={s.referralIcon}>
            <Gift size={24} color={colors.brand} weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.referralTitle}>Invita e Guadagna</Text>
            <Text style={s.referralSub}>Guadagni un premio per ogni amico che attiva un’offerta.</Text>
          </View>
          <ArrowRight size={20} color={colors.brand} weight="bold" />
        </Pressable>
      </View>
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

function MarketStat({ label, value, unit, delta, testID }: { label: string; value: number; unit: string; delta: number; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const down = delta < -0.5;
  const up = delta > 0.5;
  return (
    <View style={{ flex: 1 }} testID={testID}>
      <Text style={s.marketStatLabel}>{label}</Text>
      <Text style={s.marketStatValue}>
        {value} <Text style={s.marketStatUnit}>{unit}</Text>
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {down ? <TrendDown size={14} color={colors.accent} weight="bold" /> : up ? <TrendUp size={14} color={colors.error} weight="bold" /> : null}
        <Text style={[s.marketStatDelta, up && { color: colors.error }]}>
          {delta > 0 ? "+" : ""}{delta.toLocaleString("it-IT")}% sul mese
        </Text>
      </View>
    </View>
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
  hero: { backgroundColor: colors.brand, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end", minHeight: 300 },
  heroBolt: { position: "absolute", right: spacing.md, top: spacing.md },
  heroContent: { padding: spacing.xl, paddingTop: spacing["3xl"] + spacing.xl },
  heroTitle: { color: colors.onBrand, fontSize: fontSize["2xl"], fontFamily: fonts.semibold, lineHeight: 32 },
  heroSub: { color: "rgba(255,255,255,0.8)", fontFamily: fonts.regular, fontSize: fontSize.base, marginTop: spacing.sm, marginBottom: spacing.lg },
  heroCta: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  heroCtaText: { color: colors.onAccent, fontFamily: fonts.semibold, fontSize: fontSize.lg },
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
  referral: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.accent },
  referralIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  referralTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.brand },
  referralSub: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, marginTop: 2 },
  market: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.lg },
  marketHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  marketIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  marketTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onBrand },
  marketSub: { fontFamily: fonts.regular, fontSize: fontSize.base, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  marketStats: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)" },
  marketDivider: { width: 1, height: 44, backgroundColor: "rgba(255,255,255,0.12)" },
  marketStatLabel: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: "rgba(255,255,255,0.7)" },
  marketStatValue: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onBrand, marginTop: 2 },
  marketStatUnit: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: "rgba(255,255,255,0.7)" },
  marketStatDelta: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.accent },
}));
