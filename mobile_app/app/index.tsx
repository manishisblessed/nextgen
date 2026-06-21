import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { getSession, clearSession } from "@/lib/auth";
import { api } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getSession();
      await new Promise((r) => setTimeout(r, 700));
      if (cancelled) return;

      if (!s?.token) {
        router.replace("/login");
        return;
      }

      try {
        await api.getWallet();
        router.replace("/(tabs)");
      } catch {
        await clearSession();
        router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <LinearGradient
      colors={[colors.brand[700], colors.brand[600], colors.accent[500]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.wrap}
    >
      <View style={styles.center}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoP}>P</Text>
        </View>
        <Text style={styles.brand}>NextGenPay</Text>
        <Text style={styles.tagline}>Banking that builds Bharat</Text>
      </View>
      <Text style={styles.foot}>Powered by JMP NextGenPay Pvt. Ltd.</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  center: { alignItems: "center" },
  logoBadge: {
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20
  },
  logoP: { fontSize: 48, fontWeight: "900", color: "#fff" },
  brand: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  tagline: { marginTop: 8, color: "rgba(255,255,255,0.9)", fontSize: 14 },
  foot: { position: "absolute", bottom: 32, color: "rgba(255,255,255,0.7)", fontSize: 11 }
});
