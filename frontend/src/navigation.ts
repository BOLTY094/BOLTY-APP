import { Platform } from "react-native";

// "unstable" import path only; production-ready. iOS 26+ gets native liquid-glass tabs.
export const usesNativeTabs =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
