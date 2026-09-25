import React from "react";
import { View } from "react-native";
import { Loader } from "@/src/components/ui";
import { useTheme } from "@/src/theme";

// The root-layout gate handles all redirects based on auth state.
export default function Index() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Loader testID="index-loading" />
    </View>
  );
}
