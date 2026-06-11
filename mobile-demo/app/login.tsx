// Fair — sign in. Reached from any save action (watch / submit price) or the
// account button. `next` param returns the user where they were headed.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { useAuth } from "../lib/auth";
import { C } from "../lib/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true); setError("");
    try {
      await signIn(email, password);
      if (next) router.replace(next as never);
      else router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
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
        <Text style={s.h}>Welcome back</Text>
        <Text style={s.p}>Sign in to save products and submit prices.</Text>
        <TextInput
          style={s.input} value={email} onChangeText={setEmail}
          placeholder="Email" placeholderTextColor={C.muted}
          autoCapitalize="none" keyboardType="email-address"
          autoComplete="email" textContentType="emailAddress"
        />
        <TextInput
          style={s.input} value={password} onChangeText={setPassword}
          placeholder="Password" placeholderTextColor={C.muted}
          secureTextEntry autoComplete="password" textContentType="password"
          onSubmitEditing={submit} returnKeyType="go"
        />
        {error ? <Text style={s.err}>{error}</Text> : null}
        <Pressable style={[s.btn, busy && s.btnOff]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnT}>Sign in</Text>}
        </Pressable>
        <Pressable
          style={s.link}
          onPress={() => router.replace({ pathname: "/register", params: next ? { next } : {} })}
        >
          <Text style={s.linkT}>New to Fair? Create an account</Text>
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
