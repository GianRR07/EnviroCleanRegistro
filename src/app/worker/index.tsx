import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WorkerMenu() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Panel de Trabajador</Text>
      <Text style={styles.subtitle}>Selecciona una opción</Text>

      <View style={styles.wrapper}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/worker/form")}
        >
          <Ionicons name="create-outline" size={32} color="#2E7D32" />
          <Text style={styles.cardText}>Crear Formulario</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/worker/history")}
        >
          <Ionicons name="document-text-outline" size={32} color="#1565C0" />
          <Text style={styles.cardText}>Ver Registros</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F8E9",
    padding: 20,
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1B5E20",
    textAlign: "center",
  },

  subtitle: {
    textAlign: "center",
    color: "#666",
    marginBottom: 20,
  },

  wrapper: {
    marginTop: 20,
    gap: 14,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },

  cardText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#222",
  },
});
