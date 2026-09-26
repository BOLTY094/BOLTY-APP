import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { Camera, Image as ImageIcon, FilePdf, Lightning, Flame, WifiHigh, CheckCircle } from "phosphor-react-native";

import { api } from "@/src/api";
import { useToast } from "@/src/toast";
import { ScreenHeader } from "@/src/components/screen-header";
import { H2, Muted } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius, fonts, fontSize, categoryColors } from "@/src/theme";

const CATS = [
  { key: "luce", label: "Luce", Icon: Lightning },
  { key: "gas", label: "Gas", Icon: Flame },
  { key: "telefonia", label: "Telefonia", Icon: WifiHigh },
];

type PickedFile = { uri: string; name: string; type: string };

export default function Upload() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { show } = useToast();
  const params = useLocalSearchParams<{ category?: string }>();

  const [category, setCategory] = useState<string>(params.category || "");
  const [uploading, setUploading] = useState(false);

  const ensureCamera = async () => {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain) {
      const req = await ImagePicker.requestCameraPermissionsAsync();
      if (req.granted) return true;
    }
    show("Permesso fotocamera negato. Aprilo dalle Impostazioni.", "error");
    if (Platform.OS !== "web") Linking.openSettings().catch(() => {});
    return false;
  };

  const ensureLibrary = async () => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (req.granted) return true;
    }
    show("Permesso galleria negato. Aprilo dalle Impostazioni.", "error");
    if (Platform.OS !== "web") Linking.openSettings().catch(() => {});
    return false;
  };

  const doUpload = async (file: PickedFile) => {
    if (!category) {
      show("Seleziona prima la categoria", "error");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(file.uri)).blob();
        form.append("file", blob, file.name);
      } else {
        form.append("file", { uri: file.uri, name: file.name, type: file.type } as any);
      }
      form.append("category", category);
      const bill = await api<{ bill_id: string }>("/upload", { method: "POST", isForm: true, body: form });
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      show("Bolletta caricata!", "success");
      router.replace(`/bill/${bill.bill_id}?new=1`);
    } catch (e: any) {
      show(e.message || "Caricamento non riuscito", "error");
      setUploading(false);
    }
  };

  const fromCamera = async () => {
    if (!(await ensureCamera())) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ["images"] });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    doUpload({ uri: a.uri, name: a.fileName || `bolletta_${Date.now()}.jpg`, type: a.mimeType || "image/jpeg" });
  };

  const fromGallery = async () => {
    if (!(await ensureLibrary())) return;
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"] });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    doUpload({ uri: a.uri, name: a.fileName || `bolletta_${Date.now()}.jpg`, type: a.mimeType || "image/jpeg" });
  };

  const fromPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    doUpload({ uri: a.uri, name: a.name || `bolletta_${Date.now()}.pdf`, type: a.mimeType || "application/pdf" });
  };

  if (uploading) return <Scanning />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader title="Carica bolletta" subtitle="Bastano pochi secondi" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
        <H2 style={{ marginBottom: spacing.md }}>1. Che bolletta è?</H2>
        <View style={s.catRow}>
          {CATS.map((c) => {
            const cc = categoryColors(colors, c.key);
            const active = category === c.key;
            return (
              <Pressable
                key={c.key}
                style={[s.catCard, { backgroundColor: active ? cc.accent : cc.soft, borderColor: active ? cc.accent : "transparent" }]}
                onPress={() => setCategory(c.key)}
                testID={`upload-cat-${c.key}`}
              >
                <c.Icon size={24} color={active ? cc.on : cc.accent} weight="fill" />
                <Text style={[s.catLabel, { color: active ? cc.on : colors.onSurface }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <H2 style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>2. Carica il documento</H2>
        <Muted style={{ marginBottom: spacing.lg }}>Scatta una foto o seleziona un PDF della tua bolletta.</Muted>

        <SourceButton icon={<Camera size={24} color={colors.brandPrimary} weight="fill" />} label="Scatta una foto" onPress={fromCamera} testID="upload-camera" />
        <SourceButton icon={<ImageIcon size={24} color={colors.brandPrimary} weight="fill" />} label="Scegli dalla galleria" onPress={fromGallery} testID="upload-gallery" />
        <SourceButton icon={<FilePdf size={24} color={colors.brandPrimary} weight="fill" />} label="Carica un PDF" onPress={fromPdf} testID="upload-pdf" />

        <View style={s.info}>
          <CheckCircle size={18} color={colors.success} weight="fill" />
          <Muted style={{ flex: 1 }}>I tuoi dati sono al sicuro e usati solo per l’analisi.</Muted>
        </View>
      </ScrollView>
    </View>
  );
}

function SourceButton({ icon, label, onPress, testID }: { icon: React.ReactNode; label: string; onPress: () => void; testID: string }) {
  const s = useStyles();
  return (
    <Pressable style={({ pressed }) => [s.source, pressed && { opacity: 0.9 }]} onPress={onPress} testID={testID}>
      <View style={s.sourceIcon}>{icon}</View>
      <Text style={s.sourceLabel}>{label}</Text>
    </Pressable>
  );
}

function Scanning() {
  const s = useStyles();
  const { colors } = useTheme();
  const y = useSharedValue(0);
  React.useEffect(() => {
    y.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [y]);
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 150 }] }));
  return (
    <View style={[s.scanWrap, { backgroundColor: colors.surface }]} testID="upload-scanning">
      <Animated.View entering={FadeIn} style={s.scanDoc}>
        <FilePdf size={72} color={colors.brandPrimary} weight="thin" />
        <Animated.View style={[s.scanLine, lineStyle]} />
      </Animated.View>
      <H2 style={{ marginTop: spacing.xl }}>Stiamo leggendo la tua bolletta…</H2>
      <Muted style={{ marginTop: spacing.xs, textAlign: "center", paddingHorizontal: spacing.xl }}>Rileviamo fornitore e intestatario dal documento. Può richiedere fino a 30 secondi.</Muted>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  catRow: { flexDirection: "row", gap: spacing.md },
  catCard: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: "center", gap: spacing.sm, borderWidth: 2 },
  catLabel: { fontFamily: fonts.medium, fontSize: fontSize.base },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  sourceLabel: { fontFamily: fonts.medium, fontSize: fontSize.lg, color: colors.onSurface },
  info: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  scanWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  scanDoc: { width: 160, height: 160, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  scanLine: { position: "absolute", top: 5, left: 12, right: 12, height: 2.5, borderRadius: 2, backgroundColor: colors.brandPrimary },
}));
