import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WorkerMenu() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Panel de Trabajador</Text>

      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push("/worker/form")}
      >
        <Ionicons name="create-outline" size={30} color="#2E7D32" />
        <Text style={styles.text}>Crear Formulario</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push("/worker/history")}
      >
        <Ionicons name="document-text-outline" size={30} color="#1565C0" />
        <Text style={styles.text}>Ver Registros</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    gap: 20,
    backgroundColor: "#F5F5F5",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    elevation: 3,
  },
  text: {
    fontSize: 18,
    fontWeight: "600",
  },
});
