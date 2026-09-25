import React, { useEffect } from "react";
import { View, Text, FlatList } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellSimple } from "phosphor-react-native";

import { api } from "@/src/api";
import { ScreenHeader } from "@/src/components/screen-header";
import { Body, Muted, EmptyState, Loader } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

export default function Notifications() {
  const s = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { data: notifs = [], isLoading } = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications") });

  useEffect(() => {
    api("/notifications/read", { method: "PUT" })
      .then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))
      .catch(() => {});
  }, [qc]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Notifiche" />
      {isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={notifs as any[]}
          keyExtractor={(item) => item.notif_id}
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
          ListEmptyComponent={<EmptyState title="Nessuna notifica" subtitle="Qui vedrai gli aggiornamenti sulle tue bollette e offerte." testID="notif-empty" />}
          renderItem={({ item }) => {
            const date = new Date(item.created_at).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
            return (
              <View style={s.card} testID={`notif-${item.notif_id}`}>
                <View style={s.icon}>
                  <BellSimple size={20} color={colors.brandPrimary} weight="fill" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{item.title}</Text>
                  <Body style={{ marginTop: 2 }}>{item.body}</Body>
                  <Muted style={{ marginTop: spacing.xs, fontSize: fontSize.sm }}>{date}</Muted>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
}));
