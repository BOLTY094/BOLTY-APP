import React, { useState, useEffect } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleLogo } from "phosphor-react-native";

import { useAuth } from "@/src/auth-context";
import { openLegal } from "@/src/legal";
import { useToast } from "@/src/toast";
import { BoltyLogo } from "@/src/components/logo";
import { Button, TextField, H1, Muted } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize } from "@/src/theme";

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const { show } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);

  const onApple = async () => {
    try {
      await loginWithApple();
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") return;
      show(e.message || "Accesso Apple non riuscito", "error");
    }
  };

  const onLogin = async () => {
    if (!email || !password) {
      show("Inserisci email e password", "error");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      show(e.message || "Accesso non riuscito", "error");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setGLoading(true);
    try {
      await loginWithGoogle();
    } catch (e: any) {
      show(e.message || "Accesso Google non riuscito", "error");
    } finally {
      setGLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + spacing["2xl"], paddingBottom: insets.bottom + spacing.xl }]}
      bottomOffset={20}
    >
      <View style={s.logoWrap}>
        <BoltyLogo width={220} height={220} />
      </View>

      <H1 style={{ marginBottom: spacing.lg }}>Accedi</H1>

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="nome@email.it"
        keyboardType="email-address"
        autoCapitalize="none"
        testID="login-email"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="La tua password"
        secureTextEntry
        testID="login-password"
      />

      <Button title="Accedi" onPress={onLogin} loading={loading} testID="login-submit" />

      <View style={s.divider}>
        <View style={s.line} />
        <Muted>oppure</Muted>
        <View style={s.line} />
      </View>

      <Button
        title="Continua con Google"
        onPress={onGoogle}
        variant="secondary"
        loading={gLoading}
        icon={<GoogleLogo size={20} color={colors.onBrandSecondary} weight="bold" />}
        testID="login-google"
      />

      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={s.appleBtn}
          onPress={onApple}
          testID="login-apple"
        />
      ) : null}

      <Pressable onPress={() => router.push("/(auth)/register")} style={s.footer} testID="go-register">
        <Text style={s.footerText}>
          Non hai un account? <Text style={s.footerLink}>Registrati</Text>
        </Text>
      </Pressable>
      <Text style={s.legal} testID="login-legal">
        <Text style={s.footerLink} onPress={() => openLegal("privacy").catch(() => {})}>Privacy Policy</Text>
        {"  ·  "}
        <Text style={s.footerLink} onPress={() => openLegal("terms").catch(() => {})}>Termini</Text>
        {"  ·  "}
        <Text style={s.footerLink} onPress={() => openLegal("support").catch(() => {})}>Assistenza</Text>
      </Text>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { paddingHorizontal: spacing.xl },
  logoWrap: { alignItems: "center", marginBottom: spacing["2xl"] },
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
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.xl },
  line: { flex: 1, height: 1, backgroundColor: colors.divider },
  appleBtn: { height: 54, marginTop: spacing.md },
  footer: { alignItems: "center", marginTop: spacing.xl },
  legal: { textAlign: "center", marginTop: spacing.lg, fontFamily: fonts.regular, fontSize: fontSize.sm, color: colors.muted },
  footerText: { color: colors.muted, fontFamily: fonts.regular, fontSize: fontSize.base },
  footerLink: { color: colors.brandPrimary, fontFamily: fonts.semibold },
}));
