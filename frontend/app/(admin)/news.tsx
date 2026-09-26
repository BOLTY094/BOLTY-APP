import React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { ArrowSquareOut } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { Muted, Loader, Button, Badge } from "@/src/components/ui";
import { AdminPage, Card, fmtDateTime } from "@/src/components/admin-ui";
import { makeStyles, useTheme, spacing, fonts, fontSize } from "@/src/theme";

export default function AdminNews() {
  const s = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { show } = useToast();
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["admin-news"], queryFn: () => api("/news?limit=60") });
  const mut = useMutation({
    mutationFn: () => api("/admin/news/refresh", { method: "POST" }),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ["admin-news"] }); qc.invalidateQueries({ queryKey: ["news"] }); show(`Aggiornate: ${r.added ?? 0} nuove notizie`, "success"); },
    onError: (e: any) => show(e.message || "Errore", "error"),
  });
  const open = (url: string) => (Platform.OS === "web" ? window.open(url, "_blank", "noopener") : WebBrowser.openBrowserAsync(url));

  return (
    <AdminPage title="News" subtitle="Notizie reali da fonti online · aggiornamento automatico ogni 3 giorni" refreshing={isRefetching} onRefresh={refetch} testID="admin-news"
      right={<Button title="Aggiorna ora" variant="secondary" onPress={() => mut.mutate()} loading={mut.isPending} testID="admin-news-refresh" />}>
      {isLoading || !data ? <Loader /> : (
        <>
          <Muted style={{ marginBottom: spacing.md }} testID="admin-news-meta">
            Fonti: {data.sources.join(", ")} · Ultimo aggiornamento: {fmtDateTime(data.last_refresh)} · Prossimo: {fmtDateTime(data.next_refresh)}
          </Muted>
          {data.items.map((n: any) => (
            <Card key={n.link} style={{ marginBottom: spacing.sm }}>
              <View style={s.top}><Badge label={n.category} tone="neutral" /><Muted style={{ fontSize: fontSize.sm }}>{fmtDateTime(n.published_at)}</Muted></View>
              <Text style={s.title}>{n.title}</Text>
              {n.summary ? <Muted numberOfLines={3} style={{ marginTop: 2 }}>{n.summary}</Muted> : null}
              <Pressable onPress={() => open(n.link)} style={s.src}><Text style={s.srcText}>Fonte: {n.source}</Text><ArrowSquareOut size={16} color={colors.brandPrimary} weight="bold" /></Pressable>
            </Card>
          ))}
        </>
      )}
    </AdminPage>
  );
}

const useStyles = makeStyles((colors) => ({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  src: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, minHeight: 32 },
  srcText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.brandPrimary },
}));
