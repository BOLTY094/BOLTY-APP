import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "phosphor-react-native";

import { api } from "@/src/api";
import { H2, Muted, Loader } from "@/src/components/ui";
import { AdminPage, StatCard, AdminBillRow } from "@/src/components/admin-ui";
import { makeStyles, spacing, fonts, fontSize, useTheme } from "@/src/theme";

// Auto-refreshes every 20s so new bills/contacts appear without manual reload.
export default function AdminDashboard() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["admin-stats"], queryFn: () => api("/admin/stats"), refetchInterval: 20000 });

  if (isLoading || !data) return <Loader />;

  const Link = ({ label, href, testID }: { label: string; href: string; testID: string }) => (
    <Pressable onPress={() => router.replace(href as any)} style={s.link} testID={testID}>
      <Text style={s.linkText}>{label}</Text>
      <ArrowRight size={16} color={colors.brandPrimary} weight="bold" />
    </Pressable>
  );

  return (
    <AdminPage title="Dashboard" subtitle={`Aggiornata alle ${new Date(data.generated_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · si aggiorna da sola`} refreshing={isRefetching} onRefresh={refetch} testID="admin-dashboard">
      <View style={s.grid}>
        <StatCard label="Utenti registrati" value={data.users_total} tone="brand" testID="stat-users" />
        <StatCard label="Bollette totali" value={data.bills_total} testID="stat-bills" />
        <StatCard label="Bollette oggi" value={data.bills_today} tone="accent" testID="stat-bills-today" />
        <StatCard label="Ultimi 7 giorni" value={data.bills_week} testID="stat-bills-week" />
        <StatCard label="Da analizzare" value={data.bills_new} testID="stat-bills-new" />
        <StatCard label="Richieste di contatto" value={data.contacts_total} hint={`${data.contacts_open} aperte`} testID="stat-contacts" />
        <StatCard label="Con email" value={data.contacts_with_email} testID="stat-contacts-email" />
        <StatCard label="Con telefono" value={data.contacts_with_phone} testID="stat-contacts-phone" />
        <StatCard label="Inviti (referral)" value={data.referrals_total} testID="stat-referrals" />
        <StatCard label="Notifiche non lette" value={data.unread_notifications} testID="stat-unread" />
      </View>

      <View style={s.sectionHead}>
        <H2>Ultime bollette ricevute</H2>
        <Link label="Tutte" href="/(admin)/bollette" testID="dash-all-bills" />
      </View>
      {data.latest_bills.length === 0 ? <Muted>Nessuna bolletta ancora.</Muted> : data.latest_bills.map((b: any) => <AdminBillRow key={b.bill_id} bill={b} />)}

      <View style={s.sectionHead}>
        <H2>Ultime richieste di contatto</H2>
        <Link label="Tutte" href="/(admin)/contatti" testID="dash-all-contacts" />
      </View>
      {data.latest_contacts.length === 0 ? <Muted>Nessuna richiesta di contatto.</Muted> : data.latest_contacts.map((b: any) => <AdminBillRow key={b.bill_id} bill={b} showContactStatus />)}
    </AdminPage>
  );
}

const useStyles = makeStyles((colors) => ({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing["2xl"], marginBottom: spacing.md },
  link: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: spacing.sm },
  linkText: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.brandPrimary },
}));
