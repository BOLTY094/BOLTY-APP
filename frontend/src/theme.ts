// Design tokens for BOLTY — "iOS-Native Clean" personality (light theme).
// Colors mirror the "color" block of /app/design_guidelines.json.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  // Pure white canvas, matching the brand logo background
  surface: "#FFFFFF",
  onSurface: "#16213E",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#16213E",
  surfaceTertiary: "#F4F5F9",
  onSurfaceTertiary: "#4A5169",
  surfaceInverse: "#16213E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8A8F9E",

  brand: "#16213E",
  onBrand: "#FFFFFF",
  brandPrimary: "#16213E",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#E3E6F0",
  onBrandSecondary: "#16213E",
  brandTertiary: "#EDEFF6",
  onBrandTertiary: "#16213E",

  // Yellow accent from the Bolty logo bolt
  accent: "#F5CE3E",
  onAccent: "#16213E",
  accentSoft: "#FDF3CE",

  success: "#2FA84F",
  onSuccess: "#FFFFFF",
  warning: "#E5A11B",
  onWarning: "#FFFFFF",
  error: "#E5484D",
  onError: "#FFFFFF",
  info: "#E3E6F0",
  onInfo: "#16213E",

  border: "#E9EBF1",
  borderStrong: "#D3D7E2",
  divider: "#EEF0F5",

  // Category accents (Luce = brand yellow, Gas = terracotta, Telefonia = teal)
  luce: "#E5A11B",
  onLuce: "#FFFFFF",
  luceSoft: "#FBF0D6",
  gas: "#C65D3B",
  onGas: "#FFFFFF",
  gasSoft: "#F6E5DD",
  telefonia: "#3E8E9E",
  onTelefonia: "#FFFFFF",
  telefoniaSoft: "#DFEEF0",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fontSize = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
} as const;

export const fonts = {
  regular: "Jakarta",
  medium: "JakartaMedium",
  semibold: "JakartaSemiBold",
  bold: "JakartaBold",
} as const;

export const fontSources: Record<string, string> = {
  Jakarta: "https://cdn.jsdelivr.net/fontsource/fonts/plus-jakarta-sans@latest/latin-400-normal.ttf",
  JakartaMedium: "https://cdn.jsdelivr.net/fontsource/fonts/plus-jakarta-sans@latest/latin-500-normal.ttf",
  JakartaSemiBold: "https://cdn.jsdelivr.net/fontsource/fonts/plus-jakarta-sans@latest/latin-600-normal.ttf",
  JakartaBold: "https://cdn.jsdelivr.net/fontsource/fonts/plus-jakarta-sans@latest/latin-700-normal.ttf",
};

export function categoryColors(colors: ThemeColors, category: string) {
  switch (category) {
    case "luce":
      return { accent: colors.luce, on: colors.onLuce, soft: colors.luceSoft, label: "Luce", icon: "Lightning" };
    case "gas":
      return { accent: colors.gas, on: colors.onGas, soft: colors.gasSoft, label: "Gas", icon: "Flame" };
    case "telefonia":
      return { accent: colors.telefonia, on: colors.onTelefonia, soft: colors.telefoniaSoft, label: "Telefonia", icon: "WifiHigh" };
    default:
      return { accent: colors.brandPrimary, on: colors.onBrandPrimary, soft: colors.brandSecondary, label: category, icon: "Receipt" };
  }
}

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
