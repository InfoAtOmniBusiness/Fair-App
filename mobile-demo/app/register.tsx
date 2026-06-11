// Fair — create account. Captures the optional location consent flag the
// backend stores (GDPR-aware from the first record).
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet,
  Switch, Text, TextInput, View,
} from "react-native";
import { useAuth } from "../lib/auth";
import { C } from "../lib/theme";

export default function RegisterScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consentLocation, setConsentLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim().includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true); setError("");
    try {
      await signUp(email, password, consentLocation);
      if (next) router.replace(next as never);
      else router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={s.wrap}>
        <Text style={s.h}>Create your account</Text>
        <Text style={s.p}>
          Save products to your watchlist and help everyone by submitting
          shelf prices.
        </Text>
        <TextInput
          style={s.input} value={email} onChangeText={setEmail}
          placeholder="Email" placeholderTextColor={C.muted}
          autoCapitalize="none" keyboardType="email-address"
          autoComplete="email" textContentType="emailAddress"
        />
        <TextInput
          style={s.input} value={password} onChangeText={setPassword}
          placeholder="Password (8+ characters)" placeholderTextColor={C.muted}
          secureTextEntry autoComplete="new-password" textContentType="newPassword"
          onSubmitEditing={submit} returnKeyType="go"
        />
        <View style={s.consentRow}>
          <View style={s.consentText}>
            <Text style={s.consentH}>Use approximate location</Text>
            <Text style={s.consentP}>
              Shows prices at stores near you. Optional.
            </Text>
          </View>
          <Switch
            value={consentLocation} onValueChange={setConsentLocation}
            trackColor={{ true: C.green }}
          />
        </View>
        {error ? <Text style={s.err}>{error}</Text> : null}
        <Pressable style={[s.btn, busy && s.btnOff]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnT}>Create account</Text>}
        </Pressable>
        <Pressable
          style={s.link}
          onPress={() => router.replace({ pathname: "/login", params: next ? { next } : {} })}
        >
          <Text style={s.linkT}>Already have an account? Sign in</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.paper },
  wrap: { flex: 1, justifyContent: "center", padding: 28, gap: 12 },
  h: { fontSize: 26, fontWeight: "800", color: C.ink },
  p: { fontSize: 15, color: C.muted, marginBottom: 10 },
  input: {
    backgroundColor: "#fff", borderWidth: 1.5, borderColor: C.line,
    borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 16,
    color: C.ink,
  },
  consentRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderWidth: 1, borderColor: C.line,
    borderRadius: 12, padding: 13,
  },
  consentText: { flex: 1 },
  consentH: { fontWeight: "700", color: C.ink, fontSize: 14 },
  consentP: { color: C.muted, fontSize: 12, marginTop: 2 },
  err: { color: C.red, fontSize: 14 },
  btn: {
    backgroundColor: C.greenDeep, borderRadius: 12, height: 50,
    alignItems: "center", justifyContent: "center", marginTop: 4,
  },
  btnOff: { opacity: 0.6 },
  btnT: { color: "#fff", fontWeight: "700", fontSize: 16 },
  link: { alignItems: "center", marginTop: 10 },
  linkT: { color: C.greenDeep, fontWeight: "700", fontSize: 14 },
});
