import { getRecordsAppwrite } from "@/utils/appwriteRecords";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Card } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

const screenWidth = Dimensions.get("window").width;

const APPWRITE_ENDPOINT = "https://nyc.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6a46e8b90028a108e50f";
const APPWRITE_BUCKET_ID = "photos";

const parseJsonField = (value: any, fallback: any) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeRecord = (record: any) => {
  const boxes = parseJsonField(record.boxes, {});
  const stations = parseJsonField(record.stations, []);

  const form = parseJsonField(record.form, {
    cliente: record.cliente ?? "",
    tipoServicio: record.tipoServicio ?? "",
    tipoEstacionPrincipal: record.tipoEstacionPrincipal ?? "",
    detalleEstacion: record.detalleEstacion ?? "",
    area: record.area ?? "",
    observaciones: record.observaciones ?? "",
    cantidadEstaciones: record.cantidadEstaciones ?? "",
  });

  return {
    ...record,
    id: record.localId ?? record.id ?? record.$id,
    appwriteId: record.$id,
    form,
    boxes,
    stations:
      Array.isArray(stations) && stations.length > 0
        ? stations
        : Object.values(boxes || {}),
    status: record.status ?? "pendiente",
    createdAt: record.createdAt ?? record.$createdAt ?? "",
  };
};

const getStationsFromRecord = (record: any) => {
  if (!record) return [];

  const stations = parseJsonField(record.stations, []);
  if (Array.isArray(stations) && stations.length > 0) return stations;

  const boxes = parseJsonField(record.boxes, {});
  return Object.values(boxes || {});
};

