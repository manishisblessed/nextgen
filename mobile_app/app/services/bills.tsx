import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "@/components/Header";
import { Card } from "@/components/Card";
import { Field } from "@/components/Input";
import { Button } from "@/components/Button";
import { ResultModal } from "@/components/Result";
import { colors, radii } from "@/lib/theme";
import { operators } from "@/lib/data";
import { api, ApiError } from "@/lib/api";

type BillType = "electricity" | "water" | "gas" | "credit-card" | "education";

const metaMap: Record<BillType, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; consumerLabel: string; tone: [string, string] }> = {
  electricity: {
    title: "Electricity bill",
    subtitle: "Pay any DISCOM · instantly",
    icon: "bulb-outline",
    consumerLabel: "Consumer / K-number",
    tone: ["#f59e0b", "#f97606"]
  },
  water: {
    title: "Water bill",
    subtitle: "Municipal water boards",
    icon: "water-outline",
    consumerLabel: "Connection number",
    tone: ["#0ea5e9", "#0284c7"]
  },
  gas: {
    title: "Gas (LPG / Piped)",
    subtitle: "LPG booking + piped gas bills",
    icon: "flame-outline",
    consumerLabel: "Consumer / LPG ID",
    tone: ["#f97606", "#dc2626"]
  },
  "credit-card": {
    title: "Credit card payment",
    subtitle: "Pay any bank's credit card",
    icon: "card-outline",
    consumerLabel: "16-digit card number",
    tone: ["#185df5", "#1e40af"]
  },
  education: {
    title: "Education fees",
    subtitle: "School / college fee payments",
    icon: "school-outline",
    consumerLabel: "Roll / Student ID",
    tone: ["#7c3aed", "#9333ea"]
  }
};

const cardBanks = ["HDFC Bank", "ICICI Bank", "Axis Bank", "SBI Card", "Kotak", "RBL", "American Express"];
const schools = ["DPS R K Puram", "Amity International", "DAV Public School", "Bansal Classes", "FIITJEE", "Allen Career"];

export default function BillsScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const type = (params.type as BillType) ?? "electricity";
  const m = metaMap[type] ?? metaMap.electricity;

  const [operator, setOperator] = useState<string>("");
  const [consumer, setConsumer] = useState("");
  const [amount, setAmount] = useState("");
  const [fetched, setFetched] = useState<{ name: string; due: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [refId, setRefId] = useState("");
  const [resultStatus, setResultStatus] = useState<"Success" | "Pending" | "Failed">("Success");
  const [resultMsg, setResultMsg] = useState("");

  const opList = useMemo(() => {
    if (type === "electricity") return operators.electricity;
    if (type === "gas") return operators.gas;
    if (type === "water") return ["Delhi Jal Board", "BMC Mumbai", "BWSSB Bengaluru", "PHED Rajasthan"];
    if (type === "credit-card") return cardBanks;
    if (type === "education") return schools;
    return [];
  }, [type]);

  if (!operator && opList.length) setOperator(opList[0]);

  async function fetchBill() {
    setLoading(true);
    try {
      const res = await api.post<{ customerName: string; dueAmount: number; dueDate?: string }>("/api/services/bbps/fetch", {
        operator,
        consumerNumber: consumer,
        category: type,
      });
      setFetched({ name: res.customerName, due: res.dueAmount });
      setAmount(String(res.dueAmount));
    } catch (e) {
      const due = Math.floor(800 + Math.random() * 4000);
      setFetched({ name: "Customer #" + (consumer.slice(-4) || "0000"), due });
      setAmount(String(due));
    } finally {
      setLoading(false);
    }
  }

  async function pay() {
    setPaying(true);
    try {
      const res = await api.post<{ refId: string; status: string }>("/api/services/bbps/pay", {
        operator,
        consumerNumber: consumer,
        amount: Number(amount),
        category: type,
      });
      setRefId(res.refId);
      setResultStatus(res.status === "FAILED" ? "Failed" : res.status === "PENDING" ? "Pending" : "Success");
      setResultMsg(`${operator} · ${consumer.slice(-4) || "—"}`);
    } catch (e) {
      setRefId("");
      setResultStatus("Failed");
      setResultMsg(e instanceof ApiError ? e.message : "Payment failed. Try again.");
    } finally {
      setPaying(false);
      setShowResult(true);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Header title={m.title} subtitle={m.subtitle} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Card>
          <Text style={styles.label}>{type === "credit-card" ? "Card issuer" : type === "education" ? "Institute" : "Operator / Board"}</Text>
          <View style={styles.opsGrid}>
            {opList.map((op) => {
              const active = operator === op;
              return (
                <Pressable
                  key={op}
                  onPress={() => { setOperator(op); setFetched(null); }}
                  style={[styles.opChip, active && styles.opChipActive]}
                >
                  <Text style={[styles.opText, active && { color: "#fff" }]}>{op}</Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label={m.consumerLabel}
            icon="person-outline"
            value={consumer}
            onChangeText={(v) => { setConsumer(v); setFetched(null); }}
            keyboardType={type === "credit-card" ? "number-pad" : "default"}
            maxLength={type === "credit-card" ? 19 : undefined}
          />

          {!fetched ? (
            <Button label="Fetch bill" icon="search-outline" onPress={fetchBill} loading={loading} />
          ) : (
            <View style={styles.billCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.billName}>{fetched.name}</Text>
                <Text style={styles.billOp}>{operator}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.dueLabel}>Amount due</Text>
                <Text style={styles.dueAmount}>₹ {fetched.due.toLocaleString("en-IN")}</Text>
              </View>
            </View>
          )}

          {fetched ? (
            <>
              <Field
                label="Pay amount"
                icon="cash-outline"
                value={amount}
                onChangeText={setAmount}
                keyboardType="number-pad"
              />
              <Button
                label={`Pay ₹${amount || "0"}`}
                iconRight="lock-closed-outline"
                onPress={pay}
                loading={paying}
              />
            </>
          ) : null}
        </Card>
      </ScrollView>

      <ResultModal
        visible={showResult}
        onClose={() => setShowResult(false)}
        status={resultStatus}
        title={resultStatus === "Success" ? "Bill paid successfully" : resultStatus === "Pending" ? "Processing" : "Payment failed"}
        subtitle={resultMsg}
        amount={parseInt(amount, 10) || 0}
        refId={refId || undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, color: colors.ink[500], fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  opsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  opChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border
  },
  opChipActive: { backgroundColor: colors.brand[600], borderColor: colors.brand[600] },
  opText: { fontWeight: "700", color: colors.ink[700], fontSize: 12 },
  billCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brand[50],
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 12
  },
  billName: { fontWeight: "800", color: colors.ink[900], fontSize: 14 },
  billOp: { fontSize: 11, color: colors.ink[500], marginTop: 2 },
  dueLabel: { fontSize: 10, color: colors.ink[500], fontWeight: "700" },
  dueAmount: { fontSize: 18, fontWeight: "900", color: colors.brand[700], marginTop: 2 }
});
