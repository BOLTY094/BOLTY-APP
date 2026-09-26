import React from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { H2, Muted, Loader } from "@/src/components/ui";
import { AdminPage, AdminBillRow, Card, fmtDateTime, NR } from "@/src/components/admin-ui";
import { makeStyles, useTheme, spacing, fonts, fontSize } from "@/src/theme";

// Admin view of a single customer with their full activity history.
export default function AdminUserDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useQuery({ queryKey: ["admin-user", id], queryFn: () => api(`/admin/users/${id}`) });

  if (isLoading || !data) return <View style={{ flex: 1, backgroundColor: colors.surface }}><ScreenHeader title="Cliente" /><Loader /></View>;
  const u = data.user;
  const Row = ({ l, v }: { l: string; v?: string | null }) => (
    <View style={s.kv}><Muted>{l}</Muted><Text style={[s.v, !v && { color: colors.muted }]}>{v || NR}</Text></View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={u.name || "Cliente"} subtitle={u.email || undefined} />
      <AdminPage title="" testID="admin-user-detail">
        <Card>
          <Row l="Nome" v={u.name} />
          <Row l="Email" v={u.email} />
          <Row l="Telefono" v={u.phone} />
          <Row l="Accesso" v={u.auth_provider || "email"} />
          <Row l="Registrato" v={fmtDateTime(u.created_at)} />
          <Row l="Codice invito" v={u.referral_code} />
          <Row l="Invitato da" v={data.referrer ? `${data.referrer.name || ""} ${data.referrer.email || ""}`.trim() : null} />
          <Row l="Stato account" v="Attivo" />
        </Card>

        <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Bollette ({data.bills.length})</H2>
        {data.bills.length === 0 ? <Muted>Nessuna bolletta.</Muted> : data.bills.map((b: any) => <AdminBillRow key={b.bill_id} bill={b} showContactStatus />)}

        <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Amici invitati ({data.referred.length})</H2>
        {data.referred.length === 0 ? <Muted>Nessun invito.</Muted> : data.referred.map((r: any) => <Card key={r.user_id} style={{ marginBottom: spacing.sm }}><Text style={s.v}>{r.name || "—"}</Text><Muted>{r.email} · {fmtDateTime(r.created_at)}</Muted></Card>)}

        <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Storico attività</H2>
        <Card>
          {data.timeline.map((t: any, i: number) => (
            <View key={i} style={[s.tl, i !== data.timeline.length - 1 && s.tlBorder]} testID="timeline-item">
              <View style={s.dot} />
              <View style={{ flex: 1 }}>
                <Text style={s.v}>{t.text}</Text>
                <Muted style={{ fontSize: fontSize.sm }}>{fmtDateTime(t.at)}</Muted>
              </View>
            </View>
          ))}
        </Card>
      </AdminPage>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.md },
  v: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurface, textAlign: "right", flexShrink: 1 },
  tl: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm, alignItems: "flex-start" },
  tlBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, marginTop: 6 },
}));
