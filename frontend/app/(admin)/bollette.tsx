import React, { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/api";
import { Muted, Loader, TextField } from "@/src/components/ui";
import { AdminPage, SearchBar, FilterChips, AdminBillRow } from "@/src/components/admin-ui";
import { spacing } from "@/src/theme";

const FILTERS = [
  { key: "tutte", label: "Tutte" },
  { key: "nuove", label: "Nuove bollette" },
  { key: "da_analizzare", label: "Da analizzare" },
  { key: "da_contattare", label: "Da contattare" },
  { key: "contattati", label: "Contattati" },
  { key: "conclusi", label: "Conclusi" },
];

function useDebounced(value: string, ms = 350) {
  const [v, setV] = useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AdminBollette() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("tutte");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const dq = useDebounced(q);

  const params = new URLSearchParams();
  if (dq.trim()) params.set("q", dq.trim());
  if (filter !== "tutte") params.set("filter", filter);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) params.set("date_from", dateFrom);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) params.set("date_to", dateTo);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-bills-search", params.toString()],
    queryFn: () => api(`/admin/bills/search?${params.toString()}`),
    refetchInterval: 30000,
  });

  return (
    <AdminPage title="Bollette" subtitle="Tutte le bollette caricate dai clienti" refreshing={isRefetching} onRefresh={refetch} testID="admin-bollette">
      <SearchBar value={q} onChange={setQ} placeholder="Cerca nome, ragione sociale, email, telefono, fornitore, stato, data…" testID="admin-search" />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><TextField label="Dal (AAAA-MM-GG)" value={dateFrom} onChangeText={setDateFrom} placeholder="2026-01-01" optional testID="admin-date-from" /></View>
        <View style={{ flex: 1 }}><TextField label="Al (AAAA-MM-GG)" value={dateTo} onChangeText={setDateTo} placeholder="2026-12-31" optional testID="admin-date-to" /></View>
      </View>
      {isLoading ? <Loader /> : !data?.length ? <Muted style={{ marginTop: spacing.lg }}>Nessuna bolletta trovata.</Muted> : (
        <>
          <Muted style={{ marginBottom: spacing.sm }}>{data.length} risultati</Muted>
          {data.map((b: any) => <AdminBillRow key={b.bill_id} bill={b} showContactStatus />)}
        </>
      )}
    </AdminPage>
  );
}
