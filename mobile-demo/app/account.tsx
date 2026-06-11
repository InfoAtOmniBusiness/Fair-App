// Fair — account. Sign out, GDPR data export (share sheet), and in-app
// account deletion (Apple App Review 5.1.1(v) requirement).
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View,
} from "react-native";
import { apiExportData } from "../lib/api";
import { useAuth } from "../lib/auth";
import { C } from "../lib/theme";

export default function AccountScreen() {
  const router = useRouter();
  const { user, loading, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState<"" | "export" | "delete">("");

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.greenDeep} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={s.center}>
        <Text style={s.h}>You’re not signed in</Text>
        <Text style={s.p}>Sign in to manage your watchlist and data.</Text>
        <Pressable
          style={s.btn}
          onPress={() => router.replace({ pathname: "/login", params: { next: "/account" } })}
        >
          <Text style={s.btnT}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  const exportData = async () => {
    setBusy("export");
    try {
      const data = await apiExportData();
      await Share.share({
        title: "Fair — your data export",
        message: JSON.stringify(data, null, 2),
      });
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy("");
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete account?",
      "Your account is anonymized immediately. Prices you contributed stay in " +
      "the community dataset without your identity. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            setBusy("delete");
            try {
              await deleteAccount();
              router.dismissAll();
            } catch (e) {
              Alert.alert("Delete failed",
                e instanceof Error ? e.message : "Try again.");
            } finally {
              setBusy("");
            }
          },
        },
      ],
    );
  };

  return (
    <View style={s.wrap}>
      <View style={s.card}>
        <Text style={s.label}>Signed in as</Text>
        <Text style={s.email}>{user.email}</Text>
      </View>

      <Pressable style={s.rowBtn} onPress={() => router.push("/watchlist")}>
        <Text style={s.rowBtnT}>My watchlist</Text>
      </Pressable>

      <Pressable style={s.rowBtn} onPress={exportData} disabled={busy !== ""}>
        {busy === "export"
          ? <ActivityIndicator color={C.greenDeep} />
          : <Text style={s.rowBtnT}>Export my data (GDPR)</Text>}
      </Pressable>

      <Pressable style={s.rowBtn} onPress={signOut} disabled={busy !== ""}>
        <Text style={s.rowBtnT}>Sign out</Text>
      </Pressable>

      <Pressable style={s.dangerBtn} onPress={confirmDelete} disabled={busy !== ""}>
        {busy === "delete"
          ? <ActivityIndicator color={C.red} />
          : <Text style={s.dangerT}>Delete account</Text>}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.paper, padding: 16, gap: 10 },
  center: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: C.paper, padding: 28, gap: 10,
  },
  h: { fontSize: 22, fontWeight: "700", color: C.ink },
  p: { fontSize: 15, color: C.muted, textAlign: "center" },
  card: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: C.line,
    borderRadius: 14, padding: 16, marginBottom: 6,
  },
  label: {
    fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700",
  },
  email: { fontSize: 16, fontWeight: "700", color: C.ink, marginTop: 4 },
  btn: {
    backgroundColor: C.greenDeep, paddingHorizontal: 24, paddingVertical: 13,
    borderRadius: 12, marginTop: 8,
  },
  btnT: { color: "#fff", fontWeight: "700", fontSize: 15 },
  rowBtn: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: C.line,
    borderRadius: 14, padding: 16, alignItems: "center",
  },
  rowBtnT: { color: C.greenDeep, fontWeight: "700", fontSize: 15 },
  dangerBtn: {
    backgroundColor: "#FDECEA", borderRadius: 14, padding: 16,
    alignItems: "center", marginTop: 14,
  },
  dangerT: { color: C.red, fontWeight: "700", fontSize: 15 },
});
