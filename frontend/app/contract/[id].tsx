import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Square, FileText, CheckCircle } from "phosphor-react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { SignaturePad } from "@/src/components/signature-pad";
import { H2, Muted, Button, TextField, Loader, eur } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

export default function Contract() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { show } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: offer, isLoading } = useQuery({ queryKey: ["offer", id], queryFn: () => api(`/offers/${id}`) });

  const [step, setStep] = useState(0);
  const nameParts = (user?.name || "").split(" ");
  const [d, setD] = useState<Record<string, string>>({
    nome: nameParts[0] || "",
    cognome: nameParts.slice(1).join(" ") || "",
    codice_fiscale: "",
    telefono: "",
    email: user?.email || "",
    indirizzo: "",
    pod: "",
    pdr: "",
  });
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState("");

  const set = (k: string) => (t: string) => setD((p) => ({ ...p, [k]: t }));

  const createMut = useMutation({
    mutationFn: () =>
      api("/contracts", {
        method: "POST",
        body: {
          offer_id: id,
          customer_data: {
            nome: d.nome,
            cognome: d.cognome,
            codice_fiscale: d.codice_fiscale,
            telefono: d.telefono,
            email: d.email,
            indirizzo: d.indirizzo,
            pod: d.pod || null,
            pdr: d.pdr || null,
          },
          accepted_terms: accepted,
          signature: signature || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers"] });
      qc.invalidateQueries({ queryKey: ["offer", id] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setStep(2);
    },
    onError: (e: any) => show(e.message || "Errore invio richiesta", "error"),
  });

  if (isLoading || !offer) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScreenHeader title="Richiesta offerta" />
        <Loader />
      </View>
    );
  }

  const showPod = offer.category === "luce";
  const showPdr = offer.category === "gas";

  const validateStep0 = () => {
    if (!d.nome || !d.cognome || !d.codice_fiscale || !d.telefono || !d.email || !d.indirizzo) {
      show("Compila tutti i campi obbligatori", "error");
      return false;
    }
    return true;
  };

  const onPrimary = () => {
    if (step === 0) {
      if (validateStep0()) setStep(1);
    } else if (step === 1) {
      if (!accepted) {
        show("Devi accettare le condizioni contrattuali", "error");
        return;
      }
      createMut.mutate();
    }
  };

  if (step === 2) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={[s.successWrap, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={s.successIcon}>
            <CheckCircle size={72} color={colors.success} weight="fill" />
          </View>
          <H2 style={{ textAlign: "center", marginTop: spacing.lg }}>Richiesta inviata!</H2>
          <Muted style={{ textAlign: "center", marginTop: spacing.sm, paddingHorizontal: spacing.xl }}>
            Abbiamo ricevuto la tua richiesta per l’offerta {offer.provider_name}. La tua pratica è ora in lavorazione e ti terremo aggiornato via email.
          </Muted>
          <View style={{ height: spacing.xl }} />
          <Button title="Vai alle mie offerte" onPress={() => router.replace("/(tabs)/offerte")} style={s.successBtn} testID="contract-done" />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title={step === 0 ? "I tuoi dati" : "Contratto e firma"} subtitle={`Passo ${step + 1} di 2`} onBack={() => (step === 1 ? setStep(0) : router.back())} />
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: step === 0 ? "50%" : "100%" }]} />
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}
        bottomOffset={100}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 ? (
          <>
            <Muted style={{ marginBottom: spacing.lg }}>Ci servono per predisporre il contratto.</Muted>
            <TextField label="Nome" value={d.nome} onChangeText={set("nome")} autoCapitalize="words" testID="cd-nome" />
            <TextField label="Cognome" value={d.cognome} onChangeText={set("cognome")} autoCapitalize="words" testID="cd-cognome" />
            <TextField label="Codice fiscale" value={d.codice_fiscale} onChangeText={set("codice_fiscale")} autoCapitalize="characters" testID="cd-cf" />
            <TextField label="Telefono" value={d.telefono} onChangeText={set("telefono")} keyboardType="phone-pad" testID="cd-telefono" />
            <TextField label="Email" value={d.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" testID="cd-email" />
            <TextField label="Indirizzo di fornitura" value={d.indirizzo} onChangeText={set("indirizzo")} testID="cd-indirizzo" />
            {showPod ? <TextField label="Codice POD (luce)" value={d.pod} onChangeText={set("pod")} autoCapitalize="characters" optional testID="cd-pod" /> : null}
            {showPdr ? <TextField label="Codice PDR (gas)" value={d.pdr} onChangeText={set("pdr")} autoCapitalize="characters" optional testID="cd-pdr" /> : null}
          </>
        ) : (
          <>
            <View style={s.docCard}>
              <View style={s.docHead}>
                <FileText size={22} color={colors.brandPrimary} weight="fill" />
                <Text style={s.docTitle}>Condizioni contrattuali</Text>
              </View>
              <Muted style={{ lineHeight: 20 }}>
                Con la presente richiesta accetti di attivare l’offerta {offer.provider_name} al prezzo di {eur(offer.proposed_monthly)}/mese.
                Un consulente Bolty verificherà i dati e completerà il passaggio del contratto. Potrai recedere secondo i termini di legge (diritto di ripensamento entro 14 giorni).
                I tuoi dati saranno trattati nel rispetto del GDPR.
              </Muted>
            </View>

            <Pressable style={s.checkRow} onPress={() => setAccepted((v) => !v)} testID="accept-terms">
              {accepted ? <CheckSquare size={26} color={colors.brandPrimary} weight="fill" /> : <Square size={26} color={colors.borderStrong} />}
              <Text style={s.checkText}>Ho letto e accetto le condizioni contrattuali e la privacy policy.</Text>
            </Pressable>

            <H2 style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>Firma digitale</H2>
            <Muted style={{ marginBottom: spacing.md }}>Facoltativa, ma velocizza l’attivazione.</Muted>
            <SignaturePad onChange={setSignature} testID="signature-pad" />
          </>
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button
            title={step === 0 ? "Continua" : "Invia richiesta"}
            onPress={onPrimary}
            loading={createMut.isPending}
            testID="contract-primary"
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  progressTrack: { height: 4, backgroundColor: colors.surfaceTertiary },
  progressFill: { height: 4, backgroundColor: colors.brandPrimary },
  docCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  docHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  docTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginTop: spacing.lg },
  checkText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurface, lineHeight: 20 },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  successIcon: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  successBtn: { alignSelf: "stretch", marginHorizontal: spacing.xl },
}));
