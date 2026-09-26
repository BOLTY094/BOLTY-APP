import React, { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LockKey } from "phosphor-react-native";

import { api, setToken } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { Body, Muted, Button, TextField } from "@/src/components/ui";
import { useTheme, spacing } from "@/src/theme";

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

// Change password for email/password accounts. Other devices get signed out; this one keeps a fresh token.
export default function ChangePassword() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const social = user?.auth_provider && user.auth_provider !== "email";

  const submit = async () => {
    if (!STRONG.test(next)) return show("La nuova password deve avere almeno 8 caratteri con maiuscola, minuscola e numero", "error");
    if (next !== confirm) return show("Le due password non coincidono", "error");
    if (next === current) return show("La nuova password deve essere diversa da quella attuale", "error");
    setLoading(true);
    try {
      const r = await api("/auth/password", { method: "PUT", body: { current_password: current, new_password: next } });
      if (r?.token) await setToken(r.token);
      show("Password aggiornata. Gli altri dispositivi sono stati disconnessi.", "success");
      router.back();
    } catch (e: any) {
      show(e.message || "Impossibile cambiare la password", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Cambia password" testID="change-password-header" />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing["2xl"], maxWidth: 560, width: "100%", alignSelf: "center" }} bottomOffset={24} showsVerticalScrollIndicator={false}>
        {social ? (
          <Body>Il tuo account accede con {user?.auth_provider === "apple" ? "Apple" : "Google"} e non ha una password Bolty da cambiare.</Body>
        ) : (
          <>
            <Muted style={{ marginBottom: spacing.lg }}>Almeno 8 caratteri, con una maiuscola, una minuscola e un numero. Dopo il cambio, gli altri dispositivi collegati dovranno rifare l’accesso.</Muted>
            <TextField label="Password attuale" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" testID="pw-current" />
            <TextField label="Nuova password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" testID="pw-new" />
            <TextField label="Conferma nuova password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" testID="pw-confirm" />
            <Button title="Aggiorna password" onPress={submit} loading={loading} disabled={!current || !next || !confirm} icon={<LockKey size={20} color={colors.onBrandPrimary} weight="bold" />} testID="pw-submit" />
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
