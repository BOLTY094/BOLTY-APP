import React from "react";
import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { H2, Muted, Loader, Badge } from "@/src/components/ui";
import { AdminPage, Card, fmtDateTime } from "@/src/components/admin-ui";
import { makeStyles, spacing, fonts, fontSize } from "@/src/theme";

const STATUS: Record<string, { label: string; tone: "info" | "warning" | "success" }> = {
  registrato: { label: "Registrato", tone: "info" },
  bolletta_caricata: { label: "Bolletta caricata", tone: "warning" },
  offerta_attivata: { label: "Offerta attivata", tone: "success" },
};

export default function AdminReferral() {
  const s = useStyles();
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["admin-referrals"], queryFn: () => api("/admin/referrals") });

  return (
    <AdminPage title="Referral" subtitle="Programma «Invita un amico» — nessun premio in denaro" refreshing={isRefetching} onRefresh={refetch} testID="admin-referral">
      {isLoading || !data ? <Loader /> : (
        <>
          <H2 style={{ marginBottom: spacing.md }}>Inviti effettuati ({data.referrals.length})</H2>
          {data.referrals.length === 0 ? <Muted>Nessun invito ancora.</Muted> : data.referrals.map((r: any, i: number) => {
            const st = STATUS[r.status] || STATUS.registrato;
            return (
              <Card key={i} style={{ marginBottom: spacing.sm }}>
                <View style={s.top}>
                  <Text style={s.name}>{r.referrer?.name || "—"} <Muted>ha invitato</Muted> {r.referred?.name || r.referred?.email || "—"}</Text>
                  <Badge label={st.label} tone={st.tone} />
                </View>
                <Muted>Invitante: {r.referrer?.email || "—"} · Invitato: {r.referred?.email || "—"}</Muted>
                <Muted>Codice: <Text style={s.code}>{r.code || "—"}</Text> · Link: {r.link}</Muted>
                <Muted>Data invito: {fmtDateTime(r.invited_at)}{r.activated_at ? ` · Offerta attivata: ${fmtDateTime(r.activated_at)}` : ""}</Muted>
              </Card>
            );
          })}

          <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Codici invito dei clienti ({data.codes.length})</H2>
          <Card>
            {data.codes.map((c: any, i: number) => (
              <View key={c.user_id} style={[s.kv, i !== data.codes.length - 1 && s.border]}>
                <View style={{ flex: 1 }}><Text style={s.v}>{c.name || "—"}</Text><Muted style={{ fontSize: fontSize.sm }}>{c.email}</Muted></View>
                <Text style={s.code}>{c.code}</Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </AdminPage>
  );
}

const useStyles = makeStyles((colors) => ({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginBottom: 4 },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface, flexShrink: 1 },
  code: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.brand, letterSpacing: 1 },
  kv: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  border: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  v: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurface },
}));
