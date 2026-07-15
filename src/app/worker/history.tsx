import { useAndroidBackHandler } from "@/hooks/use-android-back-handler";
import { workerHistoryStyles as styles } from "@/styles";
import { getRecordsAppwrite } from "@/utils/appwriteRecords";
import {
  getLocalRecords,
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
  AppState,
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
};

type EstadoVisualSincronizacion =
  | "pendiente"
  | "sincronizando"
  | "parcial"
  | "sincronizado"
  | "error";

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

const getVisualSyncStatus = (record: any): EstadoVisualSincronizacion => {
  const raw = String(
    record?.estadoSincronizacion || record?.syncStatus || "",
  ).toLowerCase();

  if (raw === "synced" || raw === "sincronizado" || raw === "sincronizada") {
    return "sincronizado";
  }

  if (
    raw === "syncing" ||
    raw === "uploading" ||
    raw === "sincronizando" ||
    raw === "subiendo"
  ) {
    return "sincronizando";
  }

  if (
    raw === "partial" ||
    raw === "parcial" ||
    raw === "sincronizacion_parcial"
  ) {
    return "parcial";
  }

  if (
    raw === "error" ||
    raw === "failed" ||
    raw === "fallido" ||
    raw === "fallida"
  ) {
    return "error";
  }

  /*
   * Los registros remotos que no contienen syncStatus ya están confirmados
   * en Appwrite. Los registros locales sin appwriteId siguen pendientes.
   */
  if (record?.appwriteId || record?.$id) {
    return "sincronizado";
  }

  return "pendiente";
};

const SYNC_STATUS_UI: Record<
  EstadoVisualSincronizacion,
  { label: string; background: string; border: string; text: string }
> = {
  pendiente: {
    label: "PENDIENTE DE SINCRONIZACIÓN",
    background: "#FFF3E0",
    border: "#FFCC80",
    text: "#E65100",
  },
  sincronizando: {
    label: "SINCRONIZANDO",
    background: "#E3F2FD",
    border: "#90CAF9",
    text: "#1565C0",
  },
  parcial: {
    label: "SINCRONIZACIÓN PARCIAL",
    background: "#FFF8E1",
    border: "#FFE082",
    text: "#F57F17",
  },
  sincronizado: {
    label: "SINCRONIZADO",
    background: "#E8F5E9",
    border: "#A5D6A7",
    text: "#2E7D32",
  },
  error: {
    label: "ERROR DE SINCRONIZACIÓN",
    background: "#FFEBEE",
    border: "#EF9A9A",
    text: "#C62828",
  },
};

const getPhotoSyncStatus = (photo: any): EstadoVisualSincronizacion => {
  if (!photo) return "pendiente";

  const raw = String(
    photo?.estadoSincronizacion || photo?.uploadStatus || "",
  ).toLowerCase();

  if (
    photo?.appwriteId ||
    photo?.fileId ||
    photo?.$id ||
    raw === "synced" ||
    raw === "sincronizada" ||
    raw === "sincronizado"
  ) {
    return "sincronizado";
  }

  if (
    raw === "syncing" ||
    raw === "uploading" ||
    raw === "subiendo" ||
    raw === "sincronizando"
  ) {
    return "sincronizando";
  }

  if (raw === "error" || raw === "failed" || raw === "fallida") {
    return "error";
  }

  return "pendiente";
};

const getPhotoProgress = (stations: any[]) => {
  const photos = stations.flatMap((station) => [
    station?.estadoEncontrado,
    station?.estadoFinal,
    station?.formatoFisico,
  ]);

  const existingPhotos = photos.filter(Boolean);
  const synchronizedPhotos = existingPhotos.filter(
    (photo) => getPhotoSyncStatus(photo) === "sincronizado",
  ).length;

  return {
    total: existingPhotos.length,
    synchronized: synchronizedPhotos,
  };
};

