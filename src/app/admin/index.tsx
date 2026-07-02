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
  Image,
  Dimensions,
  Linking,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "react-native-paper";
import { useRouter } from "expo-router";
import { getRecords } from "@/utils/storage";

const screenWidth = Dimensions.get("window").width;

export default function Admin() {
  const router = useRouter();

  const [users, setUsers] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const [form, setForm] = useState({
    name: "",
    role: "cliente", // 👈 cliente o supervisor
  });

  const [permissions, setPermissions] = useState({
    verTrabajador: true,
    verGPS: true,
    verFicha: true,
    verDatos: true,
  });

  useEffect(() => {
    const load = async () => {
      const data = await getRecords();
      setRecords((data || []).reverse());
    };
    load();
  }, []);

  const createUser = () => {
    if (!form.name.trim()) return;

    setUsers((prev) => [
      ...prev,
      { id: Date.now(), name: form.name, role: form.role },
    ]);

    setForm({ name: "", role: "cliente" });
    setModal(false);
  };

  const togglePermission = (key: keyof typeof permissions) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const completados = records.filter((r) => r.status === "completo").length;
  const pendientes = records.filter(
  (r) => r.status !== "completo"
).length;
  const openGoogleMaps = (latitude: number, longitude: number) => {
  const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  Linking.openURL(url);
};
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.title}>Panel Admin</Text>

          <TouchableOpacity onPress={() => router.replace("/login")}>
            <Text style={styles.logout}>Salir</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Control de registros en tiempo real
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
            <Text style={styles.statNumber}>{completados}</Text>
          </View>

          <View style={styles.statBox}>
            <Text>Pendientes</Text>
            <Text style={styles.statNumber}>{pendientes}</Text>
          </View>
        </View>

        {/* BTN */}
        <TouchableOpacity style={styles.btn} onPress={() => setModal(true)}>
          <Text style={styles.btnText}>+ Crear usuario</Text>
        </TouchableOpacity>

        {/* PERMISOS */}
        <Text style={styles.sectionTitle}>Permisos</Text>

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

        {/* REGISTROS */}
        <Text style={styles.sectionTitle}>Registros reales</Text>

        <View style={styles.grid}>
          {records.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.cardWrapper}
              onPress={() => setSelected(r)}
            >
              <Card style={styles.card}>
                <Text style={styles.cardTitle}>
                  Cliente: {r.form?.cliente}
                </Text>

                <Text>Status: {r.status}</Text>
                <Text style={styles.meta}>{r.createdAt}</Text>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* MODAL CREAR USUARIO */}
      <Modal visible={modal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>

            <Text style={styles.modalTitle}>Nuevo usuario</Text>

            <TextInput
              placeholder="Nombre"
              placeholderTextColor="#999"
              value={form.name}
              onChangeText={(t) => setForm({ ...form, name: t })}
              style={styles.input}
            />

            {/* 👇 SELECTOR SIMPLE */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  form.role === "cliente" && styles.roleActive,
                ]}
                onPress={() => setForm({ ...form, role: "cliente" })}
              >
                <Text>Cliente</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  form.role === "supervisor" && styles.roleActive,
                ]}
                onPress={() => setForm({ ...form, role: "supervisor" })}
              >
                <Text>Supervisor</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.btn} onPress={createUser}>
              <Text style={styles.btnText}>Guardar</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModal(false)}>
              <Text style={styles.cancel}>Cancelar</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* MODAL DETALLE + MAPA */}
      <Modal visible={!!selected} animationType="slide">
        <ScrollView style={styles.detail}>

          <Text style={styles.detailTitle}>Detalle del Registro</Text>

          {selected && (
  <>
    <View style={styles.section}>
      <Text style={styles.sectionTitleBig}>Detalle del Registro</Text>

      <View style={styles.detailBox}>
        <Text style={styles.label}>Cliente</Text>
        <Text style={styles.value}>{selected.form?.cliente}</Text>
      </View>

      <View style={styles.detailBox}>
        <Text style={styles.label}>Servicio</Text>
        <Text style={styles.value}>{selected.form?.tipoServicio}</Text>
      </View>

      <View style={styles.detailBox}>
        <Text style={styles.label}>Área</Text>
        <Text style={styles.value}>{selected.form?.area}</Text>
      </View>

      <View style={styles.detailBox}>
        <Text style={styles.label}>Fecha</Text>
        <Text style={styles.value}>{selected.createdAt}</Text>
      </View>
    </View>

    {/* MAPA GPS */}
    {selected?.boxes &&
      Object.keys(selected.boxes).map((k) => {
        const box = selected.boxes[k];

        if (!box?.estadoEncontrado?.gps) return null;

        return (
          <View key={k} style={styles.gpsBox}>
            <Text style={styles.subTitle}>Ubicación registrada</Text>

            <Text style={styles.value}>
              Latitud: {box.estadoEncontrado.gps.latitude}
            </Text>

            <Text style={styles.value}>
              Longitud: {box.estadoEncontrado.gps.longitude}
            </Text>

            <TouchableOpacity
              style={styles.mapBtn}
              onPress={() =>
                openGoogleMaps(
                  box.estadoEncontrado.gps.latitude,
                  box.estadoEncontrado.gps.longitude
                )
              }
            >
              <Text style={styles.mapBtnText}>Abrir en Google Maps</Text>
            </TouchableOpacity>
          </View>
        );
      })}

    {/* FOTOS */}
    {selected.boxes &&
      Object.keys(selected.boxes).map((k) => {
        const box = selected.boxes[k];

        return (
          <View key={k} style={styles.stationCard}>
            <Text style={styles.stationTitle}>{box.name}</Text>

            {box.estadoEncontrado?.uri && (
  <View style={styles.photoBlock}>
    <Text style={styles.photoLabel}>Estado encontrado</Text>

    <Image source={{ uri: box.estadoEncontrado.uri }} style={styles.img} />

    <Text style={styles.photoDate}>
      {box.estadoEncontrado.createdAt || "Sin fecha"}
    </Text>
  </View>
)}

{box.estadoFinal?.uri && (
  <View style={styles.photoBlock}>
    <Text style={styles.photoLabel}>Estado final</Text>

    <Image source={{ uri: box.estadoFinal.uri }} style={styles.img} />

    <Text style={styles.photoDate}>
      {box.estadoFinal.createdAt || "Sin fecha"}
    </Text>
  </View>
)}

{box.fichaFirmada?.uri && (
  <View style={styles.photoBlock}>
    <Text style={styles.photoLabel}>Ficha física firmada</Text>

    <Image source={{ uri: box.fichaFirmada.uri }} style={styles.img} />

    <Text style={styles.photoDate}>
      {box.fichaFirmada.createdAt || "Sin fecha"}
    </Text>
  </View>
)}
          </View>
        );
      })}
  </>
)}

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setSelected(null)}
          >
            <Text style={{ color: "#fff" }}>Cerrar</Text>
          </TouchableOpacity>

        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}

