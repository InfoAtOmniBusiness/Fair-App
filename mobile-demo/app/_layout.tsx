import { Stack } from "expo-router";
import { AuthProvider } from "../lib/auth";

export default function Layout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{
        headerStyle: { backgroundColor: "#FAF6EF" },
        headerTintColor: "#06614A",
        headerTitleStyle: { fontWeight: "800" },
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="product/[upc]" options={{ title: "Price check" }} />
        <Stack.Screen name="login" options={{ title: "Sign in", presentation: "modal" }} />
        <Stack.Screen name="register" options={{ title: "Create account", presentation: "modal" }} />
        <Stack.Screen name="watchlist" options={{ title: "Watchlist" }} />
        <Stack.Screen name="account" options={{ title: "Account" }} />
      </Stack>
    </AuthProvider>
  );
}
