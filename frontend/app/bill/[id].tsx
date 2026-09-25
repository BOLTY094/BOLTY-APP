import React, { useState, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import { CheckCircle, PencilSimple, Trash, ArrowRight, TrendUp } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { CategoryIcon } from "@/src/components/category-icon";
import { H2, Muted, Button, TextField, Badge, Loader, eur, statusMeta } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: "fornitore", label: "Fornitore" },
  { key: "tipo_contratto", label: "Tipo di contratto" },
  { key: "consumi", label: "Consumi" },
  { key: "periodo_fatturazione", label: "Periodo di fatturazione" },
];
const NUM_FIELDS: { key: string; label: string }[] = [
  { key: "prezzo", label: "Prezzo unitario" },
  { key: "quota_fissa", label: "Quota fissa" },
  { key: "trasporto", label: "Trasporto" },
  { key: "imposte", label: "Imposte" },
  { key: "altre_voci", label: "Altre voci" },
  { key: "totale", label: "Totale bolletta" },
];

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
    [...TEXT_FIELDS, ...NUM_FIELDS].forEach(({ key }) => {
      f[key] = e[key] !== null && e[key] !== undefined ? String(e[key]) : "";
    });
    setForm(f);
    setEditing(true);
  };

  const confirmMut = useMutation({
    mutationFn: () => {
      const extracted: Record<string, any> = {};
      TEXT_FIELDS.forEach(({ key }) => (extracted[key] = form[key] || null));
      NUM_FIELDS.forEach(({ key }) => (extracted[key] = form[key] ? parseFloat(form[key].replace(",", ".")) : null));
      return api(`/bills/${id}/confirm`, { method: "PUT", body: { extracted } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bill", id] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setEditing(false);
      show("Dati confermati. Analisi aggiornata!", "success");
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

  const a = bill.analysis || {};
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
              <Text style={s.bannerTitle}>Abbiamo analizzato la tua bolletta</Text>
              <Muted>Ecco la tua situazione attuale.</Muted>
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

        {/* Analysis */}
        <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>La tua situazione</H2>
        <View style={s.analysisGrid}>
          <Stat label="Spesa attuale" value={`${eur(a.spesa_attuale_mese)}`} suffix="/mese" />
          <Stat label="Stima annua" value={eur(a.spesa_attuale_anno)} />
          <Stat label="Consumo annuo" value={a.consumo_annuo_stimato || "—"} />
          <Stat label="Costo medio" value={`${eur(a.costo_medio_mese)}`} suffix="/mese" />
        </View>

        <View style={[s.savingCard, { backgroundColor: cc.soft }]}>
          <TrendUp size={22} color={cc.accent} weight="bold" />
          <View style={{ flex: 1 }}>
            <Muted>Possibile risparmio stimato</Muted>
            <Text style={[s.savingValue, { color: cc.accent }]}>{eur(a.risparmio_possibile_anno)} / anno</Text>
          </View>
        </View>

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
            {TEXT_FIELDS.map((f) => (
              <TextField key={f.key} label={f.label} value={form[f.key] || ""} onChangeText={(t) => setForm((p) => ({ ...p, [f.key]: t }))} testID={`edit-${f.key}`} />
            ))}
            {NUM_FIELDS.map((f) => (
              <TextField key={f.key} label={`${f.label} (€)`} value={form[f.key] || ""} onChangeText={(t) => setForm((p) => ({ ...p, [f.key]: t }))} keyboardType="decimal-pad" testID={`edit-${f.key}`} />
            ))}
            <Button title="Conferma dati" onPress={() => confirmMut.mutate()} loading={confirmMut.isPending} testID="bill-confirm" />
            <Button title="Annulla" variant="ghost" onPress={() => setEditing(false)} />
          </View>
        ) : (
          <View style={[s.dataCard, { marginTop: spacing.md }]}>
            {TEXT_FIELDS.map((f, i) => (
              <DataRow key={f.key} label={f.label} value={bill.extracted?.[f.key] || "—"} last={false} />
            ))}
            {NUM_FIELDS.map((f, i) => (
              <DataRow key={f.key} label={f.label} value={eur(bill.extracted?.[f.key])} last={i === NUM_FIELDS.length - 1} highlight={f.key === "totale"} />
            ))}
          </View>
        )}

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

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  const s = useStyles();
  return (
    <View style={s.statBox}>
      <Muted>{label}</Muted>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
        <Text style={s.statValue} numberOfLines={1}>{value}</Text>
        {suffix ? <Text style={s.statSuffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function DataRow({ label, value, last, highlight }: { label: string; value: string; last: boolean; highlight?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.dataRow, !last && s.dataRowBorder]}>
      <Muted>{label}</Muted>
      <Text style={[s.dataValue, highlight && { fontFamily: fonts.semibold, color: colors.brandPrimary }]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg },
  bannerTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catBadge: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  analysisGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statBox: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  statValue: { fontFamily: fonts.semibold, fontSize: fontSize.xl, color: colors.onSurface },
  statSuffix: { fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.muted, marginBottom: 3 },
  savingCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md },
  savingValue: { fontFamily: fonts.semibold, fontSize: fontSize.xl, marginTop: 2 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl },
  editBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  editText: { color: colors.brandPrimary, fontFamily: fonts.medium, fontSize: fontSize.base },
  dataCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border },
  dataRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md },
  dataRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  dataValue: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurface, maxWidth: "60%", textAlign: "right" },
  pending: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: spacing.lg },
}));
