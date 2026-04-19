import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "@/components/Card";
import { transactions, type Txn } from "@/lib/data";
import { colors, formatINR, radii } from "@/lib/theme";

const filters = ["All", "Success", "Pending", "Failed"] as const;

export default function TransactionsScreen() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<typeof filters[number]>("All");

  const items = useMemo(() => {
    return transactions.filter((t) => {
      if (filter !== "All" && t.status !== filter) return false;
      if (q && !(t.service.toLowerCase().includes(q.toLowerCase()) || t.id.includes(q.toUpperCase()))) return false;
      return true;
    });
  }, [filter, q]);

  const totalAmt = items.reduce((s, t) => s + t.amount, 0);
  const totalCom = items.reduce((s, t) => s + t.commission, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={styles.head}>
        <Text style={styles.title}>Transactions</Text>
        <Text style={styles.sub}>{items.length} entries · today</Text>
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
          placeholder="Search by service or txn ID"
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
              <Text style={[styles.chipText, active && { color: "#fff" }]}>{f}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 10 }}>
        {items.map((t) => (
          <TxnCard key={t.id} t={t} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function TxnCard({ t }: { t: Txn }) {
  const tone =
    t.status === "Success" ? colors.emerald : t.status === "Pending" ? colors.amber : colors.rose;
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={[styles.icon, { backgroundColor: t.color + "22" }]}>
        <Ionicons name={t.icon as keyof typeof Ionicons.glyphMap} size={20} color={t.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txnTitle}>{t.service}</Text>
        <Text style={styles.txnSub}>{t.id} · {t.customer}</Text>
        <Text style={styles.txnDate}>{t.date}</Text>
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
