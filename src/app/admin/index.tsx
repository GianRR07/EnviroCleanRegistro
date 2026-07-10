import {
  createAppUser,
  getAppUsers,
  type AppUser,
} from "@/utils/authUsers";
import {
  getIncidentsAppwrite,
  getRecordsAppwrite,
  resolveServiceRecordStatus,
} from "@/utils/appwriteRecords";
import { translateAppwriteError } from "@/utils/errorMessages";
import { clearCurrentUserSession } from "@/utils/session";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Card } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

// Importar estilos centralizados
import { adminStyles as styles } from "@/styles";

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
    worker: record.worker ?? {
      id: record.trabajadorId ?? "",
      username: record.trabajadorUsuario ?? "",
      name: record.trabajadorNombre ?? "",
    },
    trabajadorId: record.trabajadorId ?? "",
    trabajadorUsuario: record.trabajadorUsuario ?? "",
    trabajadorNombre: record.trabajadorNombre ?? "",
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

  const [users, setUsers] = useState<AppUser[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const [form, setForm] = useState({
    username: "",
    password: "",
    name: "",
    role: "cliente" as "admin" | "trabajador" | "cliente",
  });
  const [creatingUser, setCreatingUser] = useState(false);


  const loadRecords = async () => {
    try {
      console.log("🔄 Cargando registros desde Appwrite...");

      const [data, incidentsData] = await Promise.all([
        getRecordsAppwrite(),
        getIncidentsAppwrite(),
      ]);

      const normalizedRecords = (data || []).map(normalizeRecord);

      // Resolver el estado final del registro según completitud y rechazo.
      const updatedRecords = normalizedRecords.map((r: any) => {
        r.status = resolveServiceRecordStatus(r);
        return r;
      });

      console.log("✅ Registros normalizados:", updatedRecords.length);

      if (updatedRecords.length > 0) {
        console.log(
          "📋 Primer registro normalizado:",
          JSON.stringify(updatedRecords[0], null, 2),
        );
      }

      setRecords(updatedRecords);
      setIncidents(incidentsData || []);
    } catch (error) {
      console.log("❌ Error al cargar registros desde Appwrite:", error);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await getAppUsers();
      setUsers(data || []);
    } catch (error) {
      console.log("❌ Error cargando usuarios:", error);
      setUsers([]);
    }
  };


  useEffect(() => {
    loadRecords();
    loadUsers();
    const interval = setInterval(loadRecords, 8000);

    return () => clearInterval(interval);
  }, []);

  const createUser = async () => {
    const username = form.username.trim();
    const password = form.password.trim();
    const name = form.name.trim();

    if (!username || !password) {
      alert("Completa usuario y contraseña.");
      return;
    }

    if (password.length < 6) {
      alert("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (!form.role) {
      alert("Selecciona el tipo de usuario.");
      return;
    }

    try {
      setCreatingUser(true);
      await createAppUser({
        username,
        password,
        name,
        role: form.role,
      });

      await loadUsers();
      setForm({ username: "", password: "", name: "", role: "cliente" });
      setModal(false);
      alert("Usuario creado correctamente.");
    } catch (error: any) {
      console.log("❌ Error creando usuario:", error);
      alert(translateAppwriteError(error, "No se pudo crear el usuario."));
    } finally {
      setCreatingUser(false);
    }
  };

  const logout = async () => {
    await clearCurrentUserSession();
    router.replace("/login");
  };


  const completados = records.filter((r) => r.status === "completado").length;
  const pendientes = records.filter((r) => r.status === "pendiente").length;
  const rechazados = records.filter((r) => r.status === "rechazado").length;

  const getRecordIncidents = (record: any) => {
    const recordId = String(record?.appwriteId || record?.$id || record?.id || "");
    return incidents.filter((incident) => String(incident.recordId) === recordId);
  };

  const getWorkerLabel = (record: any) => {
    return (
      record?.trabajadorNombre ||
      record?.worker?.name ||
      record?.trabajadorUsuario ||
      record?.worker?.username ||
      "No registrado"
    );
  };

  const openGoogleMaps = (latitude: number, longitude: number) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    Linking.openURL(url);
  };

const getStatusBadge = (status: string) => {
  if (status === "rechazado") {
    return (
      <View style={[styles.badge, styles.badgeRed]}>
        <Text style={styles.badgeText}>Rechazado</Text>
      </View>
    );
  }
  const isComplete = status === "completado";
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

  const getIncidentImageUrl = (image: any) => {
    if (!image) return null;
    if (typeof image === "string") {
      if (image.startsWith("http")) return image;
      return `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${image}/view?project=${APPWRITE_PROJECT_ID}`;
    }
    return image.uri || image.url || getPhotoUrl(image);
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
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
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

          <View style={[styles.statCard, { borderLeftColor: "#C62828" }]}> 
            <Ionicons name="alert-circle-outline" size={24} color="#C62828" />
            <Text style={styles.statLabel}>Rechazados</Text>
            <Text style={styles.statNumber}>{rechazados}</Text>
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

        {/* USUARIOS DEL SISTEMA */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Usuarios del sistema</Text>
          <TouchableOpacity onPress={loadUsers}>
            <Text style={styles.count}>Actualizar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.permissionsCard}>
          {users.length > 0 ? (
            users.map((u) => (
              <View key={String(u.appwriteId || u.id)} style={styles.permissionRow}>
                <View style={styles.permissionInfo}>
                  <Ionicons
                    name={
                      u.role === "admin"
                        ? "shield-checkmark-outline"
                        : u.role === "trabajador"
                          ? "construct-outline"
                          : "business-outline"
                    }
                    size={22}
                    color="#2E7D32"
                  />
                  <View>
                    <Text style={styles.permissionText}>
                      {u.username} {u.name ? `- ${u.name}` : ""}
                    </Text>
                    <Text style={{ color: "#777", fontSize: 12 }}>
                      Rol: {u.role} · {u.active ? "Activo" : "Inactivo"}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No se pudieron cargar usuarios</Text>
            </View>
          )}
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
                  <Text style={styles.meta} numberOfLines={1}>
                    Trabajador: {getWorkerLabel(r)}
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
              placeholder="Usuario de acceso"
              placeholderTextColor="#999"
              value={form.username}
              onChangeText={(t) => setForm({ ...form, username: t })}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              placeholder="Contraseña"
              placeholderTextColor="#999"
              value={form.password}
              onChangeText={(t) => setForm({ ...form, password: t })}
              style={styles.input}
              secureTextEntry
            />

            <TextInput
              placeholder="Nombre visible u observación"
              placeholderTextColor="#999"
              value={form.name}
              onChangeText={(t) => setForm({ ...form, name: t })}
              style={styles.input}
            />

            <Text style={styles.label}>Tipo de usuario</Text>
            <View style={styles.roleRow}>
              {(["admin", "trabajador", "cliente"] as const).map((role) => (
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
                    {role === "admin"
                      ? "Admin"
                      : role === "trabajador"
                        ? "Trabajador"
                        : "Cliente"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, creatingUser && { opacity: 0.7 }]}
              onPress={createUser}
              disabled={creatingUser}
            >
              <Text style={styles.primaryBtnText}>
                {creatingUser ? "Guardando..." : "Guardar usuario"}
              </Text>
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
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Trabajador</Text>
                    <Text style={styles.infoValue}>{getWorkerLabel(selected)}</Text>
                  </View>
                </View>

                {/* Incidencias asociadas */}
                {selected.status === "rechazado" && (
                  <View
                    style={{
                      backgroundColor: "#FFEBEE",
                      borderRadius: 16,
                      padding: 16,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: "#EF9A9A",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <Ionicons
                        name="alert-circle"
                        size={22}
                        color="#C62828"
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={{
                          color: "#C62828",
                          fontSize: 17,
                          fontWeight: "800",
                        }}
                      >
                        Incidencia del cliente
                      </Text>
                    </View>

                    {getRecordIncidents(selected).length > 0 ? (
                      getRecordIncidents(selected).map((incident) => (
                        <View
                          key={String(incident.appwriteId || incident.id)}
                          style={{
                            backgroundColor: "#fff",
                            borderRadius: 12,
                            padding: 12,
                            marginTop: 10,
                          }}
                        >
                          <Text style={{ fontWeight: "800", color: "#333" }}>
                            Foto rechazada:
                          </Text>
                          <Text style={{ color: "#555", marginTop: 4 }}>
                            {incident.tipoIncidencia || "No especificada"}
                          </Text>

                          <Text
                            style={{
                              fontWeight: "800",
                              color: "#333",
                              marginTop: 10,
                            }}
                          >
                            Comentario del cliente:
                          </Text>
                          <Text style={{ color: "#555", marginTop: 4 }}>
                            {incident.observacion?.trim()
                              ? incident.observacion
                              : "Sin comentario adicional"}
                          </Text>

                          <View style={{ marginTop: 10 }}>
                            <Text style={{ color: "#777" }}>
                              Estado incidencia: {incident.estado || "pendiente"}
                            </Text>
                            <Text style={{ color: "#777" }}>
                              Fecha: {incident.createdAt || "Sin fecha"}
                            </Text>
                          </View>

                          {Array.isArray(incident.imagenes) &&
                            incident.imagenes.length > 0 && (
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={{ marginTop: 12 }}
                              >
                                {incident.imagenes.map((image: any, idx: number) => {
                                  const imageUrl = getIncidentImageUrl(image);
                                  if (!imageUrl) return null;

                                  return (
                                    <Image
                                      key={`${incident.id}-${idx}`}
                                      source={{ uri: imageUrl }}
                                      style={{
                                        width: 120,
                                        height: 120,
                                        borderRadius: 10,
                                        marginRight: 10,
                                        backgroundColor: "#eee",
                                      }}
                                    />
                                  );
                                })}
                              </ScrollView>
                            )}
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: "#555" }}>
                        Este registro está rechazado, pero aún no se pudo leer
                        el detalle de la incidencia asociada.
                      </Text>
                    )}
                  </View>
                )}

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
