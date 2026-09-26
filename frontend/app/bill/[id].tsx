import React, { useState, useMemo } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import { CheckCircle, PencilSimple, Trash, ArrowRight, FileArrowDown } from "phosphor-react-native";

import { api, API, loadToken } from "@/src/api";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { CategoryIcon } from "@/src/components/category-icon";
import { H2, Muted, Button, TextField, Badge, Loader, statusMeta } from "@/src/components/ui";
import { ContactRequest } from "@/src/components/contact-request";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

// Only data really printed on the bill. Amounts/consumption are never shown as extracted values.
const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: "fornitore", label: "Fornitore" },
  { key: "intestatario", label: "Intestatario" },
  { key: "codice_fiscale", label: "Codice fiscale" },
  { key: "partita_iva", label: "Partita IVA" },
];
const NOT_FOUND = "Non rilevato";

export default function BillDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { show } = useToast();
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();

  const { data: bill, isLoading } = useQuery({ queryKey: ["bill", id], queryFn: () => api(`/bills/${id}`) });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const cc = useMemo(() => categoryColors(colors, bill?.category || ""), [colors, bill]);

  const startEdit = () => {
    const e = bill?.extracted || {};
    const f: Record<string, string> = {};
    TEXT_FIELDS.forEach(({ key }) => {
      f[key] = e[key] !== null && e[key] !== undefined ? String(e[key]) : "";
    });
    setForm(f);
    setEditing(true);
  };

  const confirmMut = useMutation({
    mutationFn: () => {
      const extracted: Record<string, any> = {};
      TEXT_FIELDS.forEach(({ key }) => (extracted[key] = form[key]?.trim() || null));
      return api(`/bills/${id}/confirm`, { method: "PUT", body: { extracted } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bill", id] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setEditing(false);
      show("Dati confermati", "success");
    },
    onError: (e: any) => show(e.message || "Errore", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => api(`/bills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      show("Bolletta eliminata", "success");
      router.back();
    },
  });

  if (isLoading || !bill) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader title="Bolletta" />
        <Loader />
      </View>
    );
  }

  const st = statusMeta(bill.status);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader
        title={cc.label}
        subtitle={bill.extracted?.fornitore || undefined}
        right={
          <Pressable onPress={() => deleteMut.mutate()} hitSlop={10} testID="bill-delete">
            <Trash size={20} color={colors.error} />
          </Pressable>
        }
      />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["2xl"] }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        {isNew ? (
          <Animated.View entering={FadeInDown} style={[s.banner, { backgroundColor: colors.brandTertiary }]}>
            <CheckCircle size={26} color={colors.success} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={s.bannerTitle}>Abbiamo letto la tua bolletta</Text>
              <Muted>Controlla i dati rilevati dal documento.</Muted>
            </View>
          </Animated.View>
        ) : (
          <View style={s.statusRow}>
            <View style={[s.catBadge, { backgroundColor: cc.soft }]}>
              <CategoryIcon category={bill.category} color={cc.accent} size={20} />
            </View>
            <Badge label={st.label} tone={st.tone} />
          </View>
        )}

        {/* Original file */}
        {bill.storage_path ? (
          <Pressable
            style={({ pressed }) => [s.fileRow, pressed && { opacity: 0.85 }]}
            onPress={async () => {
              try {
                const token = await loadToken();
                const url = `${API}/files/${bill.storage_path}?token=${encodeURIComponent(token || "")}`;
                if (Platform.OS === "web") window.open(url, "_blank", "noopener");
                else await WebBrowser.openBrowserAsync(url);
              } catch {
                show("Impossibile aprire il file", "error");
              }
            }}
            testID="bill-open-file"
          >
            <FileArrowDown size={20} color={colors.brandPrimary} weight="fill" />
            <Text style={s.fileText} numberOfLines={1}>Apri il file originale{bill.file_name ? ` · ${bill.file_name}` : ""}</Text>
          </Pressable>
        ) : null}

        {/* Extracted data */}
        <View style={s.headRow}>
          <H2>Dati estratti</H2>
          {!editing ? (
            <Pressable style={s.editBtn} onPress={startEdit} testID="bill-edit">
              <PencilSimple size={16} color={colors.brandPrimary} weight="bold" />
              <Text style={s.editText}>Correggi</Text>
            </Pressable>
          ) : null}
        </View>

        {editing ? (
          <View style={{ marginTop: spacing.md }}>
            <Muted style={{ marginBottom: spacing.md }}>Riporta i dati esattamente come compaiono sulla bolletta. Lascia vuoto ciò che non è presente.</Muted>
            {TEXT_FIELDS.map((f) => (
              <TextField key={f.key} label={f.label} value={form[f.key] || ""} onChangeText={(t) => setForm((p) => ({ ...p, [f.key]: t }))} autoCapitalize={f.key === "codice_fiscale" ? "characters" : "words"} optional testID={`edit-${f.key}`} />
            ))}
            <Button title="Conferma dati" onPress={() => confirmMut.mutate()} loading={confirmMut.isPending} testID="bill-confirm" />
            <Button title="Annulla" variant="ghost" onPress={() => setEditing(false)} />
          </View>
        ) : (
          <>
            <View style={[s.dataCard, { marginTop: spacing.md }]}>
              {TEXT_FIELDS.map((f, i) => (
                <DataRow key={f.key} label={f.label} value={bill.extracted?.[f.key] || NOT_FOUND} last={i === TEXT_FIELDS.length - 1} muted={!bill.extracted?.[f.key]} />
              ))}
            </View>
            <Muted style={{ marginTop: spacing.sm, fontSize: fontSize.sm }}>
              I dati provengono esclusivamente dal documento caricato. Consumi e importi non vengono stimati: li valuterà il consulente sulla bolletta originale.
            </Muted>
          </>
        )}

        {/* Consultant call-back */}
        <ContactRequest billId={bill.bill_id} existing={bill.contact_request} />

        {/* Offer CTA */}
        {bill.offer ? (
          <Button
            title="Vedi la nostra offerta"
            onPress={() => router.push(`/offer/${bill.offer.offer_id}`)}
            icon={<ArrowRight size={20} color={colors.onBrandPrimary} weight="bold" />}
            style={{ marginTop: spacing.xl }}
            testID="bill-view-offer"
          />
        ) : (
          <View style={[s.pending, { marginTop: spacing.xl }]}>
            <Muted style={{ textAlign: "center" }}>
              ⏳ Un nostro consulente sta preparando la proposta migliore per te. Ti avviseremo appena è pronta.
            </Muted>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function DataRow({ label, value, last, muted }: { label: string; value: string; last: boolean; muted?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.dataRow, !last && s.dataRowBorder]} testID={`data-${label}`}>
      <Muted>{label}</Muted>
      <Text style={[s.dataValue, muted && { color: colors.muted, fontFamily: fonts.regular }]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, minHeight: 48 },
  fileText: { flex: 1, fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.brandPrimary },
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg },
  bannerTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catBadge: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl },
  editBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  editText: { color: colors.brandPrimary, fontFamily: fonts.medium, fontSize: fontSize.base },
  dataCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border },
  dataRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md },
  dataRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  dataValue: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurface, maxWidth: "60%", textAlign: "right" },
  pending: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: spacing.lg },
}));
