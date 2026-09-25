import React, { useEffect } from "react";
import { View, Text, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
} from "react-native-reanimated";

import { useAuth } from "@/src/auth-context";
import { BoltyBolt } from "@/src/components/logo";
import { makeStyles, useTheme, spacing, fonts, fontSize } from "@/src/theme";

const TOTAL_MS = 2400;

// Animated bolt mascot shown right after login, then hands off to the home.
export default function Welcome() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { user, consumeWelcome } = useAuth();

  const scale = useSharedValue(0.2);
  const rotate = useSharedValue(-25);
  const glow = useSharedValue(0.6);
  const glowOpacity = useSharedValue(0);
  const textY = useSharedValue(16);
  const textOpacity = useSharedValue(0);
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    // Pop in with a bounce, then a happy wiggle, then settle.
    scale.value = withSequence(
      withSpring(1.12, { damping: 9, stiffness: 140 }),
      withSpring(1, { damping: 12, stiffness: 160 }),
    );
    rotate.value = withSequence(
      withSpring(8, { damping: 8, stiffness: 120 }),
      withTiming(-6, { duration: 180 }),
      withTiming(5, { duration: 160 }),
      withTiming(0, { duration: 200 }),
    );
    // Soft yellow halo pulsing behind the bolt.
    glowOpacity.value = withTiming(1, { duration: 400 });
    glow.value = withRepeat(withTiming(1.15, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    // Greeting slides up.
    textOpacity.value = withDelay(600, withTiming(1, { duration: 400 }));
    textY.value = withDelay(600, withSpring(0, { damping: 14 }));
    // Fade the whole screen just before navigating.
    screenOpacity.value = withDelay(TOTAL_MS - 300, withTiming(0, { duration: 300 }));

    const t = setTimeout(() => {
      consumeWelcome();
      router.replace(user?.role === "admin" ? "/(admin)" : "/(tabs)");
    }, TOTAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boltStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glow.value }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textY.value }],
  }));
  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));

  const firstName = user?.name?.split(" ")[0] || "";

  return (
    <Animated.View style={[s.screen, screenStyle]} testID="welcome-screen">
      <View style={s.center}>
        <Animated.View style={[s.glow, { backgroundColor: colors.accentSoft }, glowStyle]} />
        <Animated.View style={boltStyle}>
          <BoltyBolt size={190} />
        </Animated.View>
      </View>
      <Animated.View style={[s.textWrap, textStyle]}>
        <Text style={s.hello} testID="welcome-greeting">
          Ciao{firstName ? `, ${firstName}` : ""}!
        </Text>
        <Text style={s.sub}>Confronta. Risparmia. Semplice.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  center: { width: 260, height: 260, alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute", width: 220, height: 220, borderRadius: 110 },
  textWrap: { alignItems: "center", marginTop: spacing.lg },
  hello: { fontFamily: fonts.bold, fontSize: fontSize["3xl"], color: colors.brand, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.medium, fontSize: fontSize.lg, color: colors.muted, marginTop: spacing.sm },
}));
