import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trash, CheckSquare, Square, Warning, Receipt, FileText, Bell, Gift, AppleLogo, Files } from "phosphor-react-native";

import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/toast";
import { openLegal } from "@/src/legal";
import { ScreenHeader } from "@/src/components/screen-header";
import { H1, Body, Muted, Button } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

// Confirmation screen for permanent account deletion (Apple 5.1.1(v)).
export default function DeleteAccount() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, deleteAccount } = useAuth();
  const { show } = useToast();
  const [understood, setUnderstood] = useState(false);
  const [loading, setLoading] = useState(false);

  const isApple = user?.auth_provider === "apple";

  const performDelete = async () => {
    setLoading(true);
    try {
      await deleteAccount();
      // The root gate sends the user back to login once `user` becomes null.
      show("Account eliminato. Ci dispiace vederti andare.", "success");
    } catch (e: any) {
      show(e.message || "Eliminazione non riuscita, riprova", "error");
      setLoading(false);
    }
  };

  const confirm = () => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm("Eliminare definitivamente il tuo account? L'operazione non può essere annullata.")) performDelete();
      return;
    }
    Alert.alert(
      "Eliminare l'account?",
      "L'operazione è definitiva: account, bollette e dati personali verranno rimossi.",
      [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: performDelete },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Elimina account" testID="delete-header" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["3xl"] }} showsVerticalScrollIndicator={false}>
        <View style={s.warnBox}>
          <Warning size={28} color={colors.error} weight="fill" />
          <View style={{ flex: 1 }}>
            <H1 style={{ fontSize: fontSize.xl, lineHeight: 26 }}>Questa operazione è definitiva</H1>
            <Body style={{ marginTop: spacing.xs }}>
              Eliminando l’account di <Text style={{ fontFamily: fonts.semibold }}>{user?.email || user?.name}</Text> non potrai più accedere né recuperare i tuoi dati.
            </Body>
          </View>
        </View>

        <Text style={s.sectionLabel}>Cosa verrà eliminato</Text>
        <View style={s.list}>
          <Row icon={<Receipt size={18} color={colors.brand} weight="fill" />} text="Il tuo account e i dati del profilo (nome, email, accessi)" />
          <Row icon={<Files size={18} color={colors.brand} weight="fill" />} text="Tutte le bollette caricate, i file PDF/foto e le analisi" />
          <Row icon={<FileText size={18} color={colors.brand} weight="fill" />} text="Offerte ricevute e richieste di contratto in corso" />
          <Row icon={<Bell size={18} color={colors.brand} weight="fill" />} text="Notifiche e sessioni attive su tutti i dispositivi" />
          <Row icon={<Gift size={18} color={colors.brand} weight="fill" />} text="Codice invito, inviti e premi non ancora riscattati" last={!isApple} />
          {isApple ? <Row icon={<AppleLogo size={18} color={colors.brand} weight="fill" />} text="Il collegamento con il tuo Apple ID (Sign in with Apple) viene revocato" last /> : null}
        </View>

        <Muted style={{ marginTop: spacing.lg, lineHeight: 20 }}>
          I dati relativi a contratti già conclusi possono essere conservati in forma limitata per gli obblighi di legge, come descritto nella{" "}
          <Text style={s.link} onPress={() => openLegal("privacy").catch(() => {})}>Privacy Policy</Text>.
          Se preferisci, puoi anche richiedere l’eliminazione dalla sezione Assistenza.
        </Muted>

        <Pressable style={s.checkRow} onPress={() => setUnderstood((v) => !v)} testID="delete-understood">
          {understood ? <CheckSquare size={26} color={colors.brandPrimary} weight="fill" /> : <Square size={26} color={colors.borderStrong} />}
          <Text style={s.checkText}>Ho capito che l’eliminazione è definitiva e non può essere annullata.</Text>
        </Pressable>

        <Button
          title="Elimina definitivamente il mio account"
          onPress={confirm}
          disabled={!understood}
          loading={loading}
          color={colors.error}
          textColor={colors.onError}
          icon={<Trash size={20} color={colors.onError} weight="bold" />}
          style={{ marginTop: spacing.xl }}
          testID="delete-confirm"
        />
      </ScrollView>
    </View>
  );
}

function Row({ icon, text, last }: { icon: React.ReactNode; text: string; last?: boolean }) {
  const s = useStyles();
  return (
    <View style={[s.row, !last && s.rowBorder]}>
      <View style={s.rowIcon}>{icon}</View>
      <Body style={{ flex: 1 }}>{text}</Body>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  warnBox: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.error },
  sectionLabel: { fontFamily: fonts.medium, fontSize: fontSize.sm, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: spacing.xs },
  list: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  link: { color: colors.brandPrimary, fontFamily: fonts.semibold },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginTop: spacing.xl },
  checkText: { flex: 1, fontFamily: fonts.regular, fontSize: fontSize.base, color: colors.onSurface, lineHeight: 20 },
}));
