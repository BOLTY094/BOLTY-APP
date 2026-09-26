import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileArrowDown } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { Muted, Loader, Badge } from "@/src/components/ui";
import { AdminPage, SearchBar, FilterChips, Card, CONTACT_STATUS, fmtDateTime, openOriginalFile, NR } from "@/src/components/admin-ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

const STATUSES = Object.keys(CONTACT_STATUS);

export default function AdminContatti() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { show } = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("tutti");

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status !== "tutti") params.set("status", status);
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["admin-contacts", params.toString()], queryFn: () => api(`/admin/contacts?${params}`), refetchInterval: 30000 });

  const mut = useMutation({
    mutationFn: ({ billId, st }: { billId: string; st: string }) => api(`/admin/contacts/${billId}/status`, { method: "PUT", body: { status: st } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contacts"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      show("Stato aggiornato", "success");
    },
    onError: (e: any) => show(e.message || "Errore", "error"),
  });

  return (
    <AdminPage title="Richieste di contatto" subtitle="Clienti che vogliono essere ricontattati da un consulente" refreshing={isRefetching} onRefresh={refetch} testID="admin-contatti">
      <SearchBar value={q} onChange={setQ} placeholder="Cerca nome, ragione sociale, email, telefono, fornitore…" testID="admin-contacts-search" />
      <FilterChips options={[{ key: "tutti", label: "Tutti" }, ...STATUSES.map((k) => ({ key: k, label: CONTACT_STATUS[k].label }))]} value={status} onChange={setStatus} />
      {isLoading ? <Loader /> : !data?.length ? <Muted style={{ marginTop: spacing.lg }}>Nessuna richiesta.</Muted> : data.map((b: any) => {
        const c = b.contact_request; const ex = b.extracted || {}; const cs = CONTACT_STATUS[c.status] || CONTACT_STATUS.nuovo;
        return (
          <Card key={b.bill_id} style={{ marginBottom: spacing.md }}>
            <View style={s.top}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{ex.intestatario || b.customer?.name || "Cliente"}</Text>
                <Muted>{b.customer?.name && ex.intestatario ? `Account: ${b.customer.name} · ` : ""}{fmtDateTime(c.consent_at)}</Muted>
              </View>
              <Badge label={cs.label} tone={cs.tone} testID={`contact-status-${b.bill_id}`} />
            </View>
            <View style={s.kv}><Muted>Email</Muted><Text style={s.v}>{c.email || "—"}</Text></View>
            <View style={s.kv}><Muted>Telefono</Muted><Text style={s.v}>{c.phone || "—"}</Text></View>
            <View style={s.kv}><Muted>Fornitore rilevato</Muted><Text style={s.v}>{ex.fornitore || NR}</Text></View>
            <View style={s.kv}><Muted>Bolletta</Muted>
              <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
                <Pressable onPress={() => router.push(`/admin/bill/${b.bill_id}`)} testID={`contact-open-bill-${b.bill_id}`}><Text style={s.link}>{b.category} · {b.file_name || "apri"}</Text></Pressable>
                <Pressable onPress={() => openOriginalFile(b.storage_path).catch(() => {})} hitSlop={8}><FileArrowDown size={20} color={colors.brand} weight="fill" /></Pressable>
              </View>
            </View>
            {c.note ? <Muted style={{ marginTop: spacing.xs }}>Nota: {c.note}</Muted> : null}
            <Muted style={{ marginTop: spacing.md, marginBottom: spacing.xs, fontSize: fontSize.sm }}>Stato del contatto</Muted>
            <View style={s.statusRow}>
              {STATUSES.map((k) => (
                <Pressable key={k} onPress={() => mut.mutate({ billId: b.bill_id, st: k })} style={[s.stBtn, c.status === k && { backgroundColor: colors.brand, borderColor: colors.brand }]} testID={`set-status-${k}-${b.bill_id}`}>
                  <Text style={[s.stText, c.status === k && { color: colors.onBrand }]}>{CONTACT_STATUS[k].label}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        );
      })}
    </AdminPage>
  );
}

const useStyles = makeStyles((colors) => ({
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.sm },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, gap: spacing.md },
  v: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurface, flexShrink: 1, textAlign: "right" },
  link: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.brandPrimary },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stBtn: { paddingHorizontal: spacing.md, minHeight: 36, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  stText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
}));
