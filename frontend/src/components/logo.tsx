import React from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { Lightning } from "phosphor-react-native";

import { useTheme, fonts } from "@/src/theme";

// Full logo (bolt mascot + wordmark + tagline) from the brand asset.
export function BoltyLogo({ width = 200, height = 180 }: { width?: number; height?: number }) {
  return (
    <Image
      source={require("@/assets/images/bolty-logo.jpg")}
      style={{ width, height }}
      contentFit="contain"
      testID="bolty-logo"
    />
  );
}

// Compact wordmark lockup for headers.
export function BoltyWordmark({ size = 22 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View
        style={{
          width: size + 6,
          height: size + 6,
          borderRadius: (size + 6) / 2,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Lightning size={size - 4} color={colors.brand} weight="fill" />
      </View>
      <Text style={{ fontFamily: fonts.bold, fontSize: size, color: colors.brand, letterSpacing: -0.5 }}>bolty</Text>
    </View>
  );
}
