import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { makeStyles, spacing, radius, fonts, fontSize, useTheme } from "@/src/theme";

/**
 * Lightweight signature pad. Captures SVG paths via pan gestures and returns the
 * combined path string. Works on native and web (react-native-gesture-handler).
 */
export function SignaturePad({ onChange, testID }: { onChange: (paths: string) => void; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [paths, setPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>("");

  const start = (x: number, y: number) => setCurrent(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
  const move = (x: number, y: number) => setCurrent((c) => `${c} L ${x.toFixed(1)} ${y.toFixed(1)}`);
  const end = () => {
    setCurrent((c) => {
      if (c) {
        setPaths((p) => {
          const next = [...p, c];
          onChange(next.join(" "));
          return next;
        });
      }
      return "";
    });
  };

  const pan = Gesture.Pan()
    .onBegin((e) => runOnJS(start)(e.x, e.y))
    .onUpdate((e) => runOnJS(move)(e.x, e.y))
    .onEnd(() => runOnJS(end)())
    .minDistance(0);

  const clear = () => {
    setPaths([]);
    setCurrent("");
    onChange("");
  };

  const all = current ? [...paths, current] : paths;

  return (
    <View testID={testID}>
      <GestureDetector gesture={pan}>
        <View style={s.pad} collapsable={false}>
          <Svg width="100%" height="100%">
            {all.map((d, i) => (
              <Path key={i} d={d} stroke={colors.onSurface} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
          {all.length === 0 ? <Text style={s.hint}>Firma qui con il dito</Text> : null}
        </View>
      </GestureDetector>
      <Pressable onPress={clear} style={s.clearBtn} testID="signature-clear">
        <Text style={s.clearText}>Cancella firma</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  pad: {
    height: 180,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderStyle: "dashed",
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { position: "absolute", color: colors.muted, fontFamily: fonts.regular, fontSize: fontSize.base },
  clearBtn: { alignSelf: "flex-end", paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, marginTop: spacing.xs },
  clearText: { color: colors.brandPrimary, fontFamily: fonts.medium, fontSize: fontSize.base },
}));
