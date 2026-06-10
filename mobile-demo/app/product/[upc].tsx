// Fair — Price Comparison screen (Expo Router: app/product/[upc].tsx)
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, Linking, Pressable, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { Comparison, getComparison } from "../../lib/api";

const VERDICT = {
  green:   { label: "Fair price",      color: "#0B8A5C" },
  yellow:  { label: "Borderline",      color: "#C58A12" },
  red:     { label: "Overpaying",      color: "#C0392B" },
  unknown: { label: "Not enough data", color: "#6E7B74" },
} as const;

export default function ProductScreen() {
  const { upc } = useLocalSearchParams<{ upc: string }>();
  const router = useRouter();
  const [data, setData] = useState<Comparison | null>(null);
  const [seen, setSeen] = useState("");
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");

  const load = useCallback(async (priceSeen?: number) => {
    setState("loading");
    try {
      const d = await getComparison(String(upc), priceSeen);
      if (!d) return setState("notfound");
      setData(d);
      setState("ok");
    } catch {
      setState("error");
    }
  }, [upc]);

  useEffect(() => { load(); }, [load]);

  if (state === "loading")
    return <View style={s.center}><ActivityIndicator size="large" color="#06614A" /></View>;
  if (state === "notfound")
    return (
      <View style={s.center}>
        <Text style={s.h}>Product not found</Text>
        <Text style={s.p}>We tried both UPC formats. Try scanning again or another item.</Text>
        <Pressable style={s.btn} onPress={() => router.back()}><Text style={s.btnT}>Scan again</Text></Pressable>
      </View>
    );
  if (state === "error" || !data)
    return (
      <View style={s.center}>
        <Text style={s.h}>Can't reach Fair</Text>
        <Text style={s.p}>Check EXPO_PUBLIC_API_URL points at your computer's LAN IP.</Text>
        <Pressable style={s.btn} onPress={() => load()}><Text style={s.btnT}>Retry</Text></Pressable>
      </View>
    );

  const v = VERDICT[data.fairness.verdict] ?? VERDICT.unknown;
  const best = Math.min(...data.offers.map(o => o.price));

  return (
    <FlatList
      style={s.flex}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      data={data.offers}
      keyExtractor={o => o.store}
      ListHeaderComponent={
        <View>
          <View style={s.head}>
            {data.product.image_url ? (
              <Image source={{ uri: data.product.image_url }} style={s.img} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{data.product.name}</Text>
              <Text style={s.brand}>{data.product.brand} · UPC {data.product.upc}</Text>
            </View>
          </View>

          <View style={[s.pill, { backgroundColor: v.color }]}>
            <Text style={s.pillT}>{v.label}</Text>
          </View>
          <Text style={s.why}>{data.fairness.explanation}</Text>

          <View style={s.seenRow}>
            <TextInput
              style={s.seenInput}
              value={seen}
              onChangeText={setSeen}
              placeholder="Price you see on the shelf, e.g. 6.19"
              placeholderTextColor="#8FA39B"
              keyboardType="decimal-pad"
            />
            <Pressable style={s.btnSm} onPress={() => load(parseFloat(seen) || undefined)}>
              <Text style={s.btnT}>Check</Text>
            </Pressable>
          </View>
          <Text style={s.section}>Where to buy</Text>
        </View>
      }
      renderItem={({ item: o }) => (
        <View style={[s.offer, o.price === best && s.best]}>
          <View style={{ flex: 1 }}>
            <Text style={s.store}>{o.store}</Text>
            <Text style={s.kind}>{o.kind}{o.is_affiliate ? " · affiliate" : ""}</Text>
          </View>
          <Text style={[s.price, o.price === best && { color: "#06614A" }]}>
            ${o.price.toFixed(2)}
          </Text>
          {o.buy_url ? (
            <Pressable style={s.buy} onPress={() => Linking.openURL(o.buy_url!)}>
              <Text style={s.buyT}>Buy</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#FAF6EF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center",
            backgroundColor: "#FAF6EF", padding: 28, gap: 10 },
  h: { fontSize: 22, fontWeight: "700", color: "#1C2B26" },
  p: { fontSize: 15, color: "#6E7B74", textAlign: "center" },
  head: { flexDirection: "row", gap: 14, alignItems: "center", marginBottom: 16 },
  img: { width: 64, height: 64, borderRadius: 12, backgroundColor: "#fff" },
  name: { fontSize: 18, fontWeight: "800", color: "#1C2B26" },
  brand: { fontSize: 13, color: "#6E7B74", marginTop: 3 },
  pill: { alignSelf: "center", borderRadius: 999, paddingVertical: 9,
          paddingHorizontal: 22 },
  pillT: { color: "#fff", fontWeight: "800", letterSpacing: 0.5,
           textTransform: "uppercase", fontSize: 13 },
  why: { fontSize: 14.5, color: "#1C2B26", textAlign: "center", marginTop: 12,
         lineHeight: 21 },
  seenRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  seenInput: { flex: 1, backgroundColor: "#fff", borderWidth: 1.5,
               borderColor: "#E4DCCB", borderRadius: 12, paddingHorizontal: 13,
               height: 46, fontSize: 15, color: "#1C2B26" },
  section: { marginTop: 22, marginBottom: 8, fontSize: 12, letterSpacing: 1,
             textTransform: "uppercase", color: "#6E7B74", fontWeight: "700" },
  offer: { flexDirection: "row", alignItems: "center", gap: 10,
           backgroundColor: "#fff", borderWidth: 1, borderColor: "#EDE6D6",
           borderRadius: 14, padding: 13, marginBottom: 8 },
  best: { borderColor: "#0B8A5C" },
  store: { fontWeight: "700", fontSize: 15, color: "#1C2B26" },
  kind: { fontSize: 12, color: "#6E7B74", marginTop: 2 },
  price: { fontWeight: "800", fontSize: 17, color: "#1C2B26" },
  buy: { backgroundColor: "#EAF6EF", borderRadius: 10, paddingVertical: 9,
         paddingHorizontal: 14 },
  buyT: { color: "#06614A", fontWeight: "800" },
  btn: { backgroundColor: "#06614A", paddingHorizontal: 24, paddingVertical: 13,
         borderRadius: 12, marginTop: 8 },
  btnSm: { backgroundColor: "#06614A", paddingHorizontal: 18,
           justifyContent: "center", borderRadius: 12 },
  btnT: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
