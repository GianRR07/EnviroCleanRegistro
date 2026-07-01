import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

export default function Client() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", color: "#111" }}>
        CLIENT PANEL
      </Text>

      <TouchableOpacity
        onPress={() => router.replace("/login")}
        style={{
          marginTop: 20,
          backgroundColor: "red",
          padding: 10,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: "#fff" }}>Salir</Text>
      </TouchableOpacity>
    </View>
  );
}