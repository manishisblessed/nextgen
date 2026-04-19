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
import { colors, generateRefId, radii } from "@/lib/theme";

type Mode = "flight" | "hotel" | "bus";

const modes: Record<Mode, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
  flight: { title: "Flight booking", subtitle: "Domestic flights · 7 airlines", icon: "airplane-outline" },
  hotel: { title: "Hotel booking", subtitle: "50,000+ properties across India", icon: "bed-outline" },
  bus: { title: "Bus booking", subtitle: "AC sleeper, seater, Volvo", icon: "bus-outline" }
};

const cities = ["Delhi (DEL)", "Mumbai (BOM)", "Bengaluru (BLR)", "Hyderabad (HYD)", "Chennai (MAA)", "Kolkata (CCU)", "Goa (GOI)", "Jaipur (JAI)", "Lucknow (LKO)"];
const airlines = [
  { name: "IndiGo", code: "6E", price: 4790, depart: "06:10", arrive: "08:25" },
  { name: "Vistara", code: "UK", price: 5340, depart: "07:35", arrive: "09:45" },
  { name: "Air India", code: "AI", price: 5120, depart: "11:50", arrive: "14:05" },
  { name: "SpiceJet", code: "SG", price: 4290, depart: "16:20", arrive: "18:35" }
];
const hotels = [
  { name: "Taj Mahal Palace", city: "Mumbai", price: 18900, rating: 4.9 },
  { name: "ITC Grand Bharat", city: "Gurgaon", price: 21500, rating: 4.8 },
  { name: "Leela Palace", city: "Bengaluru", price: 16400, rating: 4.8 },
  { name: "Oberoi Udaivilas", city: "Udaipur", price: 39900, rating: 5.0 }
];
const buses = [
  { operator: "VRL Travels", type: "AC Sleeper", price: 1199, depart: "21:30", arrive: "07:15" },
  { operator: "Orange Tours", type: "AC Seater", price: 799, depart: "22:00", arrive: "08:45" },
  { operator: "Neeta Travels", type: "Volvo Multi-Axle", price: 1399, depart: "20:15", arrive: "06:30" }
];

export default function TravelScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const type: Mode = (params.type as Mode) ?? "flight";
  const m = modes[type];

  const [from, setFrom] = useState(cities[0]);
  const [to, setTo] = useState(cities[1]);
  const [date, setDate] = useState("12 May 2026");
  const [pax, setPax] = useState("1");
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [refId, setRefId] = useState("");
  const [paying, setPaying] = useState(false);

  const items = useMemo(() => (type === "flight" ? airlines : type === "hotel" ? hotels : buses), [type]);
  const total = selected !== null ? (items[selected] as any).price * Number(pax || 1) : 0;

  async function pay() {
    setPaying(true);
    await new Promise((r) => setTimeout(r, 1200));
    setRefId(generateRefId(type.toUpperCase()));
    setPaying(false);
    setShowResult(true);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <Header title={m.title} subtitle={m.subtitle} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Card>
          {type === "hotel" ? (
            <Field label="City" icon="location-outline" value={to} onChangeText={setTo} />
          ) : (
            <>
              <Field label="From" icon="navigate-outline" value={from} onChangeText={setFrom} />
              <Field label="To" icon="flag-outline" value={to} onChangeText={setTo} />
            </>
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label={type === "hotel" ? "Check-in" : "Date"} icon="calendar-outline" value={date} onChangeText={setDate} />
            </View>
            <View style={{ width: 110 }}>
              <Field label={type === "hotel" ? "Guests" : "Travellers"} icon="people-outline" value={pax} onChangeText={setPax} keyboardType="number-pad" />
            </View>
          </View>
          <Button label="Search" icon="search-outline" onPress={() => { setSearched(true); setSelected(null); }} />
        </Card>

        {searched && (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.resultsTitle}>Available {type === "hotel" ? "stays" : type === "bus" ? "buses" : "flights"}</Text>
            {(items as any[]).map((it, idx) => {
              const active = selected === idx;
              return (
                <Pressable
                  key={idx}
                  onPress={() => setSelected(idx)}
                  style={[styles.resultRow, active && styles.resultActive]}
                >
                  <View style={[styles.resultIcon, { backgroundColor: active ? "rgba(255,255,255,0.18)" : colors.brand[50] }]}>
                    <Ionicons name={m.icon} size={20} color={active ? "#fff" : colors.brand[700]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    {type === "flight" && (
                      <>
                        <Text style={[styles.resultName, active && { color: "#fff" }]}>
                          {it.name} · {it.code}
                        </Text>
                        <Text style={[styles.resultMeta, active && { color: "rgba(255,255,255,0.85)" }]}>
                          {it.depart} → {it.arrive} · {from.split(" ")[0]} → {to.split(" ")[0]}
                        </Text>
                      </>
                    )}
                    {type === "hotel" && (
                      <>
                        <Text style={[styles.resultName, active && { color: "#fff" }]}>{it.name}</Text>
                        <Text style={[styles.resultMeta, active && { color: "rgba(255,255,255,0.85)" }]}>
                          {it.city} · ★ {it.rating}
                        </Text>
                      </>
                    )}
                    {type === "bus" && (
                      <>
                        <Text style={[styles.resultName, active && { color: "#fff" }]}>{it.operator}</Text>
                        <Text style={[styles.resultMeta, active && { color: "rgba(255,255,255,0.85)" }]}>
                          {it.type} · {it.depart} → {it.arrive}
                        </Text>
                      </>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.resultPrice, active && { color: "#fff" }]}>₹{it.price.toLocaleString("en-IN")}</Text>
                    <Text style={[styles.resultPriceSub, active && { color: "rgba(255,255,255,0.85)" }]}>
                      {type === "hotel" ? "/ night" : "per pax"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {selected !== null && (
          <Card style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.payLabel}>Total payable</Text>
              <Text style={styles.payAmount}>₹{total.toLocaleString("en-IN")}</Text>
            </View>
            <Text style={styles.payHint}>Includes taxes & convenience fee</Text>
            <Button label="Pay & confirm booking" iconRight="ticket-outline" onPress={pay} loading={paying} style={{ marginTop: 10 }} />
          </Card>
        )}
      </ScrollView>

      <ResultModal
        visible={showResult}
        onClose={() => setShowResult(false)}
        status="Success"
        title="Booking confirmed"
        subtitle={selected !== null ? (items[selected] as any).name || (items[selected] as any).operator : ""}
        amount={total}
        refId={refId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  resultsTitle: { fontWeight: "800", color: colors.ink[900], marginBottom: 10, fontSize: 14 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    marginBottom: 8
  },
  resultActive: { backgroundColor: colors.brand[600], borderColor: colors.brand[600] },
  resultIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  resultName: { fontWeight: "800", color: colors.ink[900], fontSize: 13 },
  resultMeta: { fontSize: 11, color: colors.ink[500], marginTop: 2 },
  resultPrice: { fontWeight: "900", color: colors.ink[900], fontSize: 14 },
  resultPriceSub: { fontSize: 10, color: colors.ink[500] },
  payLabel: { fontSize: 12, fontWeight: "700", color: colors.ink[600] },
  payAmount: { fontSize: 24, fontWeight: "900", color: colors.brand[700] },
  payHint: { fontSize: 11, color: colors.ink[500], marginTop: 4 }
});
