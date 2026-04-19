import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Header } from "@/components/Header";
import { Card } from "@/components/Card";
import { Field } from "@/components/Input";
import { Button } from "@/components/Button";
import { ResultModal } from "@/components/Result";
import { colors, generateRefId, radii } from "@/lib/theme";

const modes = ["IMPS", "NEFT", "RTGS"] as const;

export default function DMTScreen() {
  const [mode, setMode] = useState<typeof modes[number]>("IMPS");
  const [name, setName] = useState("");
  const [acct, setAcct] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("5000");
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [refId, setRefId] = useState("");

  async function submit() {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1400));
    setRefId(generateRefId(mode));
    setLoading(false);
    setShowResult(true);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Header title="Money Transfer" subtitle="Send money to any bank account · 24×7" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Card>
          <Text style={styles.label}>Transfer mode</Text>
          <View style={styles.modes}>
            {modes.map((m) => {
              const active = mode === m;
              return (
                <View key={m} style={{ flex: 1 }}>
                  <View
                    onTouchStart={() => setMode(m)}
                    style={[styles.mode, active && styles.modeActive]}
                  >
                    <Text style={[styles.modeText, active && { color: "#fff" }]}>{m}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Field label="Beneficiary name" icon="person-outline" value={name} onChangeText={setName} placeholder="As per bank record" />
          <Field label="Account number" icon="card-outline" value={acct} onChangeText={setAcct} keyboardType="number-pad" />
          <Field label="IFSC code" icon="business-outline" value={ifsc} onChangeText={setIfsc} autoCapitalize="characters" maxLength={11} />
          <Field label="Beneficiary mobile (optional)" icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="Amount" icon="cash-outline" value={amount} onChangeText={setAmount} keyboardType="number-pad" />

          <View style={styles.fees}>
            <Text style={styles.feesTitle}>Convenience fee · ₹6 (paid by sender)</Text>
            <Text style={styles.feesSub}>Settled instantly via {mode}</Text>
          </View>

          <Button label="Send money" iconRight="paper-plane-outline" onPress={submit} loading={loading} style={{ marginTop: 12 }} />
        </Card>
      </ScrollView>

      <ResultModal
        visible={showResult}
        onClose={() => setShowResult(false)}
        status="Success"
        title="Transfer initiated"
        subtitle={`To ${name || "Beneficiary"} · A/C ${acct.slice(-4) || "XXXX"} · ${ifsc || "IFSC"}`}
        amount={parseInt(amount, 10)}
        refId={refId}
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
    justifyContent: "center"
  },
  modeActive: { backgroundColor: colors.brand[600], borderColor: colors.brand[600] },
  modeText: { fontWeight: "800", color: colors.ink[700], fontSize: 13 },
  fees: {
    backgroundColor: colors.ink[50],
    borderRadius: radii.md,
    padding: 12,
    marginTop: 4
  },
  feesTitle: { fontWeight: "700", color: colors.ink[900], fontSize: 12 },
  feesSub: { fontSize: 11, color: colors.ink[500], marginTop: 2 }
});
