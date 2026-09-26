import React from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ArrowDown, TrendUp, CheckCircle, CircleIcon, Clock } from "phosphor-react-native";

import { api } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { CategoryIcon } from "@/src/components/category-icon";
import { H2, Muted, Button, Badge, Loader, eur, statusMeta } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

const STEPS = [
  { key: "in_lavorazione", label: "Richiesta in lavorazione" },
  { key: "concluso", label: "Contratto completato" },
];

export default function OfferDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: offer, isLoading } = useQuery({ queryKey: ["offer", id], queryFn: () => api(`/offers/${id}`) });

  if (isLoading || !offer) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader title="Offerta" />
        <Loader />
      </View>
    );
  }

  const cc = categoryColors(colors, offer.category);
  const contract = offer.contract;
  const monthlySaving = (offer.current_monthly - offer.proposed_monthly).toFixed(2);
  const currentStepIndex = contract ? STEPS.findIndex((st) => st.key === contract.status) : -1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="La nostra proposta" subtitle={cc.label} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["2xl"] }} showsVerticalScrollIndicator={false}>
        <View style={s.provider}>
          <View style={[s.icon, { backgroundColor: cc.soft }]}>
            <CategoryIcon category={offer.category} color={cc.accent} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <H2>{offer.provider_name}</H2>
            <Muted>Proposta personalizzata da Bolty</Muted>
          </View>
        </View>

        {/* Comparison */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={s.compareCurrent}>
            <Muted>La tua situazione attuale</Muted>
            <Text style={s.currentValue}>{eur(offer.current_monthly)} <Text style={s.perMonth}>/mese</Text></Text>
          </View>

          <View style={s.arrowWrap}>
            <View style={s.arrowCircle}>
              <ArrowDown size={20} color={colors.onBrandPrimary} weight="bold" />
            </View>
          </View>

          <View style={[s.compareProposed, { backgroundColor: colors.brand }]}>
            <Text style={s.proposedLabel}>La nostra proposta</Text>
            <Text style={s.proposedValue}>{eur(offer.proposed_monthly)} <Text style={s.proposedPer}>/mese</Text></Text>
            <View style={s.savingPill}>
              <TrendUp size={16} color={colors.brand} weight="bold" />
              <Text style={s.savingPillText}>Risparmi € {monthlySaving}/mese</Text>
            </View>
          </View>
        </Animated.View>

        <View style={[s.annualSaving, { backgroundColor: cc.soft }]}>
          <Text style={s.annualLabel}>Risparmio stimato</Text>
          <Text style={[s.annualValue, { color: cc.accent }]}>{eur(offer.annual_savings)}</Text>
          <Text style={s.annualLabel}>ogni anno</Text>
        </View>

        {offer.notes ? (
          <View style={s.notes}>
            <Muted>{offer.notes}</Muted>
          </View>
        ) : null}

        {/* Contract state or CTA */}
        {contract ? (
          <View style={{ marginTop: spacing.xl }}>
            <View style={s.headRow}>
              <H2>Stato della pratica</H2>
              <Badge label={statusMeta(contract.status).label} tone={statusMeta(contract.status).tone} />
            </View>
            <View style={s.timeline}>
              {STEPS.map((step, i) => {
                const done = currentStepIndex >= i;
                const isCurrent = currentStepIndex === i;
                return (
                  <View key={step.key} style={s.timelineRow}>
                    {done ? (
                      <CheckCircle size={26} color={colors.success} weight="fill" />
                    ) : isCurrent ? (
                      <Clock size={26} color={colors.warning} weight="fill" />
                    ) : (
                      <CircleIcon size={26} color={colors.borderStrong} />
                    )}
                    <Text style={[s.timelineText, { color: done ? colors.onSurface : colors.muted }]}>{step.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <Button
            title="Voglio questa offerta"
            onPress={() => router.push(`/contract/${offer.offer_id}`)}
            style={{ marginTop: spacing.xl }}
            testID="want-offer"
          />
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  provider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xl },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  compareCurrent: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  currentValue: { fontFamily: fonts.semibold, fontSize: fontSize["3xl"], color: colors.muted, marginTop: spacing.xs, textDecorationLine: "line-through" },
  perMonth: { fontFamily: fonts.regular, fontSize: fontSize.base, textDecorationLine: "none" },
  arrowWrap: { alignItems: "center", marginVertical: -14, zIndex: 2 },
  arrowCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.surface },
  compareProposed: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  proposedLabel: { fontFamily: fonts.medium, fontSize: fontSize.base, color: "rgba(255,255,255,0.85)" },
  proposedValue: { fontFamily: fonts.bold, fontSize: fontSize["4xl"], color: "#FFFFFF", marginTop: spacing.xs },
  proposedPer: { fontFamily: fonts.regular, fontSize: fontSize.lg, color: "rgba(255,255,255,0.85)" },
  savingPill: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: "#FFFFFF", borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.lg },
  savingPillText: { color: colors.brand, fontFamily: fonts.semibold, fontSize: fontSize.base },
  annualSaving: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", marginTop: spacing.lg },
  annualLabel: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary },
  annualValue: { fontFamily: fonts.bold, fontSize: fontSize["4xl"], marginVertical: spacing.xs },
  notes: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  timeline: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.lg },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  timelineText: { fontFamily: fonts.medium, fontSize: fontSize.lg },
}));
