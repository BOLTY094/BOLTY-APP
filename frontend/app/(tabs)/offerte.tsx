import React from "react";
import { View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { TrendUp } from "phosphor-react-native";

import { api } from "@/src/api";
import { H1, Muted, Body, Badge, EmptyState, Loader, eur, statusMeta } from "@/src/components/ui";
import { CategoryIcon } from "@/src/components/category-icon";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

const EMPTY_IMG = "https://images.unsplash.com/photo-1645097114684-28afb6d41c8d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2OTV8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGZvbGRlciUyMHBhcGVyJTIwbWluaW1hbCUyMDNkfGVufDB8fHx8MTc5MDM2OTAyMnww&ixlib=rb-4.1.0&q=85";

export default function Offerte() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: offers = [], isLoading, refetch, isRefetching } = useQuery({ queryKey: ["offers"], queryFn: () => api("/offers") });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <H1>Le mie offerte</H1>
        <Muted>Proposte analizzate, accettate e stato pratica.</Muted>
      </View>

      {isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={offers as any[]}
          keyExtractor={(item) => item.offer_id}
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing["2xl"] }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <EmptyState
              image={EMPTY_IMG}
              title="Nessuna offerta"
              subtitle="Dopo aver caricato una bolletta, riceverai qui la nostra proposta di risparmio."
              testID="offerte-empty"
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => {
            const cc = categoryColors(colors, item.category);
            const status = item.contract ? item.contract.status : item.status;
            const st = statusMeta(status);
            return (
              <Pressable style={s.card} onPress={() => router.push(`/offer/${item.offer_id}`)} testID={`offer-${item.offer_id}`}>
                <View style={s.cardHead}>
                  <View style={[s.icon, { backgroundColor: cc.soft }]}>
                    <CategoryIcon category={item.category} color={cc.accent} size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontFamily: fonts.medium, color: colors.onSurface }}>{item.provider_name}</Body>
                    <Muted>{cc.label}</Muted>
                  </View>
                  <Badge label={st.label} tone={st.tone} />
                </View>
                <View style={s.savingBox}>
                  <TrendUp size={20} color={colors.success} weight="bold" />
                  <Text style={s.savingText}>Risparmio stimato {eur(item.annual_savings)} / anno</Text>
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
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  savingBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md },
  savingText: { color: colors.onBrandTertiary, fontFamily: fonts.medium, fontSize: fontSize.base },
}));
