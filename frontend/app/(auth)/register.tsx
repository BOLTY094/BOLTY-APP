import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth-context";
import { openLegal } from "@/src/legal";
import { useToast } from "@/src/toast";
import { BoltyLogo } from "@/src/components/logo";
import { Button, TextField, H1, Muted } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

export default function Register() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const { show } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState("");
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    if (!name || !email || !password) {
      show("Compila tutti i campi", "error");
      return;
    }
    if (password.length < 6) {
      show("La password deve avere almeno 6 caratteri", "error");
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password, referral.trim() || undefined);
    } catch (e: any) {
      show(e.message || "Registrazione non riuscita", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + spacing["2xl"], paddingBottom: insets.bottom + spacing.xl }]}
      bottomOffset={20}
    >
      <View style={s.logoWrap}>
        <BoltyLogo width={150} height={150} />
      </View>

      <H1 style={{ marginBottom: spacing.xs }}>Crea il tuo account</H1>
      <Muted style={{ marginBottom: spacing.xl }}>Inizia a risparmiare sulle tue bollette.</Muted>

      <TextField label="Nome e cognome" value={name} onChangeText={setName} placeholder="Mario Rossi" autoCapitalize="words" testID="register-name" />
      <TextField label="Email" value={email} onChangeText={setEmail} placeholder="nome@email.it" keyboardType="email-address" autoCapitalize="none" testID="register-email" />
      <TextField label="Password" value={password} onChangeText={setPassword} placeholder="Almeno 6 caratteri" secureTextEntry testID="register-password" />
      <TextField label="Codice invito" value={referral} onChangeText={setReferral} placeholder="Es. A1B2C3" autoCapitalize="characters" optional testID="register-referral" />

      <Text style={s.legal} testID="register-legal">
        Registrandoti accetti i{" "}
        <Text style={s.footerLink} onPress={() => openLegal("terms").catch(() => {})} testID="register-terms">Termini di servizio</Text>
        {" "}e la{" "}
        <Text style={s.footerLink} onPress={() => openLegal("privacy").catch(() => {})} testID="register-privacy">Privacy Policy</Text>.
      </Text>

      <Button title="Registrati" onPress={onRegister} loading={loading} testID="register-submit" />

      <Pressable onPress={() => router.back()} style={s.footer} testID="go-login">
        <Text style={s.footerText}>
          Hai già un account? <Text style={s.footerLink}>Accedi</Text>
        </Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { paddingHorizontal: spacing.xl },
  logoWrap: { alignItems: "center", marginBottom: spacing.xl },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  logo: { fontFamily: fonts.bold, fontSize: 30, color: colors.brandPrimary, letterSpacing: 1 },
  legal: { color: colors.muted, fontFamily: fonts.regular, fontSize: fontSize.sm, lineHeight: 18, marginBottom: spacing.lg },
  footer: { alignItems: "center", marginTop: spacing.xl },
  footerText: { color: colors.muted, fontFamily: fonts.regular, fontSize: fontSize.base },
  footerLink: { color: colors.brandPrimary, fontFamily: fonts.semibold },
}));
