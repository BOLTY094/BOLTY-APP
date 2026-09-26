import React from "react";
import { View, Text, Pressable, Platform, RefreshControl, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { ArrowSquareOut, Newspaper, Lightning, Flame, Storefront } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { Muted, Loader, EmptyState } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

type Item = { link: string; title: string; summary: string; source: string; published_at: string; category: string };

const CAT_LABEL: Record<string, string> = { luce: "Luce", gas: "Gas", mercato: "Mercato", energia: "Energia" };

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `Oggi, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

// Real articles from reliable energy-sector feeds; refreshed automatically every 3 days by the backend.
export default function News() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { show } = useToast();

  const q = useInfiniteQuery({
    queryKey: ["news"],
    queryFn: ({ pageParam }) => api(`/news?limit=25${pageParam ? `&before=${encodeURIComponent(pageParam as string)}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last: any) => (last.has_more ? last.next_before : undefined),
  });

  const items: Item[] = q.data?.pages.flatMap((p: any) => p.items) ?? [];
  const meta = q.data?.pages[0];

  const open = async (url: string) => {
    try {
      if (Platform.OS === "web") window.open(url, "_blank", "noopener");
      else await WebBrowser.openBrowserAsync(url);
    } catch {
      show("Impossibile aprire la fonte", "error");
    }
  };

  const CatIcon = ({ c }: { c: string }) => {
    const props = { size: 12, weight: "fill" as const };
    if (c === "luce") return <Lightning {...props} color={colors.luce} />;
    if (c === "gas") return <Flame {...props} color={colors.gas} />;
    if (c === "mercato") return <Storefront {...props} color={colors.brandPrimary} />;
    return <Newspaper {...props} color={colors.muted} />;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="News" subtitle="Energia, gas e mercato libero" testID="news-header" />
      {q.isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.link}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["2xl"] }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => q.refetch()} tintColor={colors.brandPrimary} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            meta ? (
              <Muted style={{ fontSize: fontSize.sm, marginBottom: spacing.lg }} testID="news-meta">
                Notizie reali da {meta.sources.join(", ")}. Ultimo aggiornamento: {meta.last_refresh ? fmtDate(meta.last_refresh) : "—"} · si aggiorna ogni 3 giorni.
              </Muted>
            ) : null
          }
          ListEmptyComponent={<EmptyState title="Nessuna notizia disponibile" subtitle="Non abbiamo trovato aggiornamenti attendibili. Riprova più tardi." testID="news-empty" />}
          ListFooterComponent={q.isFetchingNextPage ? <Loader /> : null}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]} onPress={() => open(item.link)} testID="news-item">
              <View style={s.metaRow}>
                <View style={s.catChip}>
                  <CatIcon c={item.category} />
                  <Text style={s.catText}>{CAT_LABEL[item.category] || "Energia"}</Text>
                </View>
                <Muted style={{ fontSize: fontSize.sm }}>{fmtDate(item.published_at)}</Muted>
              </View>
              <Text style={s.title}>{item.title}</Text>
              {item.summary ? <Text style={s.summary} numberOfLines={4}>{item.summary}</Text> : null}
              <View style={s.sourceRow}>
                <Text style={s.source}>Fonte: {item.source}</Text>
                <ArrowSquareOut size={16} color={colors.brandPrimary} weight="bold" />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  catChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  catText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface, lineHeight: 23 },
  summary: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurfaceTertiary, marginTop: spacing.xs, lineHeight: 20 },
  sourceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  source: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.brandPrimary },
}));
