import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, radii, shadows } from "@/lib/theme";

export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, shadows.soft, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16
  }
});
