import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Lightning, Flame, WifiHigh, Plus } from "phosphor-react-native";

import { api } from "@/src/api";
import { H1, Body, Muted, Badge, eur, statusMeta } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

const CATS = [
  { key: "luce", label: "Luce", Icon: Lightning },
  { key: "gas", label: "Gas", Icon: Flame },
  { key: "telefonia", label: "Telefonia", Icon: WifiHigh },
];

export default function Forniture() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: bills = [] } = useQuery({ queryKey: ["bills"], queryFn: () => api("/bills") });
  const { data: offers = [] } = useQuery({ queryKey: ["offers"], queryFn: () => api("/offers") });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <H1>Le mie forniture</H1>
        <Muted>Luce, Gas e Telefonia in un unico posto.</Muted>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        {CATS.map((c) => {
          const cc = categoryColors(colors, c.key);
          const catBills = (bills as any[]).filter((b) => b.category === c.key);
          const catOffers = (offers as any[]).filter((o) => o.category === c.key);
          const active = catOffers.find((o) => o.status === "accettata");
          const lastBill = catBills[0];
          return (
            <View key={c.key} style={s.card} testID={`fornitura-${c.key}`}>
              <View style={s.cardHead}>
                <View style={[s.icon, { backgroundColor: cc.accent }]}>
                  <c.Icon size={22} color={cc.on} weight="fill" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{c.label}</Text>
                  <Muted>{catBills.length} bollette · {catOffers.length} offerte</Muted>
                </View>
              </View>

              {active ? (
                <View style={[s.activeBox, { backgroundColor: cc.soft }]}>
                  <View style={{ flex: 1 }}>
                    <Muted>Fornitura attiva</Muted>
                    <Body style={{ fontFamily: fonts.medium, color: colors.onSurface }}>{active.provider_name}</Body>
                    <Text style={[s.price, { color: cc.accent }]}>{eur(active.proposed_monthly)} / mese</Text>
                  </View>
                  {active.contract ? <Badge label={statusMeta(active.contract.status).label} tone={statusMeta(active.contract.status).tone} /> : null}
                </View>
              ) : lastBill ? (
                <View style={s.activeBox}>
                  <View style={{ flex: 1 }}>
                    <Muted>Ultima bolletta</Muted>
                    <Body style={{ fontFamily: fonts.medium, color: colors.onSurface }}>{lastBill.extracted?.fornitore || "—"}</Body>
                    <Text style={[s.price, { color: colors.onSurface }]}>{lastBill.extracted?.intestatario || statusMeta(lastBill.status).label}</Text>
                  </View>
                  <Badge label={statusMeta(lastBill.status).label} tone={statusMeta(lastBill.status).tone} />
                </View>
              ) : (
                <Muted style={{ marginTop: spacing.sm }}>Nessuna fornitura ancora. Carica una bolletta per iniziare.</Muted>
              )}

              <Pressable style={s.addBtn} onPress={() => router.push(`/upload?category=${c.key}`)} testID={`fornitura-add-${c.key}`}>
                <Plus size={18} color={colors.brandPrimary} weight="bold" />
                <Text style={s.addText}>Carica bolletta {c.label}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.surface },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  activeBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceTertiary },
  price: { fontFamily: fonts.semibold, fontSize: fontSize.lg, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  addText: { color: colors.brandPrimary, fontFamily: fonts.medium, fontSize: fontSize.base },
}));
