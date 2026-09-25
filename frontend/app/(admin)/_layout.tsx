import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { SquaresFour, Tray, FileText } from "phosphor-react-native";

import { useTheme, fonts } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

export default function AdminLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    const { NativeTabs } = require("expo-router/unstable-native-tabs");
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" />
          <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="queue">
          <NativeTabs.Trigger.Icon sf="tray.full.fill" />
          <NativeTabs.Trigger.Label>Da analizzare</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="contratti">
          <NativeTabs.Trigger.Icon sf="doc.text.fill" />
          <NativeTabs.Trigger.Label>Contratti</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.divider,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: ({ color, focused }) => <SquaresFour size={24} color={color} weight={focused ? "fill" : "regular"} /> }} />
      <Tabs.Screen name="queue" options={{ title: "Da analizzare", tabBarIcon: ({ color, focused }) => <Tray size={24} color={color} weight={focused ? "fill" : "regular"} /> }} />
      <Tabs.Screen name="contratti" options={{ title: "Contratti", tabBarIcon: ({ color, focused }) => <FileText size={24} color={color} weight={focused ? "fill" : "regular"} /> }} />
    </Tabs>
  );
}
