import { createAppUser, getAppUsers, type AppUser } from "@/utils/authUsers";

import {
  getIncidentsAppwrite,
  getRecordsAppwrite,
  resolveServiceRecordStatus,
} from "@/utils/appwriteRecords";

import { useAndroidBackHandler } from "@/hooks/use-android-back-handler";
import { adminStyles as styles } from "@/styles";
import { translateAppwriteError } from "@/utils/errorMessages";
import { clearCurrentUserSession } from "@/utils/session";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { useCallback, useRef, useState } from "react";

import {
  ActivityIndicator,
  BackHandler,
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

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const APPWRITE_ENDPOINT = "https://nyc.cloud.appwrite.io/v1";

const APPWRITE_PROJECT_ID = "6a46e8b90028a108e50f";

const APPWRITE_BUCKET_ID = "photos";

/**
 * Intervalo de actualización automática.
 *
 * La actualización automática es silenciosa:
 * no muestra spinner ni cambia el texto del botón.
 */
const AUTO_REFRESH_INTERVAL_MS = 30_000;

type LoadRecordsOptions = {
  showIndicator?: boolean;
};

/* =========================================================
   UTILIDADES DE NORMALIZACIÓN
========================================================= */

const parseJsonField = (value: any, fallback: any) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeRecord = (record: any) => {
  const rawBoxes = parseJsonField(record.boxes, {});

  /**
   * Se eliminan los metadatos internos utilizados
   * para guardar información adicional dentro de boxes.
   */
  const boxes = Object.fromEntries(
    Object.entries(rawBoxes || {}).filter(
      ([key]) => !String(key).startsWith("__enviroclean"),
    ),
  );

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

    appwriteId: record.appwriteId ?? record.$id,

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

const getRelatedUserId = (record: any) => {
  const relation = record?.idUser;

  if (!relation) {
    return record?.idUserId ?? "";
  }

  if (typeof relation === "string") {
    return relation;
  }

  return (
    relation.$id ?? relation.id ?? relation.appwriteId ?? record?.idUserId ?? ""
  );
};

const isMissingWorkerText = (value: any) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return (
    !normalized ||
    normalized === "trabajador no identificado" ||
    normalized === "no registrado"
  );
};

const enrichRecordWithUser = (record: any, appUsers: AppUser[]) => {
  const relationUser =
    record?.idUser && typeof record.idUser === "object" ? record.idUser : null;

  const workerId =
    record?.trabajadorId ||
    record?.worker?.id ||
    record?.worker?.appwriteId ||
    getRelatedUserId(record);

  const matchedUser = appUsers.find((user) => {
    const userId = user.appwriteId || user.id || "";

    return !!workerId && String(userId) === String(workerId);
  });

  const rawUsername =
    record?.trabajadorUsuario ||
    record?.worker?.username ||
    relationUser?.username ||
    matchedUser?.username ||
    "";

  const rawName =
    record?.trabajadorNombre ||
    record?.worker?.name ||
    relationUser?.name ||
    matchedUser?.name ||
    rawUsername;

  const username = isMissingWorkerText(rawUsername)
    ? matchedUser?.username || ""
    : rawUsername;

  const name = isMissingWorkerText(rawName)
    ? matchedUser?.name || username
    : rawName;

  return {
    ...record,

    idUserId: workerId,
    trabajadorId: workerId,
    trabajadorUsuario: username,
    trabajadorNombre: name,

    worker: {
      ...(record?.worker ?? {}),
      id: workerId,
      appwriteId: workerId,
      username,
      name,
    },
  };
};

const getStationsFromRecord = (record: any) => {
  if (!record) {
    return [];
  }

  const stations = parseJsonField(record.stations, []);

  if (Array.isArray(stations) && stations.length > 0) {
    return stations;
  }

  const boxes = parseJsonField(record.boxes, {});

  return Object.entries(boxes || {})
    .filter(([key]) => !String(key).startsWith("__enviroclean"))
    .map(([, station]) => station);
};

const getRecordIdentifier = (record: any) => {
  return String(record?.appwriteId || record?.$id || record?.id || "");
};

const getFiniteNumber = (value: unknown) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

const formatCoordinate = (value: unknown) => {
  const coordinate = getFiniteNumber(value);

  return coordinate === null ? "No disponible" : coordinate.toFixed(6);
};

/* =========================================================
   COMPONENTE PRINCIPAL
========================================================= */

export default function Admin() {
  const router = useRouter();

  const [users, setUsers] = useState<AppUser[]>([]);

  const [records, setRecords] = useState<any[]>([]);

  const [incidents, setIncidents] = useState<any[]>([]);

  const [modal, setModal] = useState(false);

  const [selected, setSelected] = useState<any>(null);

  const [creatingUser, setCreatingUser] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [form, setForm] = useState({
    username: "",
    password: "",
    name: "",
    role: "cliente" as "admin" | "trabajador" | "cliente",
  });

  /**
   * Bloquea las cargas simultáneas.
   *
   * No se utiliza el estado refreshing para bloquear,
   * porque eso podría recrear callbacks y efectos.
   */
  const loadInProgressRef = useRef(false);

  /* =======================================================
     BOTÓN ATRÁS DE ANDROID
  ======================================================= */

  useAndroidBackHandler(() => {
    if (selected) {
      setSelected(null);
      return true;
    }

    if (modal) {
      setModal(false);
      return true;
    }

    BackHandler.exitApp();
    return true;
  });

  /* =======================================================
     CARGA DEL PANEL
  ======================================================= */

  const loadRecords = useCallback(
    async ({ showIndicator = false }: LoadRecordsOptions = {}) => {
      /**
       * Evita iniciar otra consulta si todavía existe
       * una solicitud activa.
       */
      if (loadInProgressRef.current) {
        console.log("⏳ El panel administrador ya se está actualizando.");

        return;
      }

      loadInProgressRef.current = true;

      if (showIndicator) {
        setRefreshing(true);
      }

      try {
        console.log("🔄 Cargando información del panel administrador...");

        const [recordsData, incidentsData, usersData] = await Promise.all([
          getRecordsAppwrite(),
          getIncidentsAppwrite(),
          getAppUsers(),
        ]);

        const normalizedRecords = (recordsData || [])
          .map(normalizeRecord)
          .map((record: any) => enrichRecordWithUser(record, usersData || []));

        /**
         * No se modifica directamente el registro original.
         * Se crea un nuevo objeto con el estado resuelto.
         */
        const updatedRecords = normalizedRecords.map((record: any) => ({
          ...record,
          status: resolveServiceRecordStatus(record),
        }));

        console.log(
          `✅ Panel actualizado: ${updatedRecords.length} registro(s), ${
            incidentsData?.length || 0
          } incidencia(s) y ${usersData?.length || 0} usuario(s).`,
        );

        setRecords(updatedRecords);
        setIncidents(incidentsData || []);
        setUsers(usersData || []);

        /**
         * Si está abierto el detalle de un registro,
         * se reemplaza por su versión actualizada.
         */
        setSelected((currentSelected: any) => {
          if (!currentSelected) {
            return null;
          }

          const selectedId = getRecordIdentifier(currentSelected);

          return (
            updatedRecords.find(
              (record: any) => getRecordIdentifier(record) === selectedId,
            ) || currentSelected
          );
        });
      } catch (error) {
        console.log("❌ Error al cargar el panel administrador:", error);
      } finally {
        loadInProgressRef.current = false;

        if (showIndicator) {
          setRefreshing(false);
        }
      }
    },
    [],
  );

  /* =======================================================
     ACTUALIZACIÓN DE USUARIOS
  ======================================================= */

  const loadUsers = useCallback(async () => {
    try {
      const data = await getAppUsers();

      setUsers(data || []);
    } catch (error) {
      console.log("❌ Error cargando usuarios:", error);

      setUsers([]);
    }
  }, []);

  /* =======================================================
     CARGA AL ENFOCAR EL PANEL
  ======================================================= */

  useFocusEffect(
    useCallback(() => {
      /**
       * Se ejecuta una sola carga al entrar al panel.
       */
      void loadRecords({
        showIndicator: true,
      });

      /**
       * Refresco automático silencioso.
       *
       * No muestra spinner ni cambia el texto
       * del botón de actualización.
       */
      const intervalId = setInterval(() => {
        void loadRecords({
          showIndicator: false,
        });
      }, AUTO_REFRESH_INTERVAL_MS);

      return () => {
        clearInterval(intervalId);
      };
    }, [loadRecords]),
  );

  /* =======================================================
     CREACIÓN DE USUARIO
  ======================================================= */

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

      /**
       * Se actualiza la lista de usuarios sin iniciar
       * una segunda consulta general innecesaria.
       */
      await loadUsers();

      setForm({
        username: "",
        password: "",
        name: "",
        role: "cliente",
      });

      setModal(false);

      alert("Usuario creado correctamente.");
    } catch (error: any) {
      console.log("❌ Error creando usuario:", error);

      alert(translateAppwriteError(error, "No se pudo crear el usuario."));
    } finally {
      setCreatingUser(false);
    }
  };

  /* =======================================================
     CIERRE DE SESIÓN
  ======================================================= */

  const logout = async () => {
    await clearCurrentUserSession();

    router.replace("/login");
  };

  /* =======================================================
     ESTADÍSTICAS
  ======================================================= */

  const completados = records.filter(
    (record) => record.status === "completado",
  ).length;

  const pendientes = records.filter(
    (record) => record.status === "pendiente",
  ).length;

  const rechazados = records.filter(
    (record) => record.status === "rechazado",
  ).length;

  /* =======================================================
     INCIDENCIAS
  ======================================================= */

  const getRecordIncidents = (record: any) => {
    const recordId = getRecordIdentifier(record);

    return incidents.filter(
      (incident) => String(incident.recordId) === recordId,
    );
  };

  /* =======================================================
     TRABAJADOR
  ======================================================= */

  const getWorkerLabel = (record: any) => {
    return (
      record?.trabajadorNombre ||
      record?.worker?.name ||
      record?.trabajadorUsuario ||
      record?.worker?.username ||
      "No registrado"
    );
  };

  /* =======================================================
     UBICACIÓN GPS
  ======================================================= */

  const openGoogleMaps = (latitudeValue: unknown, longitudeValue: unknown) => {
    const latitude = getFiniteNumber(latitudeValue);

    const longitude = getFiniteNumber(longitudeValue);

    if (latitude === null || longitude === null) {
      return;
    }

    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

    void Linking.openURL(url);
  };

  /* =======================================================
     ESTADO DEL REGISTRO
  ======================================================= */

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

  /* =======================================================
     FOTOGRAFÍAS
  ======================================================= */

  const getPhotoUrl = (photoData: any) => {
    if (!photoData) {
      return null;
    }

    if (typeof photoData === "string") {
      if (
        photoData.startsWith("http") ||
        photoData.startsWith("file://") ||
        photoData.startsWith("content://")
      ) {
        return photoData;
      }

      return `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${photoData}/view?project=${APPWRITE_PROJECT_ID}`;
    }

    if (
      photoData?.uri?.startsWith("http") ||
      photoData?.uri?.startsWith("file://") ||
      photoData?.uri?.startsWith("content://")
    ) {
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
    if (!image) {
      return null;
    }

    if (typeof image === "string") {
      if (
        image.startsWith("http") ||
        image.startsWith("file://") ||
        image.startsWith("content://")
      ) {
        return image;
      }

      return `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${image}/view?project=${APPWRITE_PROJECT_ID}`;
    }

    return image.uri || image.url || getPhotoUrl(image);
  };

  /* =========================================================
     INTERFAZ
  ========================================================= */

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

        {/* ESTADÍSTICAS */}

        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              {
                borderLeftColor: "#2E7D32",
              },
            ]}
          >
            <Ionicons name="people-outline" size={24} color="#2E7D32" />

            <Text style={styles.statLabel}>Usuarios</Text>

            <Text style={styles.statNumber}>{users.length}</Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                borderLeftColor: "#1565C0",
              },
            ]}
          >
            <Ionicons name="document-text-outline" size={24} color="#1565C0" />

            <Text style={styles.statLabel}>Registros</Text>

            <Text style={styles.statNumber}>{records.length}</Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                borderLeftColor: "#43A047",
              },
            ]}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={24}
              color="#43A047"
            />

            <Text style={styles.statLabel}>Completados</Text>

            <Text style={styles.statNumber}>{completados}</Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                borderLeftColor: "#FB8C00",
              },
            ]}
          >
            <Ionicons name="time-outline" size={24} color="#FB8C00" />

            <Text style={styles.statLabel}>Pendientes</Text>

            <Text style={styles.statNumber}>{pendientes}</Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                borderLeftColor: "#C62828",
              },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={24} color="#C62828" />

            <Text style={styles.statLabel}>Rechazados</Text>

            <Text style={styles.statNumber}>{rechazados}</Text>
          </View>
        </View>

        {/* BOTÓN ACTUALIZAR */}

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
            opacity: refreshing ? 0.7 : 1,
          }}
          onPress={() =>
            void loadRecords({
              showIndicator: true,
            })
          }
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="refresh-outline" size={22} color="#fff" />
          )}

          <Text
            style={{
              color: "#fff",
              fontWeight: "700",
              fontSize: 16,
            }}
          >
            {refreshing ? "Actualizando..." : "Actualizar registros"}
          </Text>
        </TouchableOpacity>

        {/* CREAR USUARIO */}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => setModal(true)}
        >
          <Ionicons
            name="person-add-outline"
            size={20}
            color="#fff"
            style={{
              marginRight: 8,
            }}
          />

          <Text style={styles.primaryBtnText}>Crear nuevo usuario</Text>
        </TouchableOpacity>

        {/* USUARIOS DEL SISTEMA */}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Usuarios del sistema</Text>

          <TouchableOpacity onPress={() => void loadUsers()}>
            <Text style={styles.count}>Actualizar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.permissionsCard}>
          {users.length > 0 ? (
            users.map((user) => (
              <View
                key={String(user.appwriteId || user.id)}
                style={styles.permissionRow}
              >
                <View style={styles.permissionInfo}>
                  <Ionicons
                    name={
                      user.role === "admin"
                        ? "shield-checkmark-outline"
                        : user.role === "trabajador"
                          ? "construct-outline"
                          : "business-outline"
                    }
                    size={22}
                    color="#2E7D32"
                  />

                  <View>
                    <Text style={styles.permissionText}>
                      {user.username} {user.name ? `- ${user.name}` : ""}
                    </Text>

                    <Text
                      style={{
                        color: "#777",
                        fontSize: 12,
                      }}
                    >
                      Rol: {user.role} · {user.active ? "Activo" : "Inactivo"}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No se pudieron cargar usuarios
              </Text>
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
            records.map((record) => (
              <TouchableOpacity
                key={getRecordIdentifier(record)}
                style={styles.cardWrapper}
                onPress={() => setSelected(record)}
              >
                <Card style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {record.form?.cliente || "Sin cliente"}
                    </Text>

                    {getStatusBadge(record.status)}
                  </View>

                  <Text style={styles.cardSubtitle}>
                    {record.form?.tipoServicio || "Servicio no especificado"}
                  </Text>

                  <Text style={styles.meta} numberOfLines={1}>
                    Trabajador: {getWorkerLabel(record)}
                  </Text>

                  <View style={styles.cardFooter}>
                    <Text style={styles.meta}>{record.createdAt}</Text>

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

      {/* =====================================================
          MODAL: CREAR USUARIO
      ===================================================== */}

      <Modal
        visible={modal}
        transparent
        animationType="fade"
        onRequestClose={() => setModal(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Crear nuevo usuario</Text>

            <TextInput
              placeholder="Usuario de acceso"
              placeholderTextColor="#999"
              value={form.username}
              onChangeText={(text) =>
                setForm({
                  ...form,
                  username: text,
                })
              }
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              placeholder="Contraseña"
              placeholderTextColor="#999"
              value={form.password}
              onChangeText={(text) =>
                setForm({
                  ...form,
                  password: text,
                })
              }
              style={styles.input}
              secureTextEntry
            />

            <TextInput
              placeholder="Nombre visible u observación"
              placeholderTextColor="#999"
              value={form.name}
              onChangeText={(text) =>
                setForm({
                  ...form,
                  name: text,
                })
              }
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
                  onPress={() =>
                    setForm({
                      ...form,
                      role,
                    })
                  }
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
              style={[
                styles.primaryBtn,
                creatingUser && {
                  opacity: 0.7,
                },
              ]}
              onPress={createUser}
              disabled={creatingUser}
            >
              <Text style={styles.primaryBtnText}>
                {creatingUser ? "Guardando..." : "Guardar usuario"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setModal(false)}
              style={{
                marginTop: 12,
              }}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =====================================================
          MODAL: DETALLE DEL REGISTRO
      ===================================================== */}

      <Modal
        visible={!!selected}
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: "#F1F8E9",
          }}
        >
          <ScrollView style={styles.detailContainer}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Detalle del Registro</Text>

              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            {selected && (
              <>
                {/* INFORMACIÓN GENERAL */}

                <View style={styles.infoCard}>
                  {[
                    ["Nombre del cliente", selected.form?.cliente],
                    ["Tipo de servicio", selected.form?.tipoServicio],
                    [
                      "Tipo de estación principal",
                      selected.form?.tipoEstacionPrincipal,
                    ],
                    ["Detalle de estación", selected.form?.detalleEstacion],
                    ["Área de trabajo", selected.form?.area],
                    [
                      "Cantidad de estaciones",
                      selected.form?.cantidadEstaciones ||
                        String(getStationsFromRecord(selected).length),
                    ],
                    [
                      "Observaciones generales",
                      selected.form?.observaciones || "Sin observaciones",
                    ],
                    ["Fecha del registro", selected.createdAt],
                    ["Trabajador", getWorkerLabel(selected)],
                  ].map(([label, value]) => (
                    <View style={styles.infoRow} key={String(label)}>
                      <Text style={styles.infoLabel}>{label}</Text>

                      <Text style={styles.infoValue}>
                        {value === undefined ||
                        value === null ||
                        String(value).trim() === ""
                          ? "No registrado"
                          : String(value)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* INCIDENCIAS */}

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
                        style={{
                          marginRight: 8,
                        }}
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
                          <Text
                            style={{
                              fontWeight: "800",
                              color: "#333",
                            }}
                          >
                            Foto rechazada:
                          </Text>

                          <Text
                            style={{
                              color: "#555",
                              marginTop: 4,
                            }}
                          >
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

                          <Text
                            style={{
                              color: "#555",
                              marginTop: 4,
                            }}
                          >
                            {incident.observacion?.trim()
                              ? incident.observacion
                              : "Sin comentario adicional"}
                          </Text>

                          <View
                            style={{
                              marginTop: 10,
                            }}
                          >
                            <Text
                              style={{
                                color: "#777",
                              }}
                            >
                              Estado incidencia:{" "}
                              {incident.estado || "pendiente"}
                            </Text>

                            <Text
                              style={{
                                color: "#777",
                              }}
                            >
                              Fecha: {incident.createdAt || "Sin fecha"}
                            </Text>
                          </View>

                          {Array.isArray(incident.imagenes) &&
                            incident.imagenes.length > 0 && (
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={{
                                  marginTop: 12,
                                }}
                              >
                                {incident.imagenes.map(
                                  (image: any, index: number) => {
                                    const imageUrl = getIncidentImageUrl(image);

                                    if (!imageUrl) {
                                      return null;
                                    }

                                    return (
                                      <Image
                                        key={`${incident.id}-${index}`}
                                        source={{
                                          uri: imageUrl,
                                        }}
                                        style={{
                                          width: 120,
                                          height: 120,
                                          borderRadius: 10,
                                          marginRight: 10,
                                          backgroundColor: "#eee",
                                        }}
                                      />
                                    );
                                  },
                                )}
                              </ScrollView>
                            )}
                        </View>
                      ))
                    ) : (
                      <Text
                        style={{
                          color: "#555",
                        }}
                      >
                        Este registro está rechazado, pero no se pudo leer el
                        detalle de la incidencia asociada.
                      </Text>
                    )}
                  </View>
                )}

                {/* GPS DE ESTACIONES */}

                {selected?.boxes &&
                  Object.keys(selected.boxes).map((key) => {
                    const box = selected.boxes[key];

                    const gps = box?.estadoEncontrado?.gps;

                    const latitude = getFiniteNumber(gps?.latitude);

                    const longitude = getFiniteNumber(gps?.longitude);

                    if (latitude === null || longitude === null) {
                      return null;
                    }

                    return (
                      <View key={key} style={styles.gpsCard}>
                        <Text style={styles.gpsTitle}>Ubicación GPS</Text>

                        <Text>Lat: {latitude}</Text>

                        <Text>Lon: {longitude}</Text>

                        <TouchableOpacity
                          style={styles.mapButton}
                          onPress={() => openGoogleMaps(latitude, longitude)}
                        >
                          <Ionicons name="map-outline" size={18} color="#fff" />

                          <Text style={styles.mapButtonText}>
                            Abrir en Google Maps
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                {/* FOTOGRAFÍAS */}

                {getStationsFromRecord(selected).map(
                  (station: any, stationIndex: number) => (
                    <View
                      key={String(station.id || stationIndex)}
                      style={styles.stationCard}
                    >
                      <Text style={styles.stationTitle}>
                        Estación {station.numero || stationIndex + 1}
                        {" - "}
                        {station.ubicacion || ""}
                      </Text>

                      {["estadoEncontrado", "estadoFinal", "formatoFisico"].map(
                        (type) => {
                          const photo = station[type];

                          const photoUrl = getPhotoUrl(photo);

                          const latitude = getFiniteNumber(
                            photo?.gps?.latitude,
                          );

                          const longitude = getFiniteNumber(
                            photo?.gps?.longitude,
                          );

                          const hasGps =
                            latitude !== null && longitude !== null;

                          return (
                            <View key={type} style={styles.photoSection}>
                              <Text style={styles.photoLabel}>
                                {type === "estadoEncontrado"
                                  ? "Estado Encontrado"
                                  : type === "estadoFinal"
                                    ? "Estado Final"
                                    : "Formato Físico"}
                              </Text>

                              {photoUrl ? (
                                <Image
                                  source={{
                                    uri: photoUrl,
                                  }}
                                  style={styles.photo}
                                />
                              ) : (
                                <View
                                  style={[
                                    styles.photo,
                                    {
                                      alignItems: "center",
                                      justifyContent: "center",
                                      backgroundColor: "#EEEEEE",
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name="image-outline"
                                    size={32}
                                    color="#999"
                                  />

                                  <Text
                                    style={{
                                      color: "#777",
                                      marginTop: 6,
                                    }}
                                  >
                                    Sin fotografía
                                  </Text>
                                </View>
                              )}

                              <Text
                                style={{
                                  color: "#666",
                                  marginTop: 8,
                                }}
                              >
                                Fecha y hora: {photo?.createdAt || "Sin fecha"}
                              </Text>

                              <Text
                                style={{
                                  color: "#666",
                                  marginTop: 4,
                                }}
                              >
                                GPS:{" "}
                                {hasGps
                                  ? `${formatCoordinate(
                                      latitude,
                                    )}, ${formatCoordinate(longitude)}`
                                  : "No disponible"}
                              </Text>

                              {hasGps && (
                                <TouchableOpacity
                                  style={[
                                    styles.mapButton,
                                    {
                                      marginTop: 8,
                                    },
                                  ]}
                                  onPress={() =>
                                    openGoogleMaps(latitude, longitude)
                                  }
                                >
                                  <Ionicons
                                    name="map-outline"
                                    size={18}
                                    color="#fff"
                                  />

                                  <Text style={styles.mapButtonText}>
                                    Abrir ubicación de esta foto
                                  </Text>
                                </TouchableOpacity>
                              )}
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
