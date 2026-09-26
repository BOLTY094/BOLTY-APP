import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Receipt, Headset, CaretRight } from "phosphor-react-native";

import { api } from "@/src/api";
import { Muted, Loader, Button } from "@/src/components/ui";
import { AdminPage, fmtDateTime, NR } from "@/src/components/admin-ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

// Admin notifications: new bill to analyse / new contact request, with direct access to the bill.
export default function AdminNotifiche() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["admin-notifications-list"], queryFn: () => api("/admin/notifications?limit=100"), refetchInterval: 20000 });
  const readAll = useMutation({
    mutationFn: (id?: string) => api(`/admin/notifications/read${id ? `?notification_id=${id}` : ""}`, { method: "PUT" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-notifications-list"] }); qc.invalidateQueries({ queryKey: ["admin-notifications"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
  });

  return (
    <AdminPage title="Notifiche" subtitle={data ? `${data.unread} non lette` : undefined} refreshing={isRefetching} onRefresh={refetch} testID="admin-notifiche"
      right={data?.unread ? <Button title="Segna tutte lette" variant="secondary" onPress={() => readAll.mutate(undefined)} testID="admin-notif-read-all" /> : undefined}>
      {isLoading || !data ? <Loader /> : data.items.length === 0 ? <Muted>Nessuna notifica.</Muted> : data.items.map((n: any) => (
        <Pressable key={n.notification_id} style={({ pressed }) => [s.row, !n.read && s.unread, pressed && { opacity: 0.9 }]} onPress={() => { if (!n.read) readAll.mutate(n.notification_id); if (n.bill_id) router.push(`/admin/bill/${n.bill_id}`); }} testID={`admin-notif-${n.notification_id}`}>
          <View style={[s.icon, { backgroundColor: n.kind === "contatto" ? colors.brandTertiary : colors.accentSoft }]}>
            {n.kind === "contatto" ? <Headset size={20} color={colors.brandPrimary} weight="fill" /> : <Receipt size={20} color={colors.brand} weight="fill" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{n.title}</Text>
            <Muted>Cliente: {n.extra?.customer || "—"} · Fornitore: {n.extra?.fornitore || NR}</Muted>
            {n.kind === "contatto" ? <Muted>{[n.extra?.email, n.extra?.phone].filter(Boolean).join(" · ")}</Muted> : <Muted>{n.extra?.file_name || ""}</Muted>}
            <Muted style={{ fontSize: fontSize.sm }}>{fmtDateTime(n.created_at)}</Muted>
          </View>
          <CaretRight size={18} color={colors.muted} />
        </Pressable>
      ))}
    </AdminPage>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  unread: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
}));
