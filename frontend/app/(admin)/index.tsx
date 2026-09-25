import React from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SignOut, Receipt, Tray, Tag, FileText, CheckCircle, TrendUp, CurrencyEur } from "phosphor-react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { H1, H2, Muted, Loader, eur } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

export default function AdminDashboard() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => api("/admin/dashboard") });
  const st = data?.stats;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <View>
          <H1>Dashboard</H1>
          <Muted>Pannello amministratore</Muted>
        </View>
        <Pressable style={s.iconBtn} onPress={logout} testID="admin-logout">
          <SignOut size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {isLoading || !st ? (
        <Loader />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.lg }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
        >
          {/* Value generated highlight */}
          <View style={[s.valueCard, { backgroundColor: colors.brand }]}>
            <View style={s.valueIcon}>
              <CurrencyEur size={24} color={colors.brand} weight="bold" />
            </View>
            <Text style={s.valueLabel}>Valore generato</Text>
            <Text style={s.valueBig}>{eur(st.valore_generato)}</Text>
            <Text style={s.valueSub}>risparmio annuo dai contratti conclusi</Text>
          </View>

          <View style={s.grid}>
            <Tile icon={<Receipt size={22} color={colors.info === "#E8EFEA" ? colors.brandPrimary : colors.brandPrimary} weight="fill" />} label="Nuove bollette" value={st.nuove_bollette} onPress={() => router.push("/(admin)/queue")} testID="tile-nuove" />
            <Tile icon={<Tray size={22} color={colors.warning} weight="fill" />} label="Da analizzare" value={st.da_analizzare} onPress={() => router.push("/(admin)/queue")} testID="tile-da-analizzare" />
            <Tile icon={<Tag size={22} color={colors.brandPrimary} weight="fill" />} label="Offerte proposte" value={st.offerte_proposte} testID="tile-offerte" />
            <Tile icon={<FileText size={22} color={colors.brandPrimary} weight="fill" />} label="Contratti" value={st.contratti} onPress={() => router.push("/(admin)/contratti")} testID="tile-contratti" />
            <Tile icon={<CheckCircle size={22} color={colors.success} weight="fill" />} label="Conclusi" value={st.contratti_conclusi} testID="tile-conclusi" />
            <Tile icon={<TrendUp size={22} color={colors.brandPrimary} weight="fill" />} label="Bollette analizzate" value={st.bollette_analizzate} testID="tile-analizzate" />
          </View>

          <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Azioni rapide</H2>
          <Pressable style={s.action} onPress={() => router.push("/(admin)/queue")} testID="action-queue">
            <Tray size={22} color={colors.brandPrimary} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={s.actionTitle}>Bollette da analizzare</Text>
              <Muted>Rivedi e proponi un’offerta</Muted>
            </View>
            <View style={s.count}><Text style={s.countText}>{st.da_analizzare}</Text></View>
          </Pressable>
          <Pressable style={s.action} onPress={() => router.push("/(admin)/contratti")} testID="action-contratti">
            <FileText size={22} color={colors.brandPrimary} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={s.actionTitle}>Gestisci contratti</Text>
              <Muted>Aggiorna lo stato delle pratiche</Muted>
            </View>
            <View style={s.count}><Text style={s.countText}>{st.contratti}</Text></View>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function Tile({ icon, label, value, onPress, testID }: { icon: React.ReactNode; label: string; value: number; onPress?: () => void; testID?: string }) {
  const s = useStyles();
  const Comp: any = onPress ? Pressable : View;
  return (
    <Comp style={s.tile} onPress={onPress} testID={testID}>
      <View style={s.tileIcon}>{icon}</View>
      <Text style={s.tileValue}>{value}</Text>
      <Muted numberOfLines={1}>{label}</Muted>
    </Comp>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.surface },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  valueCard: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" },
  valueIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  valueLabel: { fontFamily: fonts.medium, fontSize: fontSize.base, color: "rgba(255,255,255,0.85)" },
  valueBig: { fontFamily: fonts.bold, fontSize: fontSize["4xl"], color: "#FFFFFF", marginVertical: spacing.xs },
  valueSub: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: "rgba(255,255,255,0.75)" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.lg },
  tile: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  tileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  tileValue: { fontFamily: fonts.bold, fontSize: fontSize["2xl"], color: colors.onSurface },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  actionTitle: { fontFamily: fonts.medium, fontSize: fontSize.lg, color: colors.onSurface },
  count: { minWidth: 32, height: 32, paddingHorizontal: spacing.sm, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  countText: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.brandPrimary },
}));
