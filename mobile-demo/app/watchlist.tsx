// Fair — watchlist. Auth-gated; redirects to login when no session.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View,
} from "react-native";
import { AuthRequiredError, getWatchlist, removeWatch, WatchItem } from "../lib/api";
import { useAuth } from "../lib/auth";
import { C } from "../lib/theme";

export default function WatchlistScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await getWatchlist());
      setError("");
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        router.replace({ pathname: "/login", params: { next: "/watchlist" } });
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load watchlist.");
    }
  }, [router]);

  useFocusEffect(useCallback(() => {
    if (authLoading) return;
    if (!user) {
      router.replace({ pathname: "/login", params: { next: "/watchlist" } });
      return;
    }
    load();
  }, [authLoading, user, load, router]));

  const remove = async (item: WatchItem) => {
    setItems((cur) => cur?.filter((w) => w.id !== item.id) ?? cur);
    try {
      await removeWatch(item.id);
    } catch {
      load(); // re-sync on failure rather than guessing state
    }
  };

  if (authLoading || items === null) {
    return (
      <View style={s.center}>
        {error
          ? <Text style={s.err}>{error}</Text>
          : <ActivityIndicator size="large" color={C.greenDeep} />}
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={s.center}>
        <Text style={s.h}>Nothing watched yet</Text>
        <Text style={s.p}>
          Scan a product and tap “Watch” to track its price here.
        </Text>
        <Pressable style={s.btn} onPress={() => router.navigate("/")}>
          <Text style={s.btnT}>Scan something</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={s.flex}
      contentContainerStyle={{ padding: 16 }}
      data={items}
      keyExtractor={(w) => String(w.id)}
      renderItem={({ item }) => (
        <Pressable
          style={s.row}
          onPress={() => router.push(`/product/${item.upc}`)}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={2}>{item.name}</Text>
            <Text style={s.meta}>
              UPC {item.upc}
              {item.target_price != null
                ? ` · target $${item.target_price.toFixed(2)}` : ""}
            </Text>
          </View>
          <Pressable style={s.removeBtn} onPress={() => remove(item)}>
            <Text style={s.removeT}>Remove</Text>
          </Pressable>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.paper },
  center: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: C.paper, padding: 28, gap: 10,
  },
  h: { fontSize: 22, fontWeight: "700", color: C.ink },
  p: { fontSize: 15, color: C.muted, textAlign: "center" },
  err: { color: C.red, fontSize: 15, textAlign: "center" },
  btn: {
    backgroundColor: C.greenDeep, paddingHorizontal: 24, paddingVertical: 13,
    borderRadius: 12, marginTop: 8,
  },
  btnT: { color: "#fff", fontWeight: "700", fontSize: 15 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderWidth: 1, borderColor: C.line,
    borderRadius: 14, padding: 14, marginBottom: 8,
  },
  name: { fontWeight: "700", fontSize: 15, color: C.ink },
  meta: { fontSize: 12, color: C.muted, marginTop: 3 },
  removeBtn: {
    backgroundColor: "#FDECEA", borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  removeT: { color: C.red, fontWeight: "700", fontSize: 13 },
});
