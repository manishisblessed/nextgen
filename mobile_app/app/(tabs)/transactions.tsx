import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "@/components/Card";
import { colors, formatINR, radii } from "@/lib/theme";
import { api } from "@/lib/api";

type Txn = {
  id: string;
  refId: string;
  service: string;
  amount: number;
  fee: number;
  commission: number;
  status: string;
  customer: string | null;
  operator: string | null;
  createdAt: string;
};

const SERVICE_ICON: Record<string, { icon: string; color: string }> = {
  RECHARGE: { icon: "phone-portrait-outline", color: "#10b981" },
  DMT: { icon: "send-outline", color: "#185df5" },
  AEPS: { icon: "finger-print-outline", color: "#7c3aed" },
  UPI: { icon: "qr-code-outline", color: "#10b981" },
  BBPS: { icon: "bulb-outline", color: "#f59e0b" },
  PAN: { icon: "card-outline", color: "#0ea5e9" },
  WALLET: { icon: "wallet-outline", color: "#f97606" },
};

function txnVisual(service: string) {
  return SERVICE_ICON[service] ?? { icon: "swap-horizontal-outline", color: "#6b7280" };
}

const filters = ["All", "SUCCESS", "PENDING", "FAILED"] as const;
const filterLabels: Record<string, string> = { All: "All", SUCCESS: "Success", PENDING: "Pending", FAILED: "Failed" };

export default function TransactionsScreen() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<typeof filters[number]>("All");
  const [txns, setTxns] = useState<Txn[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTxns = useCallback(async () => {
    try {
      const data = await api.getTransactions(1);
      setTxns(data.transactions);
      setTotal(data.total);
    } catch {
      // keep existing data on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTxns(); }, [fetchTxns]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTxns();
    setRefreshing(false);
  }, [fetchTxns]);

  const items = useMemo(() => {
    return txns.filter((t) => {
      if (filter !== "All" && t.status !== filter) return false;
      if (q) {
        const lq = q.toLowerCase();
        if (
          !t.service.toLowerCase().includes(lq) &&
          !t.refId.toLowerCase().includes(lq) &&
          !(t.customer ?? "").toLowerCase().includes(lq) &&
          !(t.operator ?? "").toLowerCase().includes(lq)
        ) return false;
      }
      return true;
    });
  }, [txns, filter, q]);

  const totalAmt = items.reduce((s, t) => s + t.amount, 0);
  const totalCom = items.reduce((s, t) => s + t.commission, 0);

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return isToday ? `Today · ${time}` : `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${time}`;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={styles.head}>
        <Text style={styles.title}>Transactions</Text>
        <Text style={styles.sub}>{total} total entries</Text>
      </View>

      <View style={[styles.row, { paddingHorizontal: 16, marginBottom: 12 }]}>
        <Card style={{ flex: 1, padding: 12 }}>
          <Text style={styles.statLabel}>Total amount</Text>
          <Text style={styles.statValue}>{formatINR(totalAmt)}</Text>
        </Card>
        <Card style={{ flex: 1, padding: 12 }}>
          <Text style={styles.statLabel}>Commission</Text>
          <Text style={[styles.statValue, { color: colors.emerald[600] }]}>+{formatINR(totalCom)}</Text>
        </Card>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.ink[400]} />
        <TextInput
          placeholder="Search by service, ref ID, customer"
          placeholderTextColor={colors.ink[400]}
          value={q}
          onChangeText={setQ}
          style={styles.searchInput}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
        {filters.map((f) => {
          const active = filter === f;
          return (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && { color: "#fff" }]}>{filterLabels[f]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.brand[600]} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {items.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Ionicons name="receipt-outline" size={36} color={colors.ink[300]} />
              <Text style={{ color: colors.ink[400], marginTop: 10, fontSize: 14 }}>No transactions found</Text>
            </View>
          )}
          {items.map((t) => (
            <TxnCard key={t.id} t={t} formatDate={formatDate} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TxnCard({ t, formatDate }: { t: Txn; formatDate: (iso: string) => string }) {
  const vis = txnVisual(t.service);
  const tone =
    t.status === "SUCCESS" ? colors.emerald : t.status === "PENDING" ? colors.amber : colors.rose;
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={[styles.icon, { backgroundColor: vis.color + "22" }]}>
        <Ionicons name={vis.icon as keyof typeof Ionicons.glyphMap} size={20} color={vis.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txnTitle}>{t.service}{t.operator ? ` · ${t.operator}` : ""}</Text>
        <Text style={styles.txnSub}>{t.refId}{t.customer ? ` · ${t.customer}` : ""}</Text>
        <Text style={styles.txnDate}>{formatDate(t.createdAt)}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.txnAmt}>{formatINR(t.amount)}</Text>
        <View style={[styles.pill, { backgroundColor: tone[100] }]}>
          <Text style={[styles.pillText, { color: tone[700] }]}>{t.status}</Text>
        </View>
        {t.commission > 0 && (
          <Text style={styles.commission}>+{formatINR(t.commission)}</Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "900", color: colors.ink[900] },
  sub: { color: colors.ink[500], fontSize: 12, marginTop: 2 },
  row: { flexDirection: "row", gap: 10 },
  statLabel: { fontSize: 10, color: colors.ink[500], fontWeight: "700", letterSpacing: 0.6 },
  statValue: { fontSize: 18, fontWeight: "900", color: colors.ink[900], marginTop: 4 },
  searchBar: {
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    height: 44,
    gap: 8
  },
  searchInput: { flex: 1, color: colors.ink[900], fontSize: 14 },
  cats: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8
  },
  chipActive: { backgroundColor: colors.brand[600], borderColor: colors.brand[600] },
  chipText: { color: colors.ink[700], fontWeight: "700", fontSize: 12 },

  icon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txnTitle: { fontWeight: "700", color: colors.ink[900] },
  txnSub: { fontSize: 11, color: colors.ink[500], marginTop: 1 },
  txnDate: { fontSize: 11, color: colors.ink[400], marginTop: 2 },
  txnAmt: { fontWeight: "800", color: colors.ink[900] },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 4 },
  pillText: { fontSize: 10, fontWeight: "800" },
  commission: { fontSize: 11, color: colors.emerald[700], marginTop: 4, fontWeight: "700" }
});
