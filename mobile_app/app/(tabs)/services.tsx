import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { ServiceTileGrid } from "@/components/ServiceTile";
import { services } from "@/lib/data";
import { colors, radii } from "@/lib/theme";

const cats = [
  { id: "all", label: "All" },
  { id: "banking", label: "Banking" },
  { id: "recharge", label: "Recharge" },
  { id: "bills", label: "Bills" },
  { id: "travel", label: "Travel" }
] as const;

export default function ServicesScreen() {
  const [cat, setCat] = useState<typeof cats[number]["id"]>("all");
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    return services.filter((s) => {
      if (cat !== "all" && s.category !== cat) return false;
      if (q && !s.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [cat, q]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={styles.head}>
        <Text style={styles.title}>All services</Text>
        <Text style={styles.sub}>16 live · everything in one app</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.ink[400]} />
        <TextInput
          placeholder="Search services..."
          placeholderTextColor={colors.ink[400]}
          value={q}
          onChangeText={setQ}
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cats}
      >
        {cats.map((c) => {
          const active = cat === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setCat(c.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && { color: "#fff" }]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <ServiceTileGrid items={items} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "900", color: colors.ink[900] },
  sub: { color: colors.ink[500], fontSize: 12, marginTop: 2 },
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
  chipText: { color: colors.ink[700], fontWeight: "700", fontSize: 12 }
});
