import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "@/components/Header";
import { Card } from "@/components/Card";
import { Field } from "@/components/Input";
import { Button } from "@/components/Button";
import { ResultModal } from "@/components/Result";
import { colors, generateRefId, radii } from "@/lib/theme";
import { getSession, saveSession, type Session } from "@/lib/auth";

const presets = [500, 1000, 2000, 5000];

export default function WalletScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [amount, setAmount] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [refId, setRefId] = useState("");

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  async function topup() {
    if (!session) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1100));
    const updated: Session = { ...session, walletBalance: session.walletBalance + Number(amount || 0) };
    await saveSession(updated);
    setSession(updated);
    setRefId(generateRefId("WALLET"));
    setLoading(false);
    setShowResult(true);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Header title="Wallet & funds" subtitle="Top up · request funds from distributor" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Card style={styles.balanceCard}>
          <Text style={styles.balLabel}>Available wallet balance</Text>
          <Text style={styles.balAmount}>
            ₹{(session?.walletBalance ?? 0).toLocaleString("en-IN")}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.meta}>
              <Ionicons name="trending-up" size={14} color="#fff" />
              <Text style={styles.metaText}>Today ₹{(12450).toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.meta}>
              <Ionicons name="calendar-outline" size={14} color="#fff" />
              <Text style={styles.metaText}>This month ₹3.4 L</Text>
            </View>
          </View>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Text style={styles.section}>Top up wallet</Text>
          <View style={styles.presets}>
            {presets.map((p) => (
              <View key={p} style={{ flex: 1 }}>
                <View
                  onTouchStart={() => setAmount(String(p))}
                  style={[styles.preset, amount === String(p) && styles.presetActive]}
                >
                  <Text style={[styles.presetText, amount === String(p) && { color: "#fff" }]}>
                    ₹{p}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <Field label="Custom amount" icon="cash-outline" value={amount} onChangeText={setAmount} keyboardType="number-pad" />
          <Button label="Add to wallet via UPI" icon="add-circle-outline" onPress={topup} loading={loading} />
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Text style={styles.section}>Request funds from distributor</Text>
          <Text style={styles.note}>
            Submit a fund request for instant approval. Average TAT: under 4 minutes.
          </Text>
          <Button label="Raise fund request" iconRight="paper-plane-outline" variant="ghost" />
        </Card>
      </ScrollView>

      <ResultModal
        visible={showResult}
        onClose={() => setShowResult(false)}
        status="Success"
        title="Wallet topped up"
        subtitle="Funds available immediately"
        amount={parseInt(amount, 10)}
        refId={refId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: colors.brand[700], padding: 20 },
  balLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  balAmount: { color: "#fff", fontSize: 32, fontWeight: "900", marginTop: 6 },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 14, flexWrap: "wrap" },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6
  },
  metaText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  section: { fontWeight: "800", color: colors.ink[900], marginBottom: 10, fontSize: 14 },
  presets: { flexDirection: "row", gap: 8, marginBottom: 12 },
  preset: {
    height: 42,
    borderRadius: radii.md,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  presetActive: { backgroundColor: colors.brand[600], borderColor: colors.brand[600] },
  presetText: { fontWeight: "800", color: colors.ink[700] },
  note: { fontSize: 12, color: colors.ink[600], marginBottom: 10 }
});
