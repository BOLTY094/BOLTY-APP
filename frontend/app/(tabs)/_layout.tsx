import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { House, Lightning, Receipt, Tag } from "phosphor-react-native";

import { useTheme, fonts } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

export default function TabsLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    const { NativeTabs } = require("expo-router/unstable-native-tabs");
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="house.fill" />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="forniture">
          <NativeTabs.Trigger.Icon sf="bolt.fill" />
          <NativeTabs.Trigger.Label>Forniture</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="bollette">
          <NativeTabs.Trigger.Icon sf="doc.text.fill" />
          <NativeTabs.Trigger.Label>Bollette</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="offerte">
          <NativeTabs.Trigger.Icon sf="tag.fill" />
          <NativeTabs.Trigger.Label>Offerte</NativeTabs.Trigger.Label>
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
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color, focused }) => <House size={24} color={color} weight={focused ? "fill" : "regular"} /> }}
      />
      <Tabs.Screen
        name="forniture"
        options={{ title: "Forniture", tabBarIcon: ({ color, focused }) => <Lightning size={24} color={color} weight={focused ? "fill" : "regular"} /> }}
      />
      <Tabs.Screen
        name="bollette"
        options={{ title: "Bollette", tabBarIcon: ({ color, focused }) => <Receipt size={24} color={color} weight={focused ? "fill" : "regular"} /> }}
      />
      <Tabs.Screen
        name="offerte"
        options={{ title: "Offerte", tabBarIcon: ({ color, focused }) => <Tag size={24} color={color} weight={focused ? "fill" : "regular"} /> }}
      />
    </Tabs>
  );
}
