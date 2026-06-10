import { Stack } from "expo-router";
export default function Layout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: "#FAF6EF" },
      headerTintColor: "#06614A",
      headerTitleStyle: { fontWeight: "800" },
    }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="product/[upc]" options={{ title: "Price check" }} />
    </Stack>
  );
}
