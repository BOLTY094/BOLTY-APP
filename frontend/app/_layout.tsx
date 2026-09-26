import React, { useEffect } from "react";
import { View, LogBox } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth-context";
import { ToastProvider } from "@/src/toast";
import { Loader } from "@/src/components/ui";
import { fontSources, useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

function RootNavigator() {
  const { user, loading, welcomePending } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const root = segments[0];
    const inAuth = root === "(auth)";
    if (!user) {
      if (!inAuth) router.replace("/(auth)/login");
      return;
    }
    // Fresh login: show the animated bolt welcome, which then routes to the home.
    if (welcomePending) {
      if (root !== "welcome") router.replace("/welcome");
      return;
    }
    if (user.role === "admin") {
      const allowed = ["(admin)", "admin", "welcome", "change-password", "support", "notifications"];
      if (!allowed.includes(root as string)) router.replace("/(admin)");
    } else {
      if (inAuth || !root || root === "(admin)" || root === "admin") router.replace("/(tabs)");
    }
  }, [user, loading, welcomePending, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <Loader testID="root-loading" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="welcome" options={{ animation: "fade", gestureEnabled: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontSources);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <AuthProvider>
                <ToastProvider>
                  <StatusBar style="dark" />
                  <RootNavigator />
                </ToastProvider>
              </AuthProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
