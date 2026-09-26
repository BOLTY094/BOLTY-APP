import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Square, CheckCircle, Headset } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { openLegal } from "@/src/legal";
import { Body, Muted, Button, TextField } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^\+?[0-9]{6,15}$/;

// Voluntary call-back request: the customer leaves email and/or phone for a consultant.
// Fields are never pre-filled; consent is required before sending.
export function ContactRequest({ billId, existing }: { billId: string; existing: { email?: string | null; phone?: string | null; consent_at?: string } | null }) {
  const s = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { show } = useToast();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);

  const mut = useMutation({
    mutationFn: () => api(`/bills/${billId}/contact`, { method: "POST", body: { email: email.trim() || null, phone: phone.trim() || null, consent } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bill", billId] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      show("Richiesta inviata: ti contatteremo presto", "success");
    },
    onError: (e: any) => show(e.message || "Invio non riuscito", "error"),
  });

  const submit = () => {
    const e = email.trim();
    const p = phone.replace(/[\s().-]/g, "");
    if (!e && !p) return show("Inserisci almeno un recapito: email o telefono", "error");
    if (e && !EMAIL_RE.test(e)) return show("Indirizzo email non valido", "error");
    if (p && !PHONE_RE.test(p)) return show("Numero di telefono non valido", "error");
    if (!consent) return show("Per essere ricontattato devi acconsentire al trattamento dei dati", "error");
    mut.mutate();
  };

  if (existing) {
    return (
      <View style={[s.card, { borderColor: colors.success }]} testID="contact-sent">
        <View style={s.head}>
          <CheckCircle size={24} color={colors.success} weight="fill" />
          <Text style={s.title}>Richiesta di contatto inviata</Text>
        </View>
        <Body>Un nostro consulente ti contatterà per spiegarti la soluzione più adatta alle tue esigenze.</Body>
        <Muted style={{ marginTop: spacing.sm }}>
          Recapiti indicati: {[existing.email, existing.phone].filter(Boolean).join(" · ") || "—"}
        </Muted>
      </View>
    );
  }

  return (
    <View style={s.card} testID="contact-request">
      <View style={s.head}>
        <View style={s.icon}>
          <Headset size={20} color={colors.brand} weight="fill" />
        </View>
        <Text style={s.title}>Vuoi ricevere maggiori informazioni sulla tua offerta?</Text>
      </View>
      <Body style={{ marginBottom: spacing.md }}>
        Lascia i tuoi recapiti e un nostro consulente ti contatterà per spiegarti la soluzione più adatta alle tue esigenze. Puoi indicare l’email, il telefono o entrambi.
      </Body>
      <TextField label="Email" value={email} onChangeText={setEmail} placeholder="nome@esempio.it" keyboardType="email-address" autoCapitalize="none" optional testID="contact-email" />
      <TextField label="Numero di telefono" value={phone} onChangeText={setPhone} placeholder="+39 333 1234567" keyboardType="phone-pad" optional testID="contact-phone" />

      <Pressable style={s.consentRow} onPress={() => setConsent((v) => !v)} testID="contact-consent">
        {consent ? <CheckSquare size={24} color={colors.brandPrimary} weight="fill" /> : <Square size={24} color={colors.borderStrong} />}
        <Text style={s.consentText}>
          Acconsento al trattamento dei recapiti indicati da parte di Bolty al solo scopo di essere ricontattato da un consulente in merito a questa bolletta, come descritto nella{" "}
          <Text style={s.link} onPress={() => openLegal("privacy").catch(() => {})}>Privacy Policy</Text>. Posso revocare il consenso in qualsiasi momento scrivendo all’assistenza.
        </Text>
      </Pressable>

      <Button title="Richiedi di essere contattato" onPress={submit} loading={mut.isPending} disabled={!consent} testID="contact-submit" />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { marginTop: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.onSurface, lineHeight: 22 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.lg },
  consentText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, lineHeight: 18 },
  link: { color: colors.brandPrimary, fontFamily: fonts.semibold },
}));
