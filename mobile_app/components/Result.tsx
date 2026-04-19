import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { colors, formatINR, radii } from "@/lib/theme";

export function ResultModal({
  visible,
  onClose,
  status,
  title,
  subtitle,
  amount,
  refId
}: {
  visible: boolean;
  onClose: () => void;
  status: "Success" | "Pending" | "Failed";
  title: string;
  subtitle?: string;
  amount?: number;
  refId?: string;
}) {
  const tone =
    status === "Success" ? colors.emerald : status === "Pending" ? colors.amber : colors.rose;
  const icon = status === "Success" ? "checkmark-circle" : status === "Pending" ? "time" : "close-circle";

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={[styles.iconWrap, { backgroundColor: tone[100] }]}>
            <Ionicons name={icon} size={42} color={tone[600]} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
          {amount !== undefined ? (
            <Text style={styles.amount}>{formatINR(amount)}</Text>
          ) : null}
          {refId ? (
            <Pressable style={styles.refRow}>
              <Text style={styles.refLabel}>Ref ID</Text>
              <Text style={styles.refValue}>{refId}</Text>
            </Pressable>
          ) : null}
          <Button label="Done" onPress={onClose} style={{ marginTop: 16, width: "100%" }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(14,22,38,0.55)",
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: "#fff",
    padding: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    alignItems: "center"
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  title: { fontSize: 18, fontWeight: "900", color: colors.ink[900], marginTop: 14 },
  sub: { fontSize: 13, color: colors.ink[600], marginTop: 4, textAlign: "center" },
  amount: { fontSize: 28, fontWeight: "900", color: colors.ink[900], marginTop: 10 },
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.ink[50],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    marginTop: 12,
    gap: 8
  },
  refLabel: { color: colors.ink[500], fontSize: 11, fontWeight: "700" },
  refValue: { color: colors.ink[900], fontWeight: "800", fontFamily: "monospace" }
});
