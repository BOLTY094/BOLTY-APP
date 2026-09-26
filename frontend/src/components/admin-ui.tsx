import React from "react";
import { View, Text, Pressable, ScrollView, TextInput, Platform, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { MagnifyingGlass, FileArrowDown, CaretRight, Headset } from "phosphor-react-native";

import { API, loadToken } from "@/src/api";
import { H1, Muted, Badge, statusMeta } from "@/src/components/ui";

const categoryLabel = (c: string) => ({ luce: "Luce", gas: "Gas", telefonia: "Telefonia" } as Record<string, string>)[c] || c;
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

export const CONTACT_STATUS: Record<string, { label: string; tone: "info" | "warning" | "success" | "neutral" }> = {
  nuovo: { label: "Nuovo", tone: "info" },
  da_contattare: { label: "Da contattare", tone: "warning" },
  contattato: { label: "Contattato", tone: "info" },
  in_lavorazione: { label: "In lavorazione", tone: "warning" },
  concluso: { label: "Concluso", tone: "success" },
};

export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const NR = "Non rilevato";

// Opens the ORIGINAL uploaded file (admin Bearer auth, no permanent public URL).
export async function openOriginalFile(storagePath: string) {
  const token = await loadToken();
  const url = `${API}/files/${storagePath}?token=${encodeURIComponent(token || "")}`;
  if (Platform.OS === "web") window.open(url, "_blank", "noopener");
  else await WebBrowser.openBrowserAsync(url);
}

export function AdminPage({ title, subtitle, children, refreshing, onRefresh, right, testID }: { title: string; subtitle?: string; children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void; right?: React.ReactNode; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["2xl"], maxWidth: 1100, width: "100%", alignSelf: "center" }}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} /> : undefined}
      testID={testID}
    >
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <H1>{title}</H1>
          {subtitle ? <Muted style={{ marginTop: 2 }}>{subtitle}</Muted> : null}
        </View>
        {right}
      </View>
      {children}
    </ScrollView>
  );
}

export function StatCard({ label, value, hint, tone, testID }: { label: string; value: string | number; hint?: string; tone?: "brand" | "accent"; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.stat, tone === "brand" && { backgroundColor: colors.brand, borderColor: colors.brand }, tone === "accent" && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]} testID={testID}>
      <Text style={[s.statLabel, tone === "brand" && { color: "rgba(255,255,255,0.75)" }]}>{label}</Text>
      <Text style={[s.statValue, tone === "brand" && { color: colors.onBrand }]}>{value}</Text>
      {hint ? <Text style={[s.statHint, tone === "brand" && { color: "rgba(255,255,255,0.7)" }]}>{hint}</Text> : null}
    </View>
  );
}

export function SearchBar({ value, onChange, placeholder, testID }: { value: string; onChange: (v: string) => void; placeholder?: string; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.search}>
      <MagnifyingGlass size={18} color={colors.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder || "Cerca…"} placeholderTextColor={colors.muted} style={s.searchInput} autoCapitalize="none" autoCorrect={false} testID={testID} />
    </View>
  );
}

export function FilterChips({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.chip, active && { backgroundColor: colors.brand }]} testID={`filter-${o.key}`}>
            <Text style={[s.chipText, active && { color: colors.onBrand }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// One bill in admin lists: who, supplier, holder, status, contacts, original file.
export function AdminBillRow({ bill, showContactStatus }: { bill: any; showContactStatus?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const ex = bill.extracted || {};
  const st = statusMeta(bill.status);
  const cs = bill.contact_request?.status ? CONTACT_STATUS[bill.contact_request.status] : null;
  return (
    <Pressable style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceTertiary }]} onPress={() => router.push(`/admin/bill/${bill.bill_id}`)} testID={`admin-bill-${bill.bill_id}`}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={s.rowTop}>
          <Text style={s.rowTitle} numberOfLines={1}>{ex.intestatario || bill.customer?.name || bill.user_name || "Cliente"}</Text>
          <Badge label={st.label} tone={st.tone} />
          {showContactStatus && cs ? <Badge label={cs.label} tone={cs.tone} /> : null}
        </View>
        <Muted numberOfLines={1}>{categoryLabel(bill.category)} · {ex.fornitore || NR} · {fmtDateTime(bill.created_at)}</Muted>
        <Muted numberOfLines={1} style={{ fontSize: fontSize.sm }}>
          {[ex.codice_fiscale && `CF ${ex.codice_fiscale}`, ex.partita_iva && `P.IVA ${ex.partita_iva}`, bill.contact_email || bill.customer?.email, bill.contact_phone].filter(Boolean).join(" · ") || "Nessun recapito"}
        </Muted>
        <Muted numberOfLines={1} style={{ fontSize: fontSize.sm }}>{bill.file_name || "file"}</Muted>
      </View>
      {bill.contact_request ? <Headset size={18} color={colors.brandPrimary} weight="fill" /> : null}
      {bill.storage_path ? (
        <Pressable onPress={() => openOriginalFile(bill.storage_path).catch(() => {})} hitSlop={8} style={s.fileBtn} testID={`admin-file-${bill.bill_id}`}>
          <FileArrowDown size={20} color={colors.brand} weight="fill" />
        </Pressable>
      ) : null}
      <CaretRight size={18} color={colors.muted} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const s = useStyles();
  return <View style={[s.card, style]}>{children}</View>;
}

const useStyles = makeStyles((colors) => ({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  stat: { flexBasis: 150, flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 2 },
  statLabel: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.muted },
  statValue: { fontFamily: fonts.bold, fontSize: fontSize["2xl"], color: colors.onSurface },
  statHint: { fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 46 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurface, paddingVertical: 8, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}) },
  chip: { paddingHorizontal: spacing.md, minHeight: 34, justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  chipText: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  rowTitle: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface, flexShrink: 1 },
  fileBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
}));