export default function Admin() {
  const router = useRouter();

  const [users, setUsers] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const [form, setForm] = useState({
    name: "",
    role: "cliente",
  });

  const [permissions, setPermissions] = useState({
    verTrabajador: true,
    verGPS: true,
    verFicha: true,
    verDatos: true,
  });

  const loadRecords = async () => {
    try {
      console.log("🔄 Cargando registros desde Appwrite...");

      const data = await getRecordsAppwrite();

      const normalizedRecords = (data || []).map(normalizeRecord);

      console.log("✅ Registros normalizados:", normalizedRecords.length);

      if (normalizedRecords.length > 0) {
        console.log(
          "📋 Primer registro normalizado:",
          JSON.stringify(normalizedRecords[0], null, 2),
        );
      }

      setRecords(normalizedRecords);
    } catch (error) {
      console.log("❌ Error al cargar registros desde Appwrite:", error);
    }
  };

  useEffect(() => {
    loadRecords();

    const interval = setInterval(loadRecords, 8000);

    return () => clearInterval(interval);
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
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const completados = records.filter((r) => r.status === "completo").length;
  const pendientes = records.filter((r) => r.status !== "completo").length;

  const openGoogleMaps = (latitude: number, longitude: number) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    Linking.openURL(url);
  };

  const getStatusBadge = (status: string) => {
    const isComplete = status === "completo";
    return (
      <View
        style={[
          styles.badge,
          isComplete ? styles.badgeGreen : styles.badgeOrange,
        ]}
      >
        <Text style={styles.badgeText}>
          {isComplete ? "Completado" : "Pendiente"}
        </Text>
      </View>
    );
  };
  const getPhotoUrl = (photoData: any) => {
    if (!photoData) return null;

    if (typeof photoData === "string") {
      return photoData.startsWith("http") ? photoData : null;
    }

    if (photoData.uri && photoData.uri.startsWith("http")) {
      return photoData.uri;
    }

    const fileId =
      photoData.appwriteId || photoData.fileId || photoData.$id || photoData.id;

    if (fileId) {
      return `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}/view?project=${APPWRITE_PROJECT_ID}`;
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Panel Admin</Text>
            <Text style={styles.subtitle}>
              Control de registros en tiempo real
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.replace("/login")}
            style={styles.logoutBtn}
          >
            <Ionicons name="log-out-outline" size={20} color="#c62828" />
            <Text style={styles.logoutText}>Salir</Text>
          </TouchableOpacity>
        </View>

        {/* STATS */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: "#2E7D32" }]}>
            <Ionicons name="people-outline" size={24} color="#2E7D32" />
            <Text style={styles.statLabel}>Usuarios</Text>
            <Text style={styles.statNumber}>{users.length}</Text>
          </View>

          <View style={[styles.statCard, { borderLeftColor: "#1565C0" }]}>
            <Ionicons name="document-text-outline" size={24} color="#1565C0" />
            <Text style={styles.statLabel}>Registros</Text>
            <Text style={styles.statNumber}>{records.length}</Text>
          </View>

          <View style={[styles.statCard, { borderLeftColor: "#43A047" }]}>
            <Ionicons
              name="checkmark-circle-outline"
              size={24}
              color="#43A047"
            />
            <Text style={styles.statLabel}>Completados</Text>
            <Text style={styles.statNumber}>{completados}</Text>
          </View>

          <View style={[styles.statCard, { borderLeftColor: "#FB8C00" }]}>
            <Ionicons name="time-outline" size={24} color="#FB8C00" />
            <Text style={styles.statLabel}>Pendientes</Text>
            <Text style={styles.statNumber}>{pendientes}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={{
            backgroundColor: "#1565C0",
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            gap: 8,
          }}
          onPress={loadRecords}
        >
          <Ionicons name="refresh-outline" size={22} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
            Actualizar Registros
          </Text>
        </TouchableOpacity>
        {/* BOTÓN CREAR USUARIO */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => setModal(true)}
        >
          <Ionicons
            name="person-add-outline"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.primaryBtnText}>Crear nuevo usuario</Text>
        </TouchableOpacity>

        {/* PERMISOS */}
        <Text style={styles.sectionTitle}>Permisos de acceso</Text>
        <View style={styles.permissionsCard}>
          {Object.keys(permissions).map((key) => {
            const k = key as keyof typeof permissions;
            return (
              <View key={key} style={styles.permissionRow}>
                <View style={styles.permissionInfo}>
                  <Ionicons
                    name={permissions[k] ? "checkmark-circle" : "close-circle"}
                    size={22}
                    color={permissions[k] ? "#2E7D32" : "#c62828"}
                  />
                  <Text style={styles.permissionText}>{key}</Text>
                </View>
                <Switch
                  value={permissions[k]}
                  onValueChange={() => togglePermission(k)}
                  trackColor={{ false: "#ccc", true: "#A5D6A7" }}
                  thumbColor={permissions[k] ? "#2E7D32" : "#f4f3f4"}
                />
              </View>
            );
          })}
        </View>

        {/* REGISTROS */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Registros recientes</Text>
          <Text style={styles.count}>{records.length} registros</Text>
        </View>

        <View style={styles.grid}>
          {records.length > 0 ? (
            records.map((r) => (
              <TouchableOpacity
                key={String(r.appwriteId || r.id)}
                style={styles.cardWrapper}
                onPress={() => setSelected(r)}
              >
                <Card style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {r.form?.cliente || "Sin cliente"}
                    </Text>
                    {getStatusBadge(r.status)}
                  </View>

                  <Text style={styles.cardSubtitle}>
                    {r.form?.tipoServicio || "Servicio no especificado"}
                  </Text>

                  <View style={styles.cardFooter}>
                    <Text style={styles.meta}>{r.createdAt}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#999" />
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No hay registros aún</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* MODAL: CREAR USUARIO */}
      <Modal visible={modal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Crear nuevo usuario</Text>

            <TextInput
              placeholder="Nombre completo"
              placeholderTextColor="#999"
              value={form.name}
              onChangeText={(t) => setForm({ ...form, name: t })}
              style={styles.input}
            />

            <Text style={styles.label}>Tipo de usuario</Text>
            <View style={styles.roleRow}>
              {["cliente", "supervisor"].map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleBtn,
                    form.role === role && styles.roleActive,
                  ]}
                  onPress={() => setForm({ ...form, role })}
                >
                  <Text
                    style={
                      form.role === role
                        ? styles.roleActiveText
                        : styles.roleText
                    }
                  >
                    {role === "cliente" ? "Cliente" : "Supervisor"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={createUser}>
              <Text style={styles.primaryBtnText}>Guardar usuario</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setModal(false)}
              style={{ marginTop: 12 }}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: DETALLE DEL REGISTRO */}
      <Modal visible={!!selected} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F1F8E9" }}>
          <ScrollView style={styles.detailContainer}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Detalle del Registro</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            {selected && (
              <>
                {/* Info general */}
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Cliente</Text>
                    <Text style={styles.infoValue}>
                      {selected.form?.cliente}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Servicio</Text>
                    <Text style={styles.infoValue}>
                      {selected.form?.tipoServicio}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Área</Text>
                    <Text style={styles.infoValue}>{selected.form?.area}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Fecha</Text>
                    <Text style={styles.infoValue}>{selected.createdAt}</Text>
                  </View>
                </View>

                {/* GPS */}
                {selected?.boxes &&
                  Object.keys(selected.boxes).map((k) => {
                    const box = selected.boxes[k];
                    if (!box?.estadoEncontrado?.gps) return null;

                    return (
                      <View key={k} style={styles.gpsCard}>
                        <Text style={styles.gpsTitle}>Ubicación GPS</Text>
                        <Text>Lat: {box.estadoEncontrado.gps.latitude}</Text>
                        <Text>Lon: {box.estadoEncontrado.gps.longitude}</Text>
                        <TouchableOpacity
                          style={styles.mapButton}
                          onPress={() =>
                            openGoogleMaps(
                              box.estadoEncontrado.gps.latitude,
                              box.estadoEncontrado.gps.longitude,
                            )
                          }
                        >
                          <Ionicons name="map-outline" size={18} color="#fff" />
                          <Text style={styles.mapButtonText}>
                            Abrir en Google Maps
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                {/* Fotos */}
                {getStationsFromRecord(selected).map(
                  (station: any, index: number) => (
                    <View key={index} style={styles.stationCard}>
                      <Text style={styles.stationTitle}>
                        Estación {station.numero || index + 1} -{" "}
                        {station.ubicacion || ""}
                      </Text>

                      {["estadoEncontrado", "estadoFinal", "formatoFisico"].map(
                        (type) => {
                          const photo = station[type];
                          const photoUrl = getPhotoUrl(photo);
                          if (!photoUrl) return null;

                          return (
                            <View key={type} style={styles.photoSection}>
                              <Text style={styles.photoLabel}>
                                {type === "estadoEncontrado"
                                  ? "Estado Encontrado"
                                  : type === "estadoFinal"
                                    ? "Estado Final"
                                    : "Formato Físico"}
                              </Text>
                              <Image
                                source={{ uri: photoUrl }}
                                style={styles.photo}
                              />
                            </View>
                          );
                        },
                      )}
                    </View>
                  ),
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelected(null)}
            >
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/* ==================== ESTILOS ==================== */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F1F8E9" },
  container: { padding: 20, paddingBottom: 40 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  title: { fontSize: 26, fontWeight: "800", color: "#1B5E20" },
  subtitle: { color: "#555", fontSize: 15, marginTop: 2 },

  logoutBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  logoutText: { color: "#c62828", fontWeight: "600" },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  statLabel: { fontSize: 13, color: "#666", marginTop: 6 },
  statNumber: { fontSize: 26, fontWeight: "800", color: "#222", marginTop: 2 },

  primaryBtn: {
    backgroundColor: "#2E7D32",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 24,
    shadowColor: "#2E7D32",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B5E20",
    marginBottom: 12,
  },

  permissionsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 8,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  permissionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  permissionInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  permissionText: { fontSize: 15, color: "#333" },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  count: { color: "#666", fontSize: 14 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  cardWrapper: { width: "47%" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
    flex: 1,
    marginRight: 8,
  },
  cardSubtitle: { color: "#555", fontSize: 13, marginBottom: 12 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  meta: { fontSize: 12, color: "#888" },

  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeGreen: { backgroundColor: "#C8E6C9" },
  badgeOrange: { backgroundColor: "#FFE0B2" },
  badgeText: { fontSize: 11, fontWeight: "700" },

  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyText: { color: "#999", marginTop: 12 },

  // Modales
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: { backgroundColor: "#fff", borderRadius: 20, padding: 24 },

  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
    color: "#1B5E20",
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  label: { fontSize: 14, color: "#555", marginBottom: 8 },
  roleRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  roleBtn: {
    flex: 1,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 12,
    alignItems: "center",
  },
  roleActive: { backgroundColor: "#C8E6C9", borderColor: "#2E7D32" },
  roleText: { color: "#555" },
  roleActiveText: { color: "#1B5E20", fontWeight: "600" },
  cancelText: { textAlign: "center", color: "#c62828", fontWeight: "600" },

  // Detalle
  detailContainer: { padding: 20 },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  detailTitle: { fontSize: 22, fontWeight: "800", color: "#1B5E20" },

  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  infoRow: { marginBottom: 14 },
  infoLabel: { fontSize: 13, color: "#666", marginBottom: 4 },
  infoValue: { fontSize: 16, fontWeight: "600", color: "#222" },

  gpsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  gpsTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
    color: "#1565C0",
  },

  mapButton: {
    marginTop: 12,
    backgroundColor: "#2E7D32",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  mapButtonText: { color: "#fff", fontWeight: "700" },

  stationCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  stationTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  photoSection: { marginBottom: 16 },
  photoLabel: {
    fontSize: 14,
    color: "#555",
    marginBottom: 6,
    fontWeight: "600",
  },
  photo: { width: "100%", height: 180, borderRadius: 12 },

  closeButton: {
    backgroundColor: "#333",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 40,
  },
  closeButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
