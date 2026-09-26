import { Platform, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

import { API } from "@/src/api";

// Public HTTPS legal pages served by the backend (also usable as App Store Connect URLs).
export const LEGAL_URLS = {
  privacy: `${API}/legal/privacy`,
  terms: `${API}/legal/terms`,
  support: `${API}/legal/support`,
} as const;

export async function openLegal(kind: keyof typeof LEGAL_URLS) {
  const url = LEGAL_URLS[kind];
  if (Platform.OS === "web") {
    window.open(url, "_blank", "noopener");
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}

export async function openMail(to: string, subject: string) {
  const url = `mailto:${to}?subject=${encodeURIComponent(subject)}`;
  const ok = await Linking.canOpenURL(url).catch(() => false);
  if (!ok && Platform.OS !== "web") throw new Error("Nessuna app di posta configurata");
  await Linking.openURL(url);
}
