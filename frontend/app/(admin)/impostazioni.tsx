import React from "react";
import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { openLegal } from "@/src/legal";
import { H2, Muted, Button, Loader } from "@/src/components/ui";
import { AdminPage, Card, fmtDateTime } from "@/src/components/admin-ui";
import { makeStyles, spacing, fonts, fontSize } from "@/src/theme";

export default function AdminImpostazioni() {
  const s = useStyles();
  const { user, logout } = useAuth();
  const { data: info } = useQuery({ queryKey: ["legal-info"], queryFn: () => api("/legal/info", { auth: false }) });
  const { data: audit, isLoading } = useQuery({ queryKey: ["admin-audit"], queryFn: () => api("/admin/audit?limit=30") });

  const Row = ({ l, v }: { l: string; v?: string }) => (<View style={s.kv}><Muted>{l}</Muted><Text style={s.v}>{v || "—"}</Text></View>);

  return (
    <AdminPage title="Impostazioni" subtitle="Account amministratore e configurazione" testID="admin-impostazioni">
      <Card>
        <Row l="Amministratore" v={user?.name} />
        <Row l="Email di accesso" v={user?.email} />
        <Row l="Email notifiche / assistenza" v={info?.support_email} />
        <Muted style={{ marginTop: spacing.sm, fontSize: fontSize.sm }}>Le email di notifica (nuove bollette con file originale allegato, richieste di contatto, assistenza) vengono inviate alla casella configurata sul server (ADMIN_NOTIFY_EMAIL / SUPPORT_EMAIL).</Muted>
      </Card>

      <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Pagine legali pubbliche</H2>
      <View style={{ gap: spacing.sm }}>
        <Button title="Privacy Policy" variant="secondary" onPress={() => openLegal("privacy").catch(() => {})} />
        <Button title="Termini di servizio" variant="secondary" onPress={() => openLegal("terms").catch(() => {})} />
      </View>

      <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Registro operazioni amministrative</H2>
      <Card>
        {isLoading ? <Loader /> : !audit?.length ? <Muted>Nessuna operazione registrata.</Muted> : audit.map((a: any, i: number) => (
          <View key={a.audit_id} style={[s.kv, i !== audit.length - 1 && s.border]} testID="audit-row">
            <View style={{ flex: 1 }}><Text style={s.v}>{a.action} · {a.target}</Text><Muted style={{ fontSize: fontSize.sm }}>{a.admin_email}</Muted></View>
            <Muted style={{ fontSize: fontSize.sm }}>{fmtDateTime(a.created_at)}</Muted>
          </View>
        ))}
      </Card>

      <Button title="Esci" variant="ghost" onPress={logout} style={{ marginTop: spacing.xl }} testID="admin-logout" />
    </AdminPage>
  );
}

const useStyles = makeStyles((colors) => ({
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.md },
  border: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  v: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurface, flexShrink: 1, textAlign: "right" },
}));
