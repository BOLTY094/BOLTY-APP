import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  ViewStyle,
  TextStyle,
  Platform,
  StyleProp,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { CaretRight } from "phosphor-react-native";

import { makeStyles, useTheme, spacing, radius, fonts, fontSize, ThemeColors } from "@/src/theme";

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS !== "web") Haptics.impactAsync(style).catch(() => {});
};

/* ---------------------------------- Text ---------------------------------- */
type TxtProps = { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number; testID?: string };
export function H1({ children, style, testID }: TxtProps) {
  const s = useStyles();
  return <Text testID={testID} style={[s.h1, style]}>{children}</Text>;
}
export function H2({ children, style, testID }: TxtProps) {
  const s = useStyles();
  return <Text testID={testID} style={[s.h2, style]}>{children}</Text>;
}
export function Body({ children, style, numberOfLines, testID }: TxtProps) {
  const s = useStyles();
  return <Text testID={testID} numberOfLines={numberOfLines} style={[s.body, style]}>{children}</Text>;
}
export function Muted({ children, style, numberOfLines, testID }: TxtProps) {
  const s = useStyles();
  return <Text testID={testID} numberOfLines={numberOfLines} style={[s.muted, style]}>{children}</Text>;
}

/* --------------------------------- Button --------------------------------- */
type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  color?: string;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
  testID?: string;
};
export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  color,
  textColor,
  style,
  icon,
  testID,
}: ButtonProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const bg =
    color ??
    (variant === "primary" ? colors.brandPrimary : variant === "secondary" ? colors.brandSecondary : "transparent");
  const fg =
    textColor ??
    (variant === "primary" ? colors.onBrandPrimary : variant === "secondary" ? colors.onBrandSecondary : colors.brandPrimary);
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      disabled={isDisabled}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg },
        variant === "ghost" && { backgroundColor: "transparent" },
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.btnRow}>
          {icon}
          <Text style={[s.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ---------------------------------- Card ---------------------------------- */
export function Card({
  children,
  style,
  onPress,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  testID?: string;
}) {
  const s = useStyles();
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={() => {
          haptic();
          onPress();
        }}
        style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}

/* -------------------------------- TextField ------------------------------- */
type FieldProps = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
  testID?: string;
  optional?: boolean;
};
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  multiline,
  testID,
  optional,
}: FieldProps) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>
        {label}
        {optional ? <Text style={s.fieldOptional}>  (facoltativo)</Text> : null}
      </Text>
      <TextInput
        testID={testID}
        style={[s.input, multiline && { height: 96, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
      />
    </View>
  );
}

/* --------------------------------- Badge ---------------------------------- */
export function Badge({ label, tone = "neutral", testID }: { label: string; tone?: "neutral" | "success" | "warning" | "info"; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const map = {
    neutral: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
    success: { bg: colors.brandTertiary, fg: colors.success },
    warning: { bg: "#FFF3E0", fg: colors.warning },
    info: { bg: colors.info, fg: colors.onInfo },
  }[tone];
  return (
    <View testID={testID} style={[s.badge, { backgroundColor: map.bg }]}>
      <Text style={[s.badgeText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

/* ---------------------------------- Row ----------------------------------- */
export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const content = (
    <>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.rowSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <CaretRight size={18} color={colors.muted} weight="bold" /> : null)}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={() => {
          haptic();
          onPress();
        }}
        style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}
      >
        {content}
      </Pressable>
    );
  }
  return <View testID={testID} style={s.row}>{content}</View>;
}

/* ------------------------------- EmptyState ------------------------------- */
export function EmptyState({ title, subtitle, image, testID }: { title: string; subtitle?: string; image?: string; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.empty} testID={testID}>
      {image ? <Image source={{ uri: image }} style={s.emptyImg} contentFit="contain" /> : null}
      <H2 style={{ textAlign: "center" }}>{title}</H2>
      {subtitle ? <Muted style={{ textAlign: "center", marginTop: spacing.xs }}>{subtitle}</Muted> : null}
    </View>
  );
}

/* -------------------------------- Loader ---------------------------------- */
export function Loader({ testID }: { testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.loader} testID={testID}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

/* ------------------------------ Status helpers ---------------------------- */
export function statusMeta(status: string): { label: string; tone: "neutral" | "success" | "warning" | "info" } {
  switch (status) {
    case "nuova":
      return { label: "Nuova", tone: "info" };
    case "offerta_proposta":
      return { label: "Offerta pronta", tone: "warning" };
    case "proposta":
      return { label: "Offerta proposta", tone: "warning" };
    case "accettata":
      return { label: "Accettata", tone: "success" };
    case "rifiutata":
      return { label: "Rifiutata", tone: "neutral" };
    case "in_lavorazione":
      return { label: "In lavorazione", tone: "warning" };
    case "concluso":
      return { label: "Concluso", tone: "success" };
    case "annullato":
      return { label: "Annullato", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export const eur = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const useStyles = makeStyles((colors: ThemeColors) => ({
  h1: { color: colors.onSurface, fontFamily: fonts.semibold, fontSize: fontSize["2xl"], lineHeight: 30 },
  h2: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: fontSize.xl, lineHeight: 26 },
  body: { color: colors.onSurfaceSecondary, fontFamily: fonts.regular, fontSize: fontSize.base, lineHeight: 20 },
  muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: fontSize.base, lineHeight: 20 },
  btn: {
    minHeight: 54,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  btnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnText: { fontFamily: fonts.semibold, fontSize: fontSize.lg },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldWrap: { marginBottom: spacing.lg },
  fieldLabel: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: fontSize.base, marginBottom: spacing.sm },
  fieldOptional: { color: colors.muted, fontFamily: fonts.regular, fontSize: fontSize.sm },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.lg,
    color: colors.onSurface,
    minHeight: 52,
  },
  badge: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  badgeText: { fontFamily: fonts.medium, fontSize: fontSize.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 60,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
  },
  rowTitle: { color: colors.onSurface, fontFamily: fonts.medium, fontSize: fontSize.lg },
  rowSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: fontSize.base, marginTop: 2 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: spacing["3xl"], paddingHorizontal: spacing.xl },
  emptyImg: { width: 140, height: 140, marginBottom: spacing.lg },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing["3xl"] },
}));
