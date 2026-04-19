import { Ionicons } from "@expo/vector-icons";
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View
} from "react-native";
import { colors, radii } from "@/lib/theme";

export function Field({
  label,
  icon,
  error,
  ...props
}: TextInputProps & { label: string; icon?: keyof typeof Ionicons.glyphMap; error?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, error ? { borderColor: colors.rose[500] } : null]}>
        {icon && <Ionicons name={icon} size={18} color={colors.ink[400]} style={{ marginRight: 8 }} />}
        <TextInput
          placeholderTextColor={colors.ink[400]}
          style={styles.input}
          {...props}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.ink[800],
    fontWeight: "600",
    fontSize: 13,
    marginBottom: 6
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.ink[200],
    paddingHorizontal: 14,
    height: 48
  },
  input: {
    flex: 1,
    color: colors.ink[900],
    fontSize: 15
  },
  error: {
    marginTop: 4,
    color: colors.rose[600],
    fontSize: 12
  }
});
