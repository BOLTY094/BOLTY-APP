import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretLeft } from "phosphor-react-native";

import { makeStyles, useTheme, spacing, fonts, fontSize } from "@/src/theme";

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  testID,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = onBack ?? (() => router.back());

  return (
    <View style={[s.wrap, { paddingTop: insets.top + spacing.sm }]} testID={testID}>
      <View style={s.rowTop}>
        <Pressable onPress={back} hitSlop={12} style={s.backBtn} testID="header-back">
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <View style={s.titleWrap}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={s.rightWrap}>{right}</View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 40 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  titleWrap: { flex: 1 },
  title: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: fontSize.xl },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: fontSize.base, marginTop: 1 },
  rightWrap: { minWidth: 36, alignItems: "flex-end" },
}));
