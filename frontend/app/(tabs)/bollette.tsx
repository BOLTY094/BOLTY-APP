import React, { useState } from "react";
import { View, Text, FlatList, Pressable, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "phosphor-react-native";

import { api } from "@/src/api";
import { H1, Muted, Body, Badge, EmptyState, Loader, eur, statusMeta } from "@/src/components/ui";
import { CategoryIcon } from "@/src/components/category-icon";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

const FILTERS = [
  { key: "all", label: "Tutte" },
  { key: "luce", label: "Luce" },
  { key: "gas", label: "Gas" },
  { key: "telefonia", label: "Telefonia" },
];

const EMPTY_IMG = "https://images.unsplash.com/photo-1645097114684-28afb6d41c8d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2OTV8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGZvbGRlciUyMHBhcGVyJTIwbWluaW1hbCUyMDNkfGVufDB8fHx8MTc5MDM2OTAyMnww&ixlib=rb-4.1.0&q=85";

export default function Bollette() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState("all");

  const { data: bills = [], isLoading, refetch, isRefetching } = useQuery({ queryKey: ["bills"], queryFn: () => api("/bills") });
  const list = (bills as any[]).filter((b) => filter === "all" || b.category === filter);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <H1>Le mie bollette</H1>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
          style={s.chipsScroll}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[s.chip, active ? s.chipActive : s.chipInactive]}
                testID={`filter-${f.key}`}
              >
                <Text style={[s.chipText, { color: active ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.bill_id}
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.md, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <EmptyState
              image={EMPTY_IMG}
              title="Nessuna bolletta"
              subtitle="Carica la tua prima bolletta e scopri quanto puoi risparmiare."
              testID="bollette-empty"
            />
          }
          renderItem={({ item }) => {
            const cc = categoryColors(colors, item.category);
            const st = statusMeta(item.status);
            const date = new Date(item.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
            return (
              <Pressable style={s.row} onPress={() => router.push(`/bill/${item.bill_id}`)} testID={`bill-${item.bill_id}`}>
                <View style={[s.icon, { backgroundColor: cc.soft }]}>
                  <CategoryIcon category={item.category} color={cc.accent} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontFamily: fonts.medium, color: colors.onSurface }}>{cc.label} · {item.extracted?.fornitore || "—"}</Body>
                  <Muted>{date} · {eur(item.analysis?.spesa_attuale_mese)}/mese</Muted>
                </View>
                <Badge label={st.label} tone={st.tone} />
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        style={[s.fab, { bottom: spacing.lg }]}
        onPress={() => router.push("/upload")}
        testID="bollette-fab"
      >
        <Plus size={22} color={colors.onBrandPrimary} weight="bold" />
        <Text style={s.fabText}>Carica nuova</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.surface },
  chipsScroll: { marginTop: spacing.md, marginHorizontal: -spacing.xl },
  chipsRow: { gap: spacing.sm, paddingHorizontal: spacing.xl },
  chip: { height: 36, borderRadius: radius.pill, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipInactive: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: fonts.medium, fontSize: fontSize.base },
  row: {
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
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  fab: {
    position: "absolute",
    right: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  fabText: { color: colors.onBrandPrimary, fontFamily: fonts.semibold, fontSize: fontSize.base },
}));
