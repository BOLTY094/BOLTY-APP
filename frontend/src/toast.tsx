import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Text, View, Platform } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle, WarningCircle, Info } from "phosphor-react-native";

import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

type ToastType = "success" | "error" | "info";
type ToastState = { id: number; message: string; type: ToastType } | null;

const ToastContext = createContext<{ show: (m: string, t?: ToastType) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, type: ToastType = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, type });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const iconColor =
    toast?.type === "success" ? colors.success : toast?.type === "error" ? colors.error : colors.brandPrimary;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View
          entering={FadeInUp.springify().damping(18)}
          exiting={FadeOutUp}
          pointerEvents="none"
          style={[styles.wrap, { top: insets.top + spacing.sm }]}
          testID="app-toast"
        >
          <View style={styles.toast}>
            {toast.type === "success" ? (
              <CheckCircle size={22} weight="fill" color={iconColor} />
            ) : toast.type === "error" ? (
              <WarningCircle size={22} weight="fill" color={iconColor} />
            ) : (
              <Info size={22} weight="fill" color={iconColor} />
            )}
            <Text style={styles.text} numberOfLines={3}>
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 480,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 6 },
      default: {},
    }),
  },
  text: {
    flex: 1,
    color: colors.onSurfaceSecondary,
    fontFamily: fonts.medium,
    fontSize: fontSize.base,
  },
}));
