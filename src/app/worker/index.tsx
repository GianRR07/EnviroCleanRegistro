import { workerMenuStyles as styles } from "@/styles";
import { clearCurrentUserSession } from "@/utils/session";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WorkerMenu() {
  const router = useRouter();

  const logout = async () => {
    await clearCurrentUserSession();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <View style={{ width: 44 }} />
        <Text style={styles.title}>Panel de Trabajador</Text>
        <TouchableOpacity
          onPress={logout}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 3,
          }}
        >
          <Ionicons name="log-out-outline" size={24} color="#C62828" />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Selecciona una opción</Text>

      <View style={styles.wrapper}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/worker/form")}
        >
          <Ionicons name="create-outline" size={32} color="#2E7D32" />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardText}>Crear formulario</Text>
            <Text style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              Registra un servicio nuevo o continúa un registro pendiente.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/worker/history")}
        >
          <Ionicons name="document-text-outline" size={32} color="#1565C0" />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardText}>Ver registros</Text>
            <Text style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              Consulta el historial de formularios enviados.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#999" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
