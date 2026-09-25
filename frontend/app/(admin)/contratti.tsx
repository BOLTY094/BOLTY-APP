import React from "react";
import { View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { H1, Muted, Body, Badge, EmptyState, Loader, eur, statusMeta } from "@/src/components/ui";
import { CategoryIcon } from "@/src/components/category-icon";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

export default function AdminContratti() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { show } = useToast();

  const { data: contracts = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-contracts"],
    queryFn: () => api("/admin/contracts"),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/admin/contracts/${id}/status`, { method: "PUT", body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contracts"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      show("Stato aggiornato", "success");
    },
    onError: (e: any) => show(e.message || "Errore", "error"),
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <H1>Contratti</H1>
        <Muted>Gestisci lo stato delle pratiche.</Muted>
      </View>
      {isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={contracts as any[]}
          keyExtractor={(item) => item.contract_id}
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.lg }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brandPrimary} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListEmptyComponent={<EmptyState title="Nessun contratto" subtitle="Le richieste accettate dai clienti compaiono qui." testID="contratti-empty" />}
          renderItem={({ item }) => {
            const cc = categoryColors(colors, item.category || item.offer?.category);
            const st = statusMeta(item.status);
            const cd = item.customer_data || {};
            return (
              <View style={s.card} testID={`contract-${item.contract_id}`}>
                <View style={s.cardHead}>
                  <View style={[s.icon, { backgroundColor: cc.soft }]}>
                    <CategoryIcon category={item.category || item.offer?.category || ""} color={cc.accent} size={20} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontFamily: fonts.medium, color: colors.onSurface }}>{cd.nome} {cd.cognome}</Body>
                    <Muted>{item.offer?.provider_name || "—"} · {eur(item.offer?.proposed_monthly)}/mese</Muted>
                  </View>
                  <Badge label={st.label} tone={st.tone} />
                </View>

                <View style={s.detailRow}>
                  <Muted>Telefono</Muted>
                  <Text style={s.detailVal}>{cd.telefono || "—"}</Text>
                </View>
                <View style={s.detailRow}>
                  <Muted>Email</Muted>
                  <Text style={s.detailVal} numberOfLines={1}>{cd.email || "—"}</Text>
                </View>
                <View style={s.detailRow}>
                  <Muted>Indirizzo</Muted>
                  <Text style={s.detailVal} numberOfLines={1}>{cd.indirizzo || "—"}</Text>
                </View>
                {cd.pod ? (
                  <View style={s.detailRow}>
                    <Muted>POD</Muted>
                    <Text style={s.detailVal}>{cd.pod}</Text>
                  </View>
                ) : null}
                {cd.pdr ? (
                  <View style={s.detailRow}>
                    <Muted>PDR</Muted>
                    <Text style={s.detailVal}>{cd.pdr}</Text>
                  </View>
                ) : null}
                <View style={s.detailRow}>
                  <Muted>Risparmio annuo</Muted>
                  <Text style={[s.detailVal, { color: colors.success }]}>{eur(item.offer?.annual_savings)}</Text>
                </View>

                {item.status !== "concluso" ? (
                  <View style={s.actions}>
                    <Pressable style={[s.actBtn, { backgroundColor: colors.brandPrimary }]} onPress={() => statusMut.mutate({ id: item.contract_id, status: "concluso" })} testID={`conclude-${item.contract_id}`}>
                      <CheckCircle size={18} color={colors.onBrandPrimary} weight="fill" />
                      <Text style={[s.actText, { color: colors.onBrandPrimary }]}>Concludi</Text>
                    </Pressable>
                    {item.status !== "annullato" ? (
                      <Pressable style={[s.actBtn, s.actGhost]} onPress={() => statusMut.mutate({ id: item.contract_id, status: "annullato" })} testID={`cancel-${item.contract_id}`}>
                        <XCircle size={18} color={colors.error} weight="fill" />
                        <Text style={[s.actText, { color: colors.error }]}>Annulla</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
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
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs, gap: spacing.md },
  detailVal: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurface, maxWidth: "60%", textAlign: "right" },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 46, borderRadius: radius.md },
  actGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  actText: { fontFamily: fonts.semibold, fontSize: fontSize.base },
}));
