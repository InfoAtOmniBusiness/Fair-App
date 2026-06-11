// Fair — Scan screen (Expo Router: app/index.tsx)
// Uses expo-camera's CameraView. expo-barcode-scanner was REMOVED from the
// Expo SDK (51+) — any older generated code using it will not build.
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const lockRef = useRef(false); // debounce: CameraView fires repeatedly

  const go = (raw: string) => {
    const upc = raw.replace(/\D/g, "");
    if (!upc || lockRef.current) return;
    lockRef.current = true;
    router.push(`/product/${upc}`);
    setTimeout(() => (lockRef.current = false), 1500);
  };

  if (!permission) return <View style={s.center} />;
  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.h}>Fair needs your camera</Text>
        <Text style={s.p}>Only to scan product barcodes — nothing is recorded.</Text>
        <Pressable style={s.btn} onPress={requestPermission}>
          <Text style={s.btnText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <CameraView
        style={s.flex}
        barcodeScannerSettings={{
          barcodeTypes: ["upc_a", "upc_e", "ean13", "ean8"],
        }}
        onBarcodeScanned={({ data }) => go(data)}
      >
        <View style={s.overlay}>
          <Text style={s.brand}>Fair</Text>
          <View style={s.frame} />
          <Text style={s.hint}>Point at a product barcode</Text>
        </View>
        <View style={s.topRight}>
          <Pressable style={s.chip} onPress={() => router.push("/watchlist")}>
            <Text style={s.chipT}>♡ Watchlist</Text>
          </Pressable>
          <Pressable style={s.chip} onPress={() => router.push("/account")}>
            <Text style={s.chipT}>Account</Text>
          </Pressable>
        </View>
      </CameraView>

      <View style={s.manualBar}>
        <TextInput
          style={s.input}
          value={manual}
          onChangeText={setManual}
          placeholder="Or type the barcode (e.g. 049000050103)"
          placeholderTextColor="#8FA39B"
          keyboardType="number-pad"
          returnKeyType="go"
          onSubmitEditing={() => go(manual)}
        />
        <Pressable style={s.btnSm} onPress={() => go(manual)}>
          <Text style={s.btnText}>Go</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#06231B" },
  center: { flex: 1, alignItems: "center", justifyContent: "center",
            backgroundColor: "#FAF6EF", padding: 28, gap: 10 },
  h: { fontSize: 22, fontWeight: "700", color: "#1C2B26" },
  p: { fontSize: 15, color: "#6E7B74", textAlign: "center" },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  brand: { position: "absolute", top: 64, color: "#fff", fontSize: 30,
           fontWeight: "800", letterSpacing: -0.5 },
  frame: { width: 270, height: 160, borderRadius: 18, borderWidth: 3,
           borderColor: "#34D399" },
  hint: { color: "#D9EFE4", marginTop: 16, fontSize: 14 },
  topRight: { position: "absolute", top: 58, right: 14, flexDirection: "row",
              gap: 8 },
  chip: { backgroundColor: "rgba(6,35,27,0.72)", borderRadius: 999,
          paddingVertical: 8, paddingHorizontal: 13, borderWidth: 1,
          borderColor: "rgba(52,211,153,0.45)" },
  chipT: { color: "#D9EFE4", fontWeight: "700", fontSize: 13 },
  manualBar: { flexDirection: "row", gap: 8, padding: 14,
               backgroundColor: "#06231B" },
  input: { flex: 1, backgroundColor: "#0E3A2D", color: "#fff",
           borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 16 },
  btn: { backgroundColor: "#06614A", paddingHorizontal: 24, paddingVertical: 13,
         borderRadius: 12, marginTop: 8 },
  btnSm: { backgroundColor: "#06614A", paddingHorizontal: 18,
           justifyContent: "center", borderRadius: 12 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
