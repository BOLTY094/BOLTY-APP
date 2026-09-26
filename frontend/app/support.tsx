import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { EnvelopeSimple, PaperPlaneTilt, CheckCircle, Question } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { openMail, openLegal } from "@/src/legal";
import { ScreenHeader } from "@/src/components/screen-header";
import { H2, Body, Muted, Button, TextField } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

const FAQ = [
  { q: "Come carico una bolletta?", a: "Dalla Home tocca “Analizza la mia bolletta” e scegli una foto o un PDF." },
  { q: "Quanto tempo serve per ricevere un’offerta?", a: "Un consulente analizza la bolletta e propone un’offerta di norma entro 24-48 ore." },
  { q: "Come elimino il mio account?", a: "Apri Profilo → Elimina account. L’operazione è definitiva." },
];

export default function Support() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { show } = useToast();

  const { data: info } = useQuery({ queryKey: ["legal-info"], queryFn: () => api("/legal/info", { auth: false }) });
  const supportEmail: string = info?.support_email || "";

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const sendMut = useMutation({
    mutationFn: () => api("/support", { method: "POST", body: { subject: subject.trim(), message: message.trim() } }),
    onSuccess: (d: any) => {
      setSent(d.request_id);
      setSubject("");
      setMessage("");
    },
    onError: (e: any) => show(e.message || "Invio non riuscito, riprova", "error"),
  });

  const onSend = () => {
    if (subject.trim().length < 3 || message.trim().length < 10) {
      show("Inserisci un oggetto e un messaggio di almeno 10 caratteri", "error");
      return;
    }
    sendMut.mutate();
  };

  const onMail = () => {
    if (!supportEmail) return;
    openMail(supportEmail, "Assistenza Bolty").catch((e) => show(e.message || "Impossibile aprire la posta", "error"));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Assistenza" subtitle="Siamo qui per aiutarti" testID="support-header" />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
        {/* Direct contact */}
        <Pressable style={({ pressed }) => [s.mailCard, pressed && { opacity: 0.92 }]} onPress={onMail} testID="support-email">
          <View style={s.mailIcon}>
            <EnvelopeSimple size={24} color={colors.brand} weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.mailTitle}>Scrivici via email</Text>
            <Text style={s.mailAddr} testID="support-email-address">{supportEmail || "…"}</Text>
            <Muted style={{ fontSize: fontSize.sm, marginTop: 2 }}>Rispondiamo entro 2 giorni lavorativi</Muted>
          </View>
        </Pressable>

        {/* In-app form */}
        <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>Oppure inviaci un messaggio</H2>
        {sent ? (
          <View style={s.sentBox} testID="support-sent">
            <CheckCircle size={40} color={colors.success} weight="fill" />
            <Text style={s.sentTitle}>Richiesta inviata</Text>
            <Muted style={{ textAlign: "center" }}>Ti abbiamo inviato una conferma via email. Numero richiesta: {sent}</Muted>
            <Button title="Nuovo messaggio" variant="secondary" onPress={() => setSent(null)} style={{ marginTop: spacing.md, alignSelf: "stretch" }} />
          </View>
        ) : (
          <>
            <TextField label="Oggetto" value={subject} onChangeText={setSubject} placeholder="Es. Problema con il caricamento" testID="support-subject" />
            <TextField label="Messaggio" value={message} onChangeText={setMessage} placeholder="Descrivi il problema o la tua domanda" multiline testID="support-message" />
            <Button
              title="Invia richiesta"
              onPress={onSend}
              loading={sendMut.isPending}
              icon={<PaperPlaneTilt size={20} color={colors.onBrandPrimary} weight="bold" />}
              testID="support-send"
            />
          </>
        )}

        {/* FAQ */}
        <H2 style={{ marginTop: spacing["2xl"], marginBottom: spacing.md }}>Domande frequenti</H2>
        {FAQ.map((f) => (
          <View key={f.q} style={s.faq}>
            <View style={s.faqIcon}>
              <Question size={18} color={colors.brand} weight="bold" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.faqQ}>{f.q}</Text>
              <Body style={{ marginTop: 2 }}>{f.a}</Body>
            </View>
          </View>
        ))}

        <Muted style={{ marginTop: spacing.lg, fontSize: fontSize.sm, textAlign: "center" }}>
          <Text style={s.link} onPress={() => openLegal("privacy").catch(() => {})}>Privacy Policy</Text> · <Text style={s.link} onPress={() => openLegal("terms").catch(() => {})}>Termini di servizio</Text>
        </Muted>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  mailCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.accent },
  mailIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  mailTitle: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.brand },
  mailAddr: { fontFamily: fonts.medium, fontSize: fontSize.base, color: colors.onSurface, marginTop: 2 },
  sentBox: { alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  sentTitle: { fontFamily: fonts.semibold, fontSize: fontSize.xl, color: colors.onSurface },
  faq: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", marginBottom: spacing.lg },
  faqIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  faqQ: { fontFamily: fonts.semibold, fontSize: fontSize.base, color: colors.onSurface },
  link: { color: colors.brandPrimary, fontFamily: fonts.semibold },
}));