const sortNewestFirst = (items: any[]) =>
  [...items].sort((a, b) => {
    const first = new Date(a?.$createdAt || a?.createdAt || 0).getTime();
    const second = new Date(b?.$createdAt || b?.createdAt || 0).getTime();

    if (Number.isNaN(first) || Number.isNaN(second)) {
      return String(b?.createdAt || "").localeCompare(
        String(a?.createdAt || ""),
      );
    }

    return second - first;
  });

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

  const filterOwnRecords = useCallback(async (items: any[]) => {
    const session = await getCurrentUserSession();
    const workerId = session?.appwriteId || session?.id || "";

    return sortNewestFirst(
      items.filter((record: any) => {
        const recordWorkerId =
          record?.trabajadorId ||
          record?.worker?.id ||
          record?.worker?.appwriteId ||
          "";

        return !workerId || String(recordWorkerId) === String(workerId);
      }),
    );
  }, []);

  const loadLocalHistory = useCallback(
    async (showLoadingIndicator = true) => {
      if (showLoadingIndicator) {
        setLoading(true);
      }

      try {
        const local = await getLocalRecords();
        const ownRecords = await filterOwnRecords(local || []);

        /*
         * El historial local se muestra inmediatamente, sin esperar Appwrite.
         */
        setRecords(ownRecords);
        setPendingCount(await getPendingRecordCount());
      } catch (error) {
        console.error("No se pudo cargar el historial local:", error);
      } finally {
        if (showLoadingIndicator) {
          setLoading(false);
        }
      }
    },
    [filterOwnRecords],
  );

  const loadMergedHistory = useCallback(async () => {
    try {
      let remote: any[] = [];

      try {
        remote = await getRecordsAppwrite();
      } catch (error) {
        console.log(
          "No fue posible consultar Appwrite; se conservará el historial local:",
          error,
        );
      }

      const merged = await mergeRemoteAndLocalRecords(remote);
      const ownRecords = await filterOwnRecords(merged || []);

      setRecords(ownRecords);
      setPendingCount(await getPendingRecordCount());
    } catch (error) {
      console.error("No se pudo actualizar el historial combinado:", error);
    }
  }, [filterOwnRecords]);

  const synchronize = useCallback(
    async ({ showSyncIndicator = false }: SyncOptions = {}) => {
      if (syncInProgressRef.current) return;

      syncInProgressRef.current = true;

      if (showSyncIndicator) {
        setSyncing(true);
      }

      /*
       * Refleja el cambio visual sin ocultar los registros ya cargados.
       */
      setRecords((current) =>
        current.map((record) => {
          const state = getVisualSyncStatus(record);

          if (state !== "pendiente" && state !== "parcial") {
            return record;
          }

          return {
            ...record,
            estadoSincronizacion: "sincronizando",
          };
        }),
      );

      try {
        try {
          await syncPendingRecords();
        } catch (error) {
          console.log(
            "La sincronización no terminó. Los archivos continúan guardados localmente:",
            error,
          );
        }

        /*
         * Después del intento se relee la cola local y luego Appwrite.
         * Ninguna de estas operaciones bloquea la visualización inicial.
         */
        await loadLocalHistory(false);
        await loadMergedHistory();
      } finally {
        syncInProgressRef.current = false;

        if (showSyncIndicator) {
          setSyncing(false);
        }
      }
    },
    [loadLocalHistory, loadMergedHistory],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const openHistory = async () => {
        await loadLocalHistory(true);

        if (active) {
          void synchronize();
        }
      };

      void openHistory();

      const intervalId = setInterval(() => {
        void synchronize();
      }, AUTO_SYNC_INTERVAL_MS);

      const subscription = AppState.addEventListener("change", (nextState) => {
        if (nextState === "active") {
          void loadLocalHistory(false);
          void synchronize();
        }
      });

      return () => {
        active = false;
        clearInterval(intervalId);
        subscription.remove();
      };
    }, [loadLocalHistory, synchronize]),
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
            ? "Sincronizando registros y fotografías..."
            : pendingCount > 0
              ? `${pendingCount} registro(s) pendiente(s) · Sincronizar ahora`
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
            const syncState = getVisualSyncStatus(record);
            const syncUi = SYNC_STATUS_UI[syncState];
            const photoProgress = getPhotoProgress(stations);

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

                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: syncUi.background,
                          borderColor: syncUi.border,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color: syncUi.text,
                          },
                        ]}
                      >
                        {syncUi.label}
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

                  <Text style={styles.date}>
                    Estado del registro:{" "}
                    {String(record.status || "pendiente").toUpperCase()}
                  </Text>

                  {photoProgress.total > 0 && (
                    <Text style={styles.date}>
                      Fotografías sincronizadas: {photoProgress.synchronized} de{" "}
                      {photoProgress.total}
                    </Text>
                  )}

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

                                {photo && (
                                  <View
                                    style={{
                                      alignSelf: "flex-start",
                                      marginBottom: 8,
                                      borderRadius: 999,
                                      paddingHorizontal: 9,
                                      paddingVertical: 5,
                                      backgroundColor:
                                        SYNC_STATUS_UI[
                                          getPhotoSyncStatus(photo)
                                        ].background,
                                      borderWidth: 1,
                                      borderColor:
                                        SYNC_STATUS_UI[
                                          getPhotoSyncStatus(photo)
                                        ].border,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        fontWeight: "800",
                                        color:
                                          SYNC_STATUS_UI[
                                            getPhotoSyncStatus(photo)
                                          ].text,
                                      }}
                                    >
                                      FOTO{" "}
                                      {
                                        SYNC_STATUS_UI[
                                          getPhotoSyncStatus(photo)
                                        ].label
                                      }
                                    </Text>
                                  </View>
                                )}

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
