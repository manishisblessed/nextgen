import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Field } from "@/components/Input";
import { Header } from "@/components/Header";
import { ResultModal } from "@/components/Result";
import { colors, radii } from "@/lib/theme";
import { api, ApiError } from "@/lib/api";

const modes = [
  { id: "withdrawal", label: "Withdrawal", icon: "cash-outline" },
  { id: "balance", label: "Balance", icon: "wallet-outline" },
  { id: "mini", label: "Mini Statement", icon: "list-outline" }
] as const;

const banks = ["State Bank of India", "Bank of Baroda", "Punjab National Bank", "Canara Bank", "Bank of India", "Union Bank", "Indian Bank"];

export default function AePSScreen() {
  const [mode, setMode] = useState<typeof modes[number]["id"]>("withdrawal");
  const [aadhaar, setAadhaar] = useState("");
  const [amount, setAmount] = useState("2000");
  const [bank, setBank] = useState(banks[0]);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refId, setRefId] = useState("");
  const [resultStatus, setResultStatus] = useState<"Success" | "Pending" | "Failed">("Success");
  const [resultMsg, setResultMsg] = useState("");

  async function submit() {
    setLoading(true);
    try {
      const res = await api.post<{ refId: string; status: string }>("/api/services/aeps/withdraw", {
        aadhaarNumber: aadhaar.replace(/\s/g, ""),
        bankCode: bank,
        amount: mode === "withdrawal" ? Number(amount) : 0,
        type: mode,
      });
      setRefId(res.refId);
      setResultStatus(res.status === "FAILED" ? "Failed" : res.status === "PENDING" ? "Pending" : "Success");
      setResultMsg(mode === "withdrawal" ? `Cash dispensed for ${aadhaar.slice(-4) || "XXXX"}` : "Request processed");
    } catch (e) {
      setRefId("");
      setResultStatus("Failed");
      setResultMsg(e instanceof ApiError ? e.message : "Transaction failed. Try again.");
    } finally {
      setLoading(false);
      setShowResult(true);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Header title="Aadhaar Pay (AePS)" subtitle="Cash withdrawal · Balance · Mini statement" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Card>
          <Text style={styles.label}>Service mode</Text>
          <View style={styles.modes}>
            {modes.map((m) => {
              const active = mode === m.id;
              return (
                <View key={m.id} style={{ flex: 1 }}>
                  <View
                    onTouchStart={() => setMode(m.id)}
                    style={[styles.mode, active && styles.modeActive]}
                  >
                    <Ionicons
                      name={m.icon as keyof typeof Ionicons.glyphMap}
                      size={18}
                      color={active ? "#fff" : colors.ink[700]}
                    />
                    <Text style={[styles.modeText, active && { color: "#fff" }]}>{m.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Field
            label="Aadhaar number"
            icon="finger-print-outline"
            keyboardType="number-pad"
            maxLength={14}
            placeholder="XXXX XXXX XXXX"
            value={aadhaar}
            onChangeText={setAadhaar}
          />

          <Field
            label="Bank"
            icon="business-outline"
            value={bank}
            onChangeText={setBank}
          />

          {mode === "withdrawal" && (
            <Field
              label="Amount"
              icon="cash-outline"
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
            />
          )}

          <View style={styles.bio}>
            <Ionicons name="finger-print" size={32} color={colors.brand[600]} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.bioTitle}>Capture customer biometric</Text>
              <Text style={styles.bioSub}>
                Connect your Mantra MFS100 or Morpho MSO 1300 reader and place customer&apos;s thumb.
              </Text>
            </View>
          </View>

          <Button
            label={mode === "withdrawal" ? "Authorize withdrawal" : mode === "balance" ? "Fetch balance" : "Get mini statement"}
            iconRight="arrow-forward"
            onPress={submit}
            loading={loading}
            style={{ marginTop: 12 }}
          />
        </Card>
      </ScrollView>

      <ResultModal
        visible={showResult}
        onClose={() => setShowResult(false)}
        status={resultStatus}
        title={resultStatus === "Success" ? "Withdrawal authorized" : resultStatus === "Pending" ? "Processing" : "Transaction failed"}
        subtitle={resultMsg}
        amount={mode === "withdrawal" ? parseInt(amount, 10) || 0 : undefined}
        refId={refId || undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, color: colors.ink[500], fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  modes: { flexDirection: "row", gap: 8 },
  mode: {
    height: 44,
    borderRadius: radii.md,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6
  },
  modeActive: { backgroundColor: colors.brand[600], borderColor: colors.brand[600] },
  modeText: { fontWeight: "700", color: colors.ink[700], fontSize: 12 },
  bio: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brand[50],
    borderRadius: radii.md,
    padding: 12,
    marginTop: 4
  },
  bioTitle: { fontWeight: "800", color: colors.brand[900] },
  bioSub: { fontSize: 11, color: colors.brand[800], marginTop: 2 }
});
