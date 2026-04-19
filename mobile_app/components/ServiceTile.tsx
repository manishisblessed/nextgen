import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, radii, shadows } from "@/lib/theme";
import type { Service } from "@/lib/data";

export function ServiceTile({ s }: { s: Service }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(s.href as never)}
      style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <LinearGradient colors={s.color} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
        <Ionicons name={s.icon as keyof typeof Ionicons.glyphMap} size={22} color="#fff" />
      </LinearGradient>
      <Text style={styles.title} numberOfLines={2}>
        {s.title}
      </Text>
      <Text style={styles.short} numberOfLines={1}>
        {s.short}
      </Text>
    </Pressable>
  );
}

export function ServiceTileGrid({ items }: { items: Service[] }) {
  return (
    <View style={styles.grid}>
      {items.map((s) => (
        <View key={s.slug} style={{ width: "48%" }}>
          <ServiceTile s={s} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink[900]
  },
  short: {
    marginTop: 2,
    fontSize: 11,
    color: colors.ink[500]
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    rowGap: 12
  }
});
