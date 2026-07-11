import { useAndroidBackHandler } from "@/hooks/use-android-back-handler";
import { workerHistoryStyles as styles } from "@/styles";
import { getRecordsAppwrite } from "@/utils/appwriteRecords";
import {
  getPendingRecordCount,
  mergeRemoteAndLocalRecords,
  syncPendingRecords,
} from "@/utils/offlineRecords";
import {
  clearCurrentUserSession,
  getCurrentUserSession,
} from "@/utils/session";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const APPWRITE_ENDPOINT = "https://nyc.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6a46e8b90028a108e50f";
const APPWRITE_BUCKET_ID = "photos";

const AUTO_SYNC_INTERVAL_MS = 30_000;

const PHOTO_LABELS: Record<string, string> = {
  estadoEncontrado: "Estado encontrado",
  estadoFinal: "Estado final",
  formatoFisico: "Formato físico",
};

type SyncOptions = {
  showSyncIndicator?: boolean;
  showLoadingIndicator?: boolean;
};

const parseJson = (value: any, fallback: any) => {
  if (!value) return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const formatCoordinate = (value: unknown) => {
  const coordinate = Number(value);

  return Number.isFinite(coordinate) ? coordinate.toFixed(6) : "No disponible";
};

export default function WorkerHistory() {
  const router = useRouter();

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /*
   * Este ref bloquea sincronizaciones simultáneas sin provocar
   * renderizados ni recrear la función synchronize.
   */
  const syncInProgressRef = useRef(false);

  const getPhotoUrl = (photoData: any) => {
    if (!photoData) return null;

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

    const fileId =
      photoData?.appwriteId ||
      photoData?.fileId ||
      photoData?.$id ||
      photoData?.id;

    if (fileId) {
      return `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}/view?project=${APPWRITE_PROJECT_ID}`;
    }

    if (
      photoData?.uri?.startsWith("http") ||
      photoData?.uri?.startsWith("file://") ||
      photoData?.uri?.startsWith("content://")
    ) {
      return photoData.uri;
    }

    return null;
  };

  const getStations = (record: any) => {
    const stations = parseJson(record?.stations, []);

    if (Array.isArray(stations) && stations.length > 0) {
      return stations;
    }

    const boxes = parseJson(record?.boxes, {});

    return Object.entries(boxes || {})
      .filter(([key]) => !String(key).startsWith("__enviroclean"))
      .map(([, station]) => station);
  };

  const loadRecords = useCallback(async (showLoadingIndicator = true) => {
    if (showLoadingIndicator) {
      setLoading(true);
    }

    try {
      let remote: any[] = [];

      try {
        remote = await getRecordsAppwrite();
      } catch (error) {
        console.log("Historial trabajando con datos locales:", error);
      }

      const merged = await mergeRemoteAndLocalRecords(remote);
      const session = await getCurrentUserSession();
      const workerId = session?.appwriteId || session?.id || "";

      const ownRecords = merged.filter((record: any) => {
        const recordWorkerId =
          record?.trabajadorId ||
          record?.worker?.id ||
          record?.worker?.appwriteId ||
          "";

        return !workerId || String(recordWorkerId) === String(workerId);
      });

      setRecords(ownRecords);
      setPendingCount(await getPendingRecordCount());
    } catch (error) {
      console.error("No se pudo cargar el historial del trabajador:", error);
    } finally {
      if (showLoadingIndicator) {
        setLoading(false);
      }
    }
  }, []);

  const synchronize = useCallback(
    async ({
      showSyncIndicator = false,
      showLoadingIndicator = false,
    }: SyncOptions = {}) => {
      /*
       * Evita que el intervalo, el ingreso a la pantalla y el botón
       * manual ejecuten sincronizaciones al mismo tiempo.
       */
      if (syncInProgressRef.current) {
        return;
      }

      syncInProgressRef.current = true;

      if (showSyncIndicator) {
        setSyncing(true);
      }

      try {
        try {
          await syncPendingRecords();
        } catch (error) {
          console.log(
            "No se pudieron sincronizar los registros pendientes. Se conservarán localmente:",
            error,
          );
        }

        /*
         * synchronize ya carga los registros.
         * No se debe llamar loadRecords por separado al entrar.
         */
        await loadRecords(showLoadingIndicator);
      } finally {
        syncInProgressRef.current = false;

        if (showSyncIndicator) {
          setSyncing(false);
        }
      }
    },
    [loadRecords],
  );

  useFocusEffect(
    useCallback(() => {
      /*
       * Al entrar se realiza una sola operación:
       * sincronizar pendientes y luego cargar el historial.
       */
      void synchronize({
        showLoadingIndicator: true,
      });

      /*
       * Actualización automática silenciosa cada 30 segundos.
       * No muestra "Cargando" ni el spinner de sincronización.
       */
      const intervalId = setInterval(() => {
        void synchronize({
          showSyncIndicator: false,
          showLoadingIndicator: false,
        });
      }, AUTO_SYNC_INTERVAL_MS);

      return () => {
        clearInterval(intervalId);
      };
    }, [synchronize]),
  );

  useAndroidBackHandler(() => {
    router.replace("/worker");
    return true;
  });

  const logout = async () => {
    await clearCurrentUserSession();
    router.replace("/login");
  };

  const openGoogleMaps = (gps: any) => {
    const latitude = Number(gps?.latitude);
    const longitude = Number(gps?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace("/worker")}
          style={{ padding: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color="#1B5E20" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Historial</Text>

          <Text style={styles.subtitle}>
            Registros sincronizados y guardados sin conexión
          </Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={22} color="#c62828" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() =>
          void synchronize({
            showSyncIndicator: true,
            showLoadingIndicator: false,
          })
        }
        disabled={syncing}
        style={{
          marginHorizontal: 16,
          marginBottom: 10,
          borderRadius: 12,
          paddingVertical: 11,
          paddingHorizontal: 14,
          backgroundColor: pendingCount > 0 ? "#FFF3E0" : "#E8F5E9",
          borderWidth: 1,
          borderColor: pendingCount > 0 ? "#FFCC80" : "#A5D6A7",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: syncing ? 0.7 : 1,
        }}
      >
        {syncing ? (
          <ActivityIndicator color="#2E7D32" />
        ) : (
          <Ionicons
            name={
              pendingCount > 0
                ? "cloud-upload-outline"
                : "checkmark-circle-outline"
            }
            size={20}
            color={pendingCount > 0 ? "#EF6C00" : "#2E7D32"}
          />
        )}

        <Text
          style={{
            fontWeight: "800",
            color: pendingCount > 0 ? "#E65100" : "#2E7D32",
          }}
        >
          {syncing
            ? "Sincronizando..."
            : pendingCount > 0
              ? `${pendingCount} registro(s) pendiente(s) · Sincronizar`
              : "Todos los registros están sincronizados"}
        </Text>
      </TouchableOpacity>

      {loading && <Text style={styles.loading}>Cargando registros...</Text>}

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {records.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No hay registros disponibles</Text>
          </View>
        ) : (
          records.map((record: any, index: number) => {
            const recordId = String(
              record.appwriteId || record.$id || record.id || index,
            );

            const expanded = expandedId === recordId;
            const stations = getStations(record);

            const quantity =
              record?.form?.cantidadEstaciones || String(stations.length || 0);

            return (
              <View key={recordId} style={styles.card}>
                <TouchableOpacity
                  onPress={() => setExpandedId(expanded ? null : recordId)}
                  activeOpacity={0.8}
                >
                  <View style={styles.rowHeader}>
                    <Text style={[styles.client, { flex: 1 }]}>
                      {record.form?.cliente || "Sin cliente"}
                    </Text>

                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {record.syncStatus === "pending"
                          ? "SIN INTERNET"
                          : record.status || "pendiente"}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.line}>
                    Servicio: {record.form?.tipoServicio || "No registrado"}
                  </Text>

                  <Text style={styles.line}>
                    Área: {record.form?.area || "No registrada"}
                  </Text>

                  <Text style={styles.date}>
                    Fecha del registro:{" "}
                    {record.createdAt || record.$createdAt || "Sin fecha"}
                  </Text>

                  <View
                    style={{
                      alignItems: "flex-end",
                      marginTop: 6,
                    }}
                  >
                    <Ionicons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={22}
                      color="#1B5E20"
                    />
                  </View>
                </TouchableOpacity>

                {expanded && (
                  <View style={{ marginTop: 12 }}>
                    <Info
                      label="Nombre del cliente"
                      value={record.form?.cliente}
                    />

                    <Info
                      label="Tipo de servicio"
                      value={record.form?.tipoServicio}
                    />

                    <Info
                      label="Tipo de estación principal"
                      value={record.form?.tipoEstacionPrincipal}
                    />

                    <Info
                      label="Detalle de estación"
                      value={record.form?.detalleEstacion}
                    />

                    <Info label="Área de trabajo" value={record.form?.area} />

                    <Info label="Cantidad de estaciones" value={quantity} />

                    <Info
                      label="Observaciones generales"
                      value={record.form?.observaciones || "Sin observaciones"}
                    />

                    {stations.length === 0 ? (
                      <Text style={styles.emptyText}>
                        Sin estaciones registradas.
                      </Text>
                    ) : (
                      stations.map((station: any, stationIndex: number) => (
                        <View
                          key={String(station.id || stationIndex)}
                          style={styles.stationCard}
                        >
                          <Text style={styles.stationTitle}>
                            Estación {station.numero || stationIndex + 1}
                          </Text>

                          <Text style={styles.line}>
                            Ubicación:{" "}
                            {station.ubicacion ||
                              record.form?.area ||
                              "Sin ubicación"}
                          </Text>

                          {[
                            "estadoEncontrado",
                            "estadoFinal",
                            "formatoFisico",
                          ].map((type) => {
                            const photo = station?.[type];

                            const url = getPhotoUrl(photo);

                            const hasGps =
                              Number.isFinite(Number(photo?.gps?.latitude)) &&
                              Number.isFinite(Number(photo?.gps?.longitude));

                            return (
                              <View key={type} style={styles.photoBox}>
                                <Text style={styles.photoLabel}>
                                  {PHOTO_LABELS[type]}
                                </Text>

                                {url ? (
                                  <Image
                                    source={{
                                      uri: url,
                                    }}
                                    style={styles.photo}
                                  />
                                ) : (
                                  <View
                                    style={{
                                      height: 100,
                                      borderRadius: 10,
                                      backgroundColor: "#EEEEEE",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    <Ionicons
                                      name="image-outline"
                                      size={28}
                                      color="#999"
                                    />

                                    <Text
                                      style={{
                                        color: "#777",
                                        marginTop: 5,
                                      }}
                                    >
                                      Sin fotografía
                                    </Text>
                                  </View>
                                )}

                                <Text style={styles.date}>
                                  Fecha y hora:{" "}
                                  {photo?.createdAt || "Sin fecha"}
                                </Text>

                                <Text style={styles.date}>
                                  GPS:{" "}
                                  {hasGps
                                    ? `${formatCoordinate(
                                        photo.gps.latitude,
                                      )}, ${formatCoordinate(
                                        photo.gps.longitude,
                                      )}`
                                    : "No disponible"}
                                </Text>

                                {hasGps && (
                                  <TouchableOpacity
                                    onPress={() => openGoogleMaps(photo.gps)}
                                    style={{
                                      marginTop: 7,
                                      alignSelf: "flex-start",
                                      flexDirection: "row",
                                      alignItems: "center",
                                      gap: 6,
                                      paddingHorizontal: 10,
                                      paddingVertical: 7,
                                      borderRadius: 10,
                                      backgroundColor: "#1565C0",
                                    }}
                                  >
                                    <Ionicons
                                      name="map-outline"
                                      size={16}
                                      color="#fff"
                                    />

                                    <Text
                                      style={{
                                        color: "#fff",
                                        fontWeight: "700",
                                      }}
                                    >
                                      Ver ubicación
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (
    <View
      style={{
        backgroundColor: "#FAFAFA",
        borderWidth: 1,
        borderColor: "#E5E5E5",
        borderRadius: 10,
        padding: 10,
        marginBottom: 7,
      }}
    >
      <Text
        style={{
          color: "#777",
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>

      <Text
        style={{
          color: "#333",
          marginTop: 3,
        }}
      >
        {value === undefined || value === null || String(value).trim() === ""
          ? "No registrado"
          : String(value)}
      </Text>
    </View>
  );
}
