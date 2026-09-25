import React from "react";
import { View, FlatList, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { CaretRight } from "phosphor-react-native";

import { api } from "@/src/api";
import { H1, Muted, Body, Badge, EmptyState, Loader, eur, statusMeta } from "@/src/components/ui";
import { CategoryIcon } from "@/src/components/category-icon";
import { makeStyles, useTheme, spacing, radius, fonts, categoryColors } from "@/src/theme";

export default function AdminQueue() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: bills = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-bills"],
    queryFn: () => api("/admin/bills"),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <H1>Bollette</H1>
        <Muted>Rivedi i dati e proponi un’offerta.</Muted>
      </View>
      {isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={bills as any[]}
          keyExtractor={(item) => item.bill_id}
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.lg }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListEmptyComponent={<EmptyState title="Nessuna bolletta" subtitle="Quando i clienti caricano, le vedrai qui." testID="queue-empty" />}
          renderItem={({ item }) => {
            const cc = categoryColors(colors, item.category);
            const st = statusMeta(item.status);
            const date = new Date(item.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
            return (
              <Pressable style={s.card} onPress={() => router.push(`/admin/bill/${item.bill_id}`)} testID={`queue-bill-${item.bill_id}`}>
                <View style={[s.icon, { backgroundColor: cc.soft }]}>
                  <CategoryIcon category={item.category} color={cc.accent} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontFamily: fonts.medium, color: colors.onSurface }}>{item.user_name || "Cliente"}</Body>
                  <Muted>{cc.label} · {item.extracted?.fornitore || "—"} · {date}</Muted>
                  <Muted style={{ marginTop: 2 }}>{eur(item.analysis?.spesa_attuale_mese)}/mese</Muted>
                </View>
                <View style={{ alignItems: "flex-end", gap: spacing.sm }}>
                  <Badge label={st.label} tone={st.tone} />
                  <CaretRight size={18} color={colors.muted} weight="bold" />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.surface },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  icon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
}));
