import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewStyle
} from "react-native";
import { colors, radii, shadows } from "@/lib/theme";

type Variant = "primary" | "outline" | "ghost" | "accent" | "dark";
type Size = "sm" | "md" | "lg";

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  icon,
  iconRight,
  style
}: {
  label: string;
  onPress?: PressableProps["onPress"];
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}) {
  const heights: Record<Size, number> = { sm: 36, md: 48, lg: 54 };
  const fontSize: Record<Size, number> = { sm: 13, md: 14, lg: 16 };
  const paddingX: Record<Size, number> = { sm: 14, md: 20, lg: 26 };

  const Inner = (
    <View style={[styles.row, { paddingHorizontal: paddingX[size] }]}>
      {loading ? (
        <ActivityIndicator color={variant === "outline" ? colors.brand[600] : "#fff"} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={fontSize[size] + 4} color={textColor(variant)} />}
          <Text style={[styles.label, { fontSize: fontSize[size], color: textColor(variant) }]}>{label}</Text>
          {iconRight && <Ionicons name={iconRight} size={fontSize[size] + 4} color={textColor(variant)} />}
        </>
      )}
    </View>
  );

  const baseStyle: ViewStyle = {
    height: heights[size],
    borderRadius: radii.pill,
    overflow: "hidden",
    opacity: disabled ? 0.5 : 1
  };

  if (variant === "primary") {
    return (
      <Pressable onPress={onPress} disabled={disabled || loading} style={[baseStyle, shadows.glow, style]}>
        <LinearGradient colors={[colors.brand[600], colors.brand[500]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
          {Inner}
        </LinearGradient>
      </Pressable>
    );
  }
  if (variant === "accent") {
    return (
      <Pressable onPress={onPress} disabled={disabled || loading} style={[baseStyle, shadows.soft, style]}>
        <LinearGradient colors={[colors.accent[500], colors.accent[400]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
          {Inner}
        </LinearGradient>
      </Pressable>
    );
  }
  if (variant === "dark") {
    return (
      <Pressable onPress={onPress} disabled={disabled || loading} style={[baseStyle, { backgroundColor: colors.ink[900] }, style]}>
        {Inner}
      </Pressable>
    );
  }
  if (variant === "outline") {
    return (
      <Pressable onPress={onPress} disabled={disabled || loading} style={[baseStyle, { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.ink[200] }, style]}>
        {Inner}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} style={[baseStyle, style]}>
      {Inner}
    </Pressable>
  );
}

function textColor(v: Variant) {
  if (v === "outline" || v === "ghost") return colors.ink[900];
  if (v === "accent") return colors.ink[900];
  return "#fff";
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  label: { fontWeight: "700" }
});
