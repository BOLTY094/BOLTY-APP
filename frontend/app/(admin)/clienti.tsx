import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { CaretRight } from "phosphor-react-native";

import { api } from "@/src/api";
import { Muted, Loader, Badge } from "@/src/components/ui";
import { AdminPage, SearchBar, fmtDateTime } from "@/src/components/admin-ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

export default function AdminClienti() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState("");
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["admin-users", q], queryFn: () => api(`/admin/users${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`) });

  return (
    <AdminPage title="Clienti" subtitle="Utenti registrati" refreshing={isRefetching} onRefresh={refetch} testID="admin-clienti">
      <SearchBar value={q} onChange={setQ} placeholder="Cerca nome, email, telefono, codice invito…" testID="admin-users-search" />
      {isLoading ? <Loader /> : !data?.length ? <Muted style={{ marginTop: spacing.lg }}>Nessun cliente trovato.</Muted> : (
        <View style={{ marginTop: spacing.md }}>
          {data.map((u: any) => {
            const [nome, ...rest] = (u.name || "").split(" ");
            return (
              <Pressable key={u.user_id} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceTertiary }]} onPress={() => router.push(`/admin/user/${u.user_id}`)} testID={`admin-user-${u.user_id}`}>
                <View style={s.avatar}><Text style={s.avatarText}>{(nome?.[0] || "?").toUpperCase()}{(rest[0]?.[0] || "").toUpperCase()}</Text></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={s.name}>{u.name || "—"}</Text>
                    <Badge label={u.account_status === "attivo" ? "Attivo" : u.account_status} tone="success" />
                  </View>
                  <Muted numberOfLines={1}>{[u.email, u.phone].filter(Boolean).join(" · ") || "Nessun recapito"}</Muted>
                  <Muted style={{ fontSize: fontSize.sm }}>Registrato {fmtDateTime(u.created_at)} · Ultima attività {fmtDateTime(u.last_activity)}</Muted>
                  <Muted style={{ fontSize: fontSize.sm }}>{u.bills_count} bollette · {u.referrals_count} inviti · {u.contacts_count} richieste contatto · accesso {u.auth_provider || "email"}</Muted>
                </View>
                <CaretRight size={18} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>
      )}
    </AdminPage>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.brand },
  name: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
}));
