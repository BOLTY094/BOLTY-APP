import React from "react";
import { Lightning, Flame, WifiHigh, Receipt } from "phosphor-react-native";

export function CategoryIcon({ category, size = 24, color, weight = "fill" }: { category: string; size?: number; color: string; weight?: any }) {
  switch (category) {
    case "luce":
      return <Lightning size={size} color={color} weight={weight} />;
    case "gas":
      return <Flame size={size} color={color} weight={weight} />;
    case "telefonia":
      return <WifiHigh size={size} color={color} weight={weight} />;
    default:
      return <Receipt size={size} color={color} weight={weight} />;
  }
}
