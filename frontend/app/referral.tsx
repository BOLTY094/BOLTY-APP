import React from "react";
import { View, Text, ScrollView, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Gift, ShareNetwork, UserPlus, CheckCircle } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { H2, Body, Muted, Button, Loader } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

export default function Referral() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { show } = useToast();

  const { data, isLoading } = useQuery({ queryKey: ["referral"], queryFn: () => api("/referral") });

  const onShare = async () => {
    if (!data?.code) return;
    try {
      await Share.share({
        message: `Passa a Bolty e risparmia sulle bollette! Usa il mio codice invito ${data.code} quando ti registri. ⚡`,
      });
    } catch {
      show("Condivisione non riuscita", "error");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Invita un amico" />
      {isLoading || !data ? (
        <Loader />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["2xl"] }} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <View style={[s.hero, { backgroundColor: colors.brand }]}>
            <View style={s.giftIcon}>
              <Gift size={30} color={colors.brand} weight="fill" />
            </View>
            <Text style={s.heroTitle} testID="referral-hero">Invita un amico</Text>
            <Text style={s.heroSub}>e regalagli l’esperienza di risparmiare sulle sue fatture.</Text>
          </View>

          {/* Code */}
          <Muted style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>Il tuo codice invito</Muted>
          <View style={s.codeBox}>
            <Text style={s.code} testID="referral-code">{data.code}</Text>
          </View>
          <Button
            title="Condividi il codice"
            onPress={onShare}
            icon={<ShareNetwork size={20} color={colors.onBrandPrimary} weight="bold" />}
            style={{ marginTop: spacing.md }}
            testID="referral-share"
          />

          {/* Stats */}
          <View style={s.statsRow}>
            <View style={s.stat}>
              <UserPlus size={22} color={colors.brandPrimary} weight="fill" />
              <Text style={s.statValue}>{data.invited_count}</Text>
              <Muted>Invitati</Muted>
            </View>
            <View style={s.stat}>
              <CheckCircle size={22} color={colors.success} weight="fill" />
              <Text style={s.statValue}>{data.activated_count}</Text>
              <Muted>Attivati</Muted>
            </View>
          </View>

          {/* How it works */}
          <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Come funziona</H2>
          <Step n={1} title="Condividi il codice" text="Invia il tuo codice invito ad amici e parenti." />
          <Step n={2} title="Il tuo amico si registra" text="Inserisce il codice al momento della registrazione." />
          <Step n={3} title="Il tuo amico risparmia" text="Un consulente analizza la sua bolletta e gli propone un’offerta più conveniente." />

          {/* Rewards list */}
          {data.rewards?.length > 0 ? (
            <>
              <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Amici che hanno attivato un’offerta</H2>
              {data.rewards.map((r: any) => {
                const date = new Date(r.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
                return (
                  <View key={r.reward_id} style={s.rewardRow} testID={`reward-${r.reward_id}`}>
                    <View style={s.rewardIcon}>
                      <CheckCircle size={18} color={colors.success} weight="fill" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Body style={{ fontFamily: fonts.medium, color: colors.onSurface }}>{r.referred_name || "Un amico"}</Body>
                      <Muted>{date}</Muted>
                    </View>
                  </View>
                );
              })}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  const s = useStyles();
  return (
    <View style={s.step}>
      <View style={s.stepNum}>
        <Text style={s.stepNumText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.stepTitle}>{title}</Text>
        <Muted style={{ marginTop: 2 }}>{text}</Muted>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  hero: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  giftIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  heroTitle: { fontFamily: fonts.bold, fontSize: fontSize["3xl"], color: "#FFFFFF" },
  heroSub: { fontFamily: fonts.regular, fontSize: fontSize.base, color: "rgba(255,255,255,0.85)", textAlign: "center", marginTop: spacing.xs },
  codeBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, borderStyle: "dashed", paddingVertical: spacing.lg, alignItems: "center" },
  code: { fontFamily: fonts.bold, fontSize: fontSize["3xl"], color: colors.brandPrimary, letterSpacing: 4 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  stat: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: spacing.xs },
  statValue: { fontFamily: fonts.bold, fontSize: fontSize.xl, color: colors.onSurface },
  step: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg, alignItems: "flex-start" },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.brandPrimary },
  stepTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  rewardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
}));
