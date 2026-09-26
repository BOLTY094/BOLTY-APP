import React, { useState, useEffect, useMemo } from "react";
import { View, Text } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendUp } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { CategoryIcon } from "@/src/components/category-icon";
import { H2, Muted, Button, TextField, Badge, Loader, eur, statusMeta } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

const DATA_FIELDS: { key: string; label: string }[] = [
  { key: "fornitore", label: "Fornitore" },
  { key: "intestatario", label: "Intestatario" },
  { key: "tipo_intestatario", label: "Tipo" },
  { key: "codice_fiscale", label: "Codice fiscale" },
  { key: "partita_iva", label: "Partita IVA" },
];

export default function AdminBillDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { show } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: bill, isLoading } = useQuery({ queryKey: ["admin-bill", id], queryFn: () => api(`/bills/${id}`) });

  const [provider, setProvider] = useState("");
  const [current, setCurrent] = useState("");
  const [proposed, setProposed] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!bill) return;
    const existing = bill.offer;
    if (existing) {
      setProvider(existing.provider_name || "");
      setCurrent(String(existing.current_monthly ?? ""));
      setProposed(String(existing.proposed_monthly ?? ""));
      setNotes(existing.notes || "");
    } else {
      // No estimates: the consultant reads the amounts on the original bill
      setProvider("");
      setCurrent("");
      setProposed("");
      setNotes("");
    }
  }, [bill]);

  const cc = useMemo(() => categoryColors(colors, bill?.category || ""), [colors, bill]);
  const annualSaving = (() => {
    const c = parseFloat(current.replace(",", ".")) || 0;
    const p = parseFloat(proposed.replace(",", ".")) || 0;
    return Math.round((c - p) * 12 * 100) / 100;
  })();

  const saveMut = useMutation({
    mutationFn: () =>
      api(`/admin/bills/${id}/offer`, {
        method: "POST",
        body: {
          provider_name: provider,
          current_monthly: parseFloat(current.replace(",", ".")) || 0,
          proposed_monthly: parseFloat(proposed.replace(",", ".")) || 0,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-bill", id] });
      qc.invalidateQueries({ queryKey: ["admin-bills"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      show("Offerta inviata al cliente!", "success");
      router.back();
    },
    onError: (e: any) => show(e.message || "Errore", "error"),
  });

  if (isLoading || !bill) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader title="Bolletta" />
        <Loader />
      </View>
    );
  }

  const canSave = provider && current && proposed;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={`${cc.label} · ${bill.user_name || "Cliente"}`} subtitle={bill.user_email || undefined} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["2xl"] }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headRow}>
          <View style={[s.icon, { backgroundColor: cc.soft }]}>
            <CategoryIcon category={bill.category} color={cc.accent} size={22} />
          </View>
          <Badge label={statusMeta(bill.status).label} tone={statusMeta(bill.status).tone} />
        </View>

        <H2 style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>Dati della bolletta</H2>
        <View style={s.dataCard}>
          {DATA_FIELDS.map((f, i) => (
            <View key={f.key} style={[s.dataRow, i !== DATA_FIELDS.length - 1 && s.border]}>
              <Muted>{f.label}</Muted>
              <Text style={s.dataVal}>{bill.extracted?.[f.key] || "Non rilevato"}</Text>
            </View>
          ))}
        </View>

        {bill.contact_request ? (
          <View style={[s.card, { borderColor: colors.success }]} testID="admin-contact-request">
            <Text style={s.cardTitle}>Il cliente chiede di essere ricontattato</Text>
            <Text style={[s.dataVal, { maxWidth: "100%", textAlign: "left" }]}>{[bill.contact_request.email, bill.contact_request.phone].filter(Boolean).join(" · ")}</Text>
            <Muted style={{ marginTop: 4 }}>Consenso prestato il {new Date(bill.contact_request.consent_at).toLocaleDateString("it-IT")}</Muted>
          </View>
        ) : null}

        <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>Proponi un’offerta</H2>
        <Muted style={{ marginBottom: spacing.lg }}>Controlla i valori e invia la proposta al cliente.</Muted>

        <TextField label="Nome fornitore proposto" value={provider} onChangeText={setProvider} placeholder="Es. NeN Energia" testID="offer-provider" />
        <TextField label="Situazione attuale (€/mese)" value={current} onChangeText={setCurrent} keyboardType="decimal-pad" testID="offer-current" />
        <TextField label="Nostra proposta (€/mese)" value={proposed} onChangeText={setProposed} keyboardType="decimal-pad" testID="offer-proposed" />
        <TextField label="Note per il cliente" value={notes} onChangeText={setNotes} placeholder="Dettagli dell'offerta…" multiline optional testID="offer-notes" />

        <View style={[s.savingPreview, { backgroundColor: cc.soft }]}>
          <TrendUp size={22} color={cc.accent} weight="bold" />
          <View>
            <Muted>Risparmio annuo stimato</Muted>
            <Text style={[s.savingVal, { color: cc.accent }]}>{eur(annualSaving)}</Text>
          </View>
        </View>

        <Button
          title={bill.offer ? "Aggiorna offerta" : "Invia offerta al cliente"}
          onPress={() => saveMut.mutate()}
          loading={saveMut.isPending}
          disabled={!canSave}
          style={{ marginTop: spacing.lg }}
          testID="offer-submit"
        />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  dataCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border },
  dataRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.md, gap: spacing.md },
  border: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  dataVal: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurface, maxWidth: "58%", textAlign: "right" },
  card: { marginTop: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface, marginBottom: spacing.xs },
  savingPreview: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md },
  savingVal: { fontFamily: fonts.semibold, fontSize: fontSize.xl, marginTop: 2 },
}));
