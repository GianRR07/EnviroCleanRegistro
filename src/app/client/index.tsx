import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Client() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Panel Cliente</Text>
          <Text style={styles.subtitle}>EnviroClean</Text>
        </View>

        <TouchableOpacity
          onPress={() => router.replace("/login")}
          style={styles.logoutBtn}
        >
          <Ionicons name="log-out-outline" size={20} color="#c62828" />
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        {/* BIENVENIDA */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeIcon}>
            <Ionicons name="leaf" size={32} color="#2E7D32" />
          </View>
          <Text style={styles.welcomeTitle}>¡Bienvenido!</Text>
          <Text style={styles.welcomeText}>
            Gracias por confiar en EnviroClean para el cuidado de tu entorno.
          </Text>
        </View>

        {/* ESTADO ACTUAL */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estado de tu servicio</Text>

          <View style={styles.statusRow}>
            <View style={styles.statusBadge}>
              <Ionicons name="checkmark-circle" size={18} color="#2E7D32" />
              <Text style={styles.statusText}>Servicio activo</Text>
            </View>
            <Text style={styles.statusDate}>Última visita: 28 Jun 2026</Text>
          </View>
        </View>

        {/* ACCIONES RÁPIDAS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Acciones rápidas</Text>

          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="add-circle-outline" size={22} color="#2E7D32" />
            <Text style={styles.actionText}>Solicitar nuevo servicio</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="document-text-outline" size={22} color="#1565C0" />
            <Text style={styles.actionText}>Ver mis registros</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={22}
              color="#FB8C00"
            />
            <Text style={styles.actionText}>Contactar soporte</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F1F8E9",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1B5E20",
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: 8, // ← Separación del borde (como pediste)
  },
  logoutText: {
    color: "#c62828",
    fontWeight: "600",
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
  },

  welcomeCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1B5E20",
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 15,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1B5E20",
    marginBottom: 16,
  },

  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    color: "#2E7D32",
    fontWeight: "600",
    fontSize: 14,
  },
  statusDate: {
    color: "#666",
    fontSize: 13,
  },

  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 10,
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
});