/* STYLES */
const styles = StyleSheet.create({
  container: { padding: 15, backgroundColor: "#fff" },
section: {
  backgroundColor: "#fff",
  padding: 15,
  borderRadius: 12,
  marginTop: 10,
  borderWidth: 1,
  borderColor: "#eee",
},

sectionTitleBig: {
  fontSize: 20,
  fontWeight: "bold",
  marginBottom: 10,
},

detailBox: {
  marginBottom: 12,
  paddingBottom: 8,
  borderBottomWidth: 1,
  borderBottomColor: "#f0f0f0",
},

label: {
  fontSize: 14,
  color: "#777",
  marginBottom: 3,
},

value: {
  fontSize: 16,
  color: "#111",
  fontWeight: "500",
},

subTitle: {
  fontSize: 16,
  fontWeight: "600",
  marginBottom: 8,
},

gpsBox: {
  backgroundColor: "#fafafa",
  padding: 15,
  borderRadius: 12,
  marginTop: 10,
  borderWidth: 1,
  borderColor: "#eee",
},

mapBtn: {
  marginTop: 10,
  backgroundColor: "#2E7D32",
  padding: 10,
  borderRadius: 8,
  alignItems: "center",
},

mapBtnText: {
  color: "#fff",
  fontWeight: "600",
},
photoDate: {
  marginTop: 6,
  fontSize: 12,
  color: "#777",
},
stationCard: {
  backgroundColor: "#fff",
  padding: 15,
  borderRadius: 12,
  marginTop: 12,
  borderWidth: 1,
  borderColor: "#eee",
},

stationTitle: {
  fontWeight: "bold",
  fontSize: 16,
  marginBottom: 10,
},

photoBlock: {
  marginBottom: 12,
},

photoLabel: {
  fontSize: 14,
  color: "#555",
  marginBottom: 5,
},

img: {
  width: "100%",
  height: 180,
  borderRadius: 10,
},
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  title: { fontSize: 22, fontWeight: "bold" },
  logout: { color: "red", fontWeight: "bold" },

  subtitle: { color: "#666", marginBottom: 10 },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  statBox: {
    width: "48%",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
    padding: 15,
    borderRadius: 12,
  },

  statNumber: { fontSize: 18, fontWeight: "bold" },

  btn: {
    backgroundColor: "#2E7D32",
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },

  btnText: { color: "#fff", textAlign: "center" },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 15,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  cardWrapper: {
    width: "48%",
  },

  card: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },

  cardTitle: { fontWeight: "bold" },
  meta: { fontSize: 12, color: "#666" },

  permissionBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    marginBottom: 8,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },

  modal: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 15,
  },

  modalTitle: { fontSize: 18, fontWeight: "bold" },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },

  cancel: { textAlign: "center", marginTop: 10, color: "red" },

  roleBtn: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    alignItems: "center",
  },

  roleActive: {
    backgroundColor: "#c8e6c9",
  },

  detail: { padding: 15 },

  detailTitle: { fontSize: 20, fontWeight: "bold" },

  section: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },

  stationCard: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
  },

  stationTitle: { fontWeight: "bold" },

  img: { width: "100%", height: 160, borderRadius: 10, marginTop: 5 },

  mapBox: {
    marginTop: 10,
  },

  map: {
    width: "100%",
    height: 200,
    borderRadius: 10,
  },

  closeBtn: {
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 10,
    marginTop: 15,
    alignItems: "center",
  },
});