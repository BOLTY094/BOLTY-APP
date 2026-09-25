import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Svg, { Rect, Text as SvgText, Line } from "react-native-svg";
import { Lightning, Flame, TrendDown, TrendUp, Minus, Info, Lightbulb } from "phosphor-react-native";

import { api } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { H2, Body, Muted, Loader } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, ThemeColors } from "@/src/theme";

type Block = {
  current: number;
  unit: string;
  previous: number;
  delta_month_pct: number;
  delta_year_pct: number;
  trend: string;
  series: { month: string; value: number }[];
  household_unit: string;
  household_price: string;
  note: string;
};

export default function Market() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"luce" | "gas">("luce");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["market"],
    queryFn: () => api("/market/overview"),
  });

  const block: Block | undefined = data?.[tab];
  const accent = tab === "luce" ? colors.luce : colors.gas;
  const soft = tab === "luce" ? colors.luceSoft : colors.gasSoft;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Andamento energia e gas" subtitle="Panoramica del mercato" testID="market-header" />
      {isLoading || !data ? (
        <Loader />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["2xl"] }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
        >
          {/* Segmented control */}
          <View style={s.segment}>
            <SegBtn active={tab === "luce"} label="Luce" onPress={() => setTab("luce")} Icon={Lightning} color={colors.luce} testID="market-tab-luce" />
            <SegBtn active={tab === "gas"} label="Gas" onPress={() => setTab("gas")} Icon={Flame} color={colors.gas} testID="market-tab-gas" />
          </View>

          {block ? (
            <>
              {/* Headline card */}
              <View style={[s.headline, { backgroundColor: soft }]}>
                <Muted style={{ color: colors.onSurfaceTertiary }}>{tab === "luce" ? "PUN · prezzo all'ingrosso" : "PSV · prezzo all'ingrosso"}</Muted>
                <View style={s.headlineRow}>
                  <Text style={[s.big, { color: colors.onSurface }]} testID="market-current">
                    {block.current}
                  </Text>
                  <Text style={s.unit}>{block.unit}</Text>
                </View>
                <View style={s.chips}>
                  <DeltaChip label="vs mese prec." value={block.delta_month_pct} colors={colors} />
                  <DeltaChip label="vs anno prec." value={block.delta_year_pct} colors={colors} />
                </View>
                <View style={s.trendRow}>
                  <TrendIcon value={block.delta_month_pct} colors={colors} size={18} />
                  <Text style={[s.trendText, { color: colors.onSurface }]}>Tendenza: {block.trend}</Text>
                </View>
              </View>

              {/* Chart */}
              <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>Ultimi 12 mesi</H2>
              <View style={s.chartCard}>
                <BarChart series={block.series} color={accent} colors={colors} />
              </View>

              {/* Household */}
              <View style={s.infoCard}>
                <View style={[s.infoIcon, { backgroundColor: soft }]}>
                  <Info size={20} color={accent} weight="fill" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.infoTitle}>Per la tua casa</Text>
                  <Body style={{ marginTop: 2 }}>
                    Prezzo energia tipico nelle offerte attuali: <Text style={{ fontFamily: fonts.semibold, color: colors.onSurface }}>{block.household_price} {block.household_unit}</Text>
                  </Body>
                  <Muted style={{ marginTop: spacing.sm }}>{block.note}</Muted>
                </View>
              </View>
            </>
          ) : null}

          {/* Insights */}
          <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Cosa significa per te</H2>
          {(data.insights as { title: string; text: string }[]).map((it, i) => (
            <View key={i} style={s.insight} testID={`market-insight-${i}`}>
              <View style={s.bulb}>
                <Lightbulb size={18} color={colors.brand} weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.insightTitle}>{it.title}</Text>
                <Muted style={{ marginTop: 2 }}>{it.text}</Muted>
              </View>
            </View>
          ))}

          {/* Sources */}
          <View style={s.sources}>
            <Muted style={{ fontSize: fontSize.sm }}>{data.disclaimer}</Muted>
            <Muted style={{ fontSize: fontSize.sm, marginTop: spacing.xs }}>Fonti: {(data.sources as string[]).join(" · ")}</Muted>
            <Muted style={{ fontSize: fontSize.sm, marginTop: spacing.xs }}>Aggiornato al {new Date(data.updated_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}</Muted>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function SegBtn({ active, label, onPress, Icon, color, testID }: { active: boolean; label: string; onPress: () => void; Icon: any; color: string; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[s.segBtn, active && { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} testID={testID}>
      <Icon size={18} color={active ? color : colors.muted} weight="fill" />
      <Text style={[s.segText, active && { color: colors.onSurface }]}>{label}</Text>
    </Pressable>
  );
}

function TrendIcon({ value, colors, size = 14 }: { value: number; colors: ThemeColors; size?: number }) {
  if (value < -0.5) return <TrendDown size={size} color={colors.success} weight="bold" />;
  if (value > 0.5) return <TrendUp size={size} color={colors.error} weight="bold" />;
  return <Minus size={size} color={colors.muted} weight="bold" />;
}

export function DeltaChip({ label, value, colors }: { label: string; value: number; colors: ThemeColors }) {
  const good = value < -0.5;
  const bad = value > 0.5;
  const fg = good ? colors.success : bad ? colors.error : colors.muted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: colors.border }}>
      <TrendIcon value={value} colors={colors} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: fontSize.sm, color: fg }}>
        {value > 0 ? "+" : ""}{value.toLocaleString("it-IT")}%
      </Text>
      <Text style={{ fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted }}>{label}</Text>
    </View>
  );
}

function BarChart({ series, color, colors }: { series: { month: string; value: number }[]; color: string; colors: ThemeColors }) {
  const W = 320;
  const H = 170;
  const padL = 8;
  const padB = 26;
  const padT = 18;
  const max = Math.max(...series.map((p) => p.value));
  const min = Math.min(...series.map((p) => p.value));
  const range = Math.max(max - min, 1);
  const n = series.length;
  const slot = (W - padL * 2) / n;
  const barW = slot * 0.58;
  const chartH = H - padB - padT;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={padL} y1={H - padB} x2={W - padL} y2={H - padB} stroke={colors.border} strokeWidth={1} />
      {series.map((p, i) => {
        const h = 24 + ((p.value - min) / range) * (chartH - 24);
        const x = padL + i * slot + (slot - barW) / 2;
        const y = H - padB - h;
        const isLast = i === n - 1;
        return (
          <React.Fragment key={p.month}>
            <Rect x={x} y={y} width={barW} height={h} rx={5} fill={color} opacity={isLast ? 1 : 0.45} />
            {isLast || i % 2 === 0 ? (
              <SvgText x={x + barW / 2} y={y - 5} fontSize={9} fill={colors.onSurface} textAnchor="middle" fontWeight={isLast ? "700" : "400"}>
                {p.value}
              </SvgText>
            ) : null}
            {i % 2 === 1 || isLast ? (
              <SvgText x={x + barW / 2} y={H - 8} fontSize={9} fill={colors.muted} textAnchor="middle">
                {p.month}
              </SvgText>
            ) : null}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

const useStyles = makeStyles((colors) => ({
  segment: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 4, gap: 4 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 44, borderRadius: radius.sm + 2, borderWidth: 1, borderColor: "transparent" },
  segText: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.muted },
  headline: { borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.lg },
  headlineRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.xs },
  big: { fontFamily: fonts.bold, fontSize: fontSize["4xl"], lineHeight: 46 },
  unit: { fontFamily: fonts.medium, fontSize: fontSize.lg, color: colors.onSurfaceTertiary, marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  trendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  trendText: { fontFamily: fonts.medium, fontSize: fontSize.base },
  chartCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  infoCard: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  infoIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  insight: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md, alignItems: "flex-start" },
  bulb: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  insightTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  sources: { marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider },
}));
