import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Switch,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "react-native-paper";
import { useRouter } from "expo-router";

import { getRecords } from "@/utils/storage";

export default function Admin() {
  const router = useRouter();

  const [users, setUsers] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]); // 🔥 REAL
  const [modal, setModal] = useState(false);

  const [form, setForm] = useState({
    name: "",
    role: "worker",
  });

  const [permissions, setPermissions] = useState({
    verTrabajador: true,
    verGPS: false,
    verFicha: true,
    verDatos: false,
  });

  // 🔥 CARGAR REGISTROS REALES
  useEffect(() => {
    const load = async () => {
      const data = await getRecords();
      setRecords(data.reverse()); // últimos primero
    };

    load();
  }, []);

  const createUser = () => {
    if (!form.name.trim()) return;

    setUsers((prev) => [
      ...prev,
      { id: Date.now(), name: form.name, role: form.role },
    ]);

    setForm({ name: "", role: "worker" });
    setModal(false);
  };

  const deleteUser = (id: number) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const togglePermission = (key: keyof typeof permissions) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.title}>Panel de Administración</Text>

          <TouchableOpacity onPress={() => router.replace("/login")}>
            <Text style={styles.logout}>Salir</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Sistema conectado a registros reales del trabajador
        </Text>

        {/* STATS */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text>Usuarios</Text>
            <Text style={styles.statNumber}>{users.length}</Text>
          </View>

          <View style={styles.statBox}>
            <Text>Registros</Text>
            <Text style={styles.statNumber}>{records.length}</Text>
          </View>

          <View style={styles.statBox}>
            <Text>Completados</Text>
            <Text style={styles.statNumber}>
              {records.filter((r) => r.status === "completo").length}
            </Text>
          </View>

          <View style={styles.statBox}>
            <Text>Pendientes</Text>
            <Text style={styles.statNumber}>
              {records.filter((r) => r.status !== "completo").length}
            </Text>
          </View>
        </View>

        {/* USERS */}
        <TouchableOpacity style={styles.btn} onPress={() => setModal(true)}>
          <Text style={styles.btnText}>+ Crear nuevo usuario</Text>
        </TouchableOpacity>

        {/* PERMISSIONS */}
        {Object.keys(permissions).map((key) => {
          const k = key as keyof typeof permissions;

          return (
            <View key={key} style={styles.permissionBox}>
              <Text>{key}</Text>
              <Switch
                value={permissions[k]}
                onValueChange={() => togglePermission(k)}
              />
            </View>
          );
        })}

        {/* 🔥 REGISTROS REALES */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Registros reales</Text>
        </View>

        {records.length === 0 && (
          <Text style={{ color: "#888" }}>No hay registros aún</Text>
        )}

        {records.map((r) => (
          <Card key={r.id} style={styles.card}>
            <Text style={{ fontWeight: "bold" }}>
              Cliente: {r.form?.cliente}
            </Text>

            <Text>Status: {r.status}</Text>
            <Text>Fecha: {r.createdAt}</Text>
          </Card>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

/* STYLES */
const styles = StyleSheet.create({
  container: { padding: 15 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  title: { fontSize: 22, fontWeight: "bold" },

  subtitle: { color: "#666", marginBottom: 15 },

  logout: {
    backgroundColor: "#d32f2f",
    padding: 8,
    borderRadius: 8,
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  statBox: {
    width: "48%",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },

  statNumber: { fontSize: 20, fontWeight: "bold" },

  sectionHeader: { marginTop: 20, marginBottom: 10 },

  sectionTitle: { fontSize: 18, fontWeight: "bold" },

  sectionDesc: { color: "#777", fontSize: 12 },

  btn: {
    backgroundColor: "#2E7D32",
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },

  btnText: { color: "#fff", textAlign: "center" },

  card: {
    padding: 12,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
  },

  userName: { fontWeight: "bold" },

  userRole: { color: "#666" },

  delete: { color: "red", marginTop: 5 },

  permissionBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10,
    backgroundColor: "#fff",
    marginBottom: 8,
    borderRadius: 10,
  },

  modal: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
});