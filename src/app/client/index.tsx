import {
  getRecordsAppwrite,
  resolveServiceRecordStatus,
  saveIncidentAppwrite,
  updateRecordStatusAppwrite,
} from "@/utils/appwriteRecords";
import { translateAppwriteError } from "@/utils/errorMessages";
import { Ionicons } from "@expo/vector-icons";
import { useAndroidBackHandler } from "@/hooks/use-android-back-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
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
import { SafeAreaView } from "react-native-safe-area-context";

// Importar estilos centralizados
import { clientStyles as styles } from "@/styles";
import { clearCurrentUserSession } from "@/utils/session";

type GPSData = {
  latitude: number;
  longitude: number;
};

type PhotoData = {
  uri?: string;
  appwriteId?: string;
  fileId?: string;
  id?: string;
  $id?: string;
  gps?: GPSData | null;
  createdAt?: string;
};

type PhotoKey = "estadoEncontrado" | "estadoFinal" | "formatoFisico";

type FormDataRecord = {
  cliente?: string;
  tipoServicio?: string;
  tipoEstacionPrincipal?: string;
  detalleEstacion?: string;
  area?: string;
  observaciones?: string;
  cantidadEstaciones?: string;
};

type StationData = {
  id?: number | string;
  numero?: string;
  ubicacion?: string;
  name?: string;
  estadoEncontrado?: PhotoData | null;
  estadoFinal?: PhotoData | null;
  formatoFisico?: PhotoData | null;
  fichaFirmada?: PhotoData | null;
};

type ServiceRecord = {
  id: number | string;
  appwriteId?: string;
  form?: FormDataRecord;
  boxes?: Record<string, StationData>;
  stations?: StationData[];
  status?: string;
  createdAt?: string;
  trabajadorId?: string;
  trabajadorUsuario?: string;
  trabajadorNombre?: string;
  worker?: {
    id?: string;
    username?: string;
    name?: string;
  };
};

type NormalizedStation = {
  id: number | string;
  numero: string;
  ubicacion: string;
  estadoEncontrado: PhotoData | null;
  estadoFinal: PhotoData | null;
  formatoFisico: PhotoData | null;
};

type IncidentItem = {
  recordId: number | string;
  stationId: number | string;
  stationNumber: string;
  stationLocation: string;
  photoKey: PhotoKey;
  photoLabel: string;
  photoUri?: string;
  photoAppwriteId?: string;
};

/**
 * Representa una incidencia registrada por el cliente sobre un registro de servicio.
 *
 * - `id`: identificador local utilizado solo en la interfaz.
 * - `recordId`: identificador del registro de servicio asociado.
 * - `cliente`: nombre del cliente.
 * - `createdAt`: fecha y hora en que se creó la incidencia.
 * - `estado`: estado de la incidencia (pendiente, atendida, cerrada, etc.).
 * - `observacion`: texto libre con los comentarios del cliente.
 * - `tipoIncidencia`: descripción de las evidencias seleccionadas, concatenadas.
 * - `imagenes`: lista de URIs o identificadores de las fotos asociadas.
 */
type IncidentRecord = {
  id: number;
  recordId: number | string;
  cliente?: string;
  createdAt: string;
  estado: string;
  observacion: string;
  tipoIncidencia: string;
  imagenes: string[];
};

type ViewMode = "home" | "evidencias" | "incidencia";

type ClientPermissions = {
  verTrabajador: boolean;
  verGPS: boolean;
  verFicha: boolean;
  verDatos: boolean;
};

const DEFAULT_CLIENT_PERMISSIONS: ClientPermissions = {
  verTrabajador: true,
  verGPS: true,
  verFicha: true,
  verDatos: true,
};


const PHOTO_LABELS: Record<PhotoKey, string> = {
  estadoEncontrado: "Foto del estado en el que se encontró la estación",
  estadoFinal: "Foto del estado en el que se dejó la estación",
  formatoFisico: "Foto de formato físico llenado por el operario",
};

const SHORT_PHOTO_LABELS: Record<PhotoKey, string> = {
  estadoEncontrado: "Encontrado",
  estadoFinal: "Final",
  formatoFisico: "Formato",
};

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

const getPhotoUrl = (photoData: any) => {
  if (!photoData) return undefined;

  if (typeof photoData === "string") {
    return photoData.startsWith("http") ? photoData : undefined;
  }

  if (photoData.uri && photoData.uri.startsWith("http")) {
    return photoData.uri;
  }

  const fileId =
    photoData.appwriteId || photoData.fileId || photoData.$id || photoData.id;

  if (fileId) {
    return `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}/view?project=${APPWRITE_PROJECT_ID}`;
  }

  return undefined;
};

const normalizePhoto = (photo: any): PhotoData | null => {
  if (!photo) return null;

  return {
    ...photo,
    uri: getPhotoUrl(photo),
    gps: photo.gps ?? null,
    createdAt: photo.createdAt ?? "",
  };
};

const openPhotoMap = (gps?: GPSData | null) => {
  if (!gps) return;
  void Linking.openURL(
    `https://www.google.com/maps/search/?api=1&query=${gps.latitude},${gps.longitude}`,
  );
};

const normalizeStations = (record: ServiceRecord): NormalizedStation[] => {
  if (Array.isArray(record.stations) && record.stations.length > 0) {
    return record.stations.map((station, index) => ({
      id: station.id ?? `${record.id}-station-${index + 1}`,
      numero: station.numero || String(index + 1),
      ubicacion: station.ubicacion || station.name || record.form?.area || "",
      estadoEncontrado: normalizePhoto(station.estadoEncontrado),
      estadoFinal: normalizePhoto(station.estadoFinal),
      formatoFisico: normalizePhoto(
        station.formatoFisico || station.fichaFirmada,
      ),
    }));
  }

  if (record.boxes && typeof record.boxes === "object") {
    return Object.entries(record.boxes)
      .filter(([key]) => !String(key).startsWith("__enviroclean"))
      .map(([key, station], index) => ({
        id: station.id ?? key,
        numero: station.numero || String(index + 1),
        ubicacion: station.ubicacion || station.name || record.form?.area || "",
        estadoEncontrado: normalizePhoto(station.estadoEncontrado),
        estadoFinal: normalizePhoto(station.estadoFinal),
        formatoFisico: normalizePhoto(
          station.formatoFisico || station.fichaFirmada,
        ),
      }));
  }

  return [];
};

export default function Client() {
  const router = useRouter();

  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoData | null>(null);

  const [selectedIncidentRecordId, setSelectedIncidentRecordId] = useState<
    string | null
  >(null);
  const [selectedIncidentStationId, setSelectedIncidentStationId] = useState<
    string | null
  >(null);

  const [selectedNonConformities, setSelectedNonConformities] = useState<
    Record<string, IncidentItem>
  >({});

  const [incidentObservation, setIncidentObservation] = useState("");
  const [savingIncident, setSavingIncident] = useState(false);
  const clientPermissions: ClientPermissions = DEFAULT_CLIENT_PERMISSIONS;

  const getPeruDate = () => {
    return new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
  };


  const loadRecords = useCallback(async () => {
    setLoading(true);

    try {
      const appwriteRecords = await getRecordsAppwrite();

      const normalizedRecords: ServiceRecord[] = (appwriteRecords || []).map(
        (record: any) => {
          const boxes = parseJsonField(record.boxes, {});
          const stations = parseJsonField(record.stations, []);

          const serviceRecord: ServiceRecord = {
            ...record,
            id: record.id ?? record.appwriteId ?? record.$id,
            appwriteId: record.appwriteId ?? record.$id,
            form: record.form ?? {
              cliente: record.cliente ?? "",
              tipoServicio: record.tipoServicio ?? "",
              tipoEstacionPrincipal: record.tipoEstacionPrincipal ?? "",
              detalleEstacion: record.detalleEstacion ?? "",
              area: record.area ?? "",
              observaciones: record.observaciones ?? "",
              cantidadEstaciones: record.cantidadEstaciones ?? "",
            },
            boxes,
            stations:
              Array.isArray(stations) && stations.length > 0
                ? stations
                : Object.values(boxes || {}),
            status: record.status ?? "pendiente",
            createdAt: record.createdAt ?? record.$createdAt ?? "",
            trabajadorId: record.trabajadorId ?? record.worker?.id ?? "",
            trabajadorUsuario:
              record.trabajadorUsuario ?? record.worker?.username ?? "",
            trabajadorNombre:
              record.trabajadorNombre ?? record.worker?.name ?? "",
            worker: record.worker ?? {
              id: record.trabajadorId ?? "",
              username: record.trabajadorUsuario ?? "",
              name: record.trabajadorNombre ?? "",
            },
          };
          serviceRecord.status = resolveServiceRecordStatus(serviceRecord);
          return serviceRecord;
        },
      );

      setRecords(normalizedRecords);

      setSelectedIncidentRecordId((current) =>
        current ??
        (normalizedRecords.length > 0 ? String(normalizedRecords[0].id) : null),
      );
    } catch (error) {
      console.log("Error cargando registros desde Appwrite:", error);
      Alert.alert(
        "Error",
        "No se pudieron cargar los registros desde Appwrite.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRecords();
    }, [loadRecords]),
  );

  const getWorkerLabel = (record: ServiceRecord) => {
    return (
      record.trabajadorNombre ||
      record.worker?.name ||
      record.trabajadorUsuario ||
      record.worker?.username ||
      "No registrado"
    );
  };

  const selectedIncidentRecord = useMemo(() => {
    return (
      records.find((item) => String(item.id) === selectedIncidentRecordId) ||
      null
    );
  }, [records, selectedIncidentRecordId]);

  const incidentStations = useMemo(
    () => (selectedIncidentRecord ? normalizeStations(selectedIncidentRecord) : []),
    [selectedIncidentRecord],
  );

  const activeIncidentStationId = useMemo(() => {
    const selectedStillExists = incidentStations.some(
      (station) => String(station.id) === selectedIncidentStationId,
    );

    if (selectedStillExists) return selectedIncidentStationId;
    return incidentStations[0] ? String(incidentStations[0].id) : null;
  }, [incidentStations, selectedIncidentStationId]);

  const selectedIncidentStation = useMemo(
    () =>
      incidentStations.find(
        (station) => String(station.id) === activeIncidentStationId,
      ) || null,
    [activeIncidentStationId, incidentStations],
  );

  const selectedCount = Object.keys(selectedNonConformities).length;

  useAndroidBackHandler(() => {
    if (previewPhoto) {
      setPreviewPhoto(null);
      return true;
    }

    if (viewMode !== "home") {
      setViewMode("home");
      return true;
    }

    BackHandler.exitApp();
    return true;
  });

  const openGoogleMaps = (gps?: GPSData | null) => {
    if (!gps) return;
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${gps.latitude},${gps.longitude}`,
    );
  };

  const getIncidentKey = (
    recordId: number | string,
    stationId: number | string,
    photoKey: PhotoKey,
  ) => {
    return `${recordId}-${stationId}-${photoKey}`;
  };

  const toggleNonConformity = (
    record: ServiceRecord,
    station: NormalizedStation,
    photoKey: PhotoKey,
    photo: PhotoData | null,
  ) => {
    const key = getIncidentKey(record.id, station.id, photoKey);

    setSelectedNonConformities((prev) => {
      const copy = { ...prev };

      if (copy[key]) {
        delete copy[key];
        return copy;
      }

      copy[key] = {
        recordId: record.appwriteId || record.id,
        stationId: station.id,
        stationNumber: station.numero,
        stationLocation: station.ubicacion,
        photoKey,
        photoLabel: PHOTO_LABELS[photoKey],
        photoUri: photo?.uri,
        photoAppwriteId:
          photo?.appwriteId || photo?.fileId || photo?.$id || photo?.id,
      };

      return copy;
    });
  };

  const saveIncident = async () => {
    if (savingIncident) return;

    if (!selectedIncidentRecord) {
      Alert.alert("Falta seleccionar", "Selecciona un registro.");
      return;
    }

    const selectedItems = Object.values(selectedNonConformities);

    if (selectedItems.length === 0) {
      Alert.alert(
        "Sin evidencias marcadas",
        "Marca al menos una evidencia como No conforme.",
      );
      return;
    }

    try {
      setSavingIncident(true);
      // Construir los campos para la incidencia según el nuevo esquema
      const incidenciaDetalle = selectedItems
        .map((item) => `E${item.stationNumber}:${SHORT_PHOTO_LABELS[item.photoKey]}`)
        .join("; ");
      const tipoIncidencia =
        incidenciaDetalle.length <= 50
          ? incidenciaDetalle
          : `${selectedItems.length} fotos rechazadas`;
      const imagenes = selectedItems
        .map((item) => item.photoAppwriteId || item.photoUri || "")
        .filter((uri) => uri && uri.length > 0);

      const incident: IncidentRecord = {
        id: Date.now(),
        recordId:
          selectedIncidentRecord.appwriteId || selectedIncidentRecord.id,
        cliente: selectedIncidentRecord.form?.cliente,
        createdAt: getPeruDate(),
        estado: "pendiente",
        observacion: incidentObservation.trim(),
        tipoIncidencia,
        imagenes,
      };

      await saveIncidentAppwrite(incident);

      // Actualizar el estado del registro a "rechazado" tanto en Appwrite como en el estado local
      try {
        const recordId = selectedIncidentRecord.appwriteId || selectedIncidentRecord.id;
        if (recordId) {
          await updateRecordStatusAppwrite(String(recordId), "rechazado");
        }
        setRecords((prev) =>
          prev.map((r) =>
            String(r.id) === String(selectedIncidentRecord.id)
              ? { ...r, status: "rechazado" }
              : r,
          ),
        );
      } catch (error) {
        console.log("Error actualizando estado a rechazado:", error);
      }

      setSelectedNonConformities({});
      setIncidentObservation("");

      Alert.alert("Correcto", "Incidencia registrada correctamente.");
    } catch (error: any) {
      console.log("Error registrando incidencia en Appwrite:", error);
      Alert.alert(
        "Error",
        translateAppwriteError(
          error,
          "No se pudo registrar la incidencia en Appwrite.",
        ),
      );
    } finally {
      setSavingIncident(false);
    }
  };

  const clearIncidentSelection = () => {
    setSelectedNonConformities({});
    setIncidentObservation("");
  };

  const renderHome = () => {
    return (
      <View>
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeIcon}>
            <Ionicons name="leaf" size={32} color="#2E7D32" />
          </View>
          <Text style={styles.welcomeTitle}>¡Bienvenido!</Text>
          <Text style={styles.welcomeText}>
            Revisa las evidencias registradas por el equipo operativo y reporta
            incidencias cuando una estación no esté conforme.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Opciones del cliente</Text>

          <TouchableOpacity
            style={styles.mainActionButton}
            onPress={() => setViewMode("evidencias")}
          >
            <View style={styles.mainActionIconBlue}>
              <Ionicons name="images-outline" size={24} color="#1565C0" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.mainActionTitle}>Ver evidencias</Text>
              <Text style={styles.mainActionSubtitle}>
                Revisa las evidencias y datos registrados por el equipo operativo.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mainActionButton}
            onPress={() => setViewMode("incidencia")}
          >
            <View style={styles.mainActionIconOrange}>
              <Ionicons name="alert-circle-outline" size={24} color="#FB8C00" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.mainActionTitle}>Registrar incidencia</Text>
              <Text style={styles.mainActionSubtitle}>
                Marca una o varias evidencias como No conforme.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderRecordsEmpty = () => {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="folder-open-outline" size={36} color="#999" />
        <Text style={styles.emptyTitle}>Sin registros disponibles</Text>
        <Text style={styles.emptyText}>
          Todavía no hay evidencias registradas por los empleados.
        </Text>

        <TouchableOpacity style={styles.secondaryButton} onPress={loadRecords}>
          <Ionicons name="refresh-outline" size={18} color="#2E7D32" />
          <Text style={styles.secondaryButtonText}>Actualizar</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderEvidenceMode = () => {
    return (
      <View>
        <View style={styles.topActionRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setViewMode("home")}
          >
            <Ionicons name="arrow-back" size={18} color="#1B5E20" />
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.refreshButton} onPress={loadRecords}>
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={styles.refreshButtonText}>
              {loading ? "Cargando..." : "Actualizar"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Evidencias registradas</Text>
          <Text style={styles.cardDescription}>
            Selecciona un registro para revisar sus estaciones y fotografías.
          </Text>

          {records.length === 0
            ? renderRecordsEmpty()
            : records.map((record) => (
                <RecordEvidenceCard
                  key={String(record.id)}
                  record={record}
                  stations={normalizeStations(record)}
                  expanded={expandedRecordId === String(record.id)}
                  onToggle={() =>
                    setExpandedRecordId((prev) =>
                      prev === String(record.id) ? null : String(record.id),
                    )
                  }
                  onPreview={setPreviewPhoto}
                  permissions={clientPermissions}
                  getWorkerLabel={getWorkerLabel}
                />
              ))}
        </View>
      </View>
    );
  };

  const renderIncidentMode = () => {
    return (
      <View>
        <View style={styles.topActionRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setViewMode("home")}
          >
            <Ionicons name="arrow-back" size={18} color="#1B5E20" />
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.refreshButton} onPress={loadRecords}>
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={styles.refreshButtonText}>
              {loading ? "Cargando..." : "Actualizar"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Registrar incidencia</Text>
          <Text style={styles.cardDescription}>
            Elige un registro y una estación. Las evidencias de esa estación se
            mostrarán inmediatamente debajo para que no tengas que desplazarte por
            toda la lista.
          </Text>

          {records.length === 0 ? (
            renderRecordsEmpty()
          ) : (
            <>
              <Text style={styles.fieldLabel}>1. Seleccionar registro</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 16 }}
                contentContainerStyle={{ gap: 10, paddingRight: 8 }}
              >
                {records.map((record) => {
                  const selected =
                    String(record.id) === selectedIncidentRecordId;

                  return (
                    <TouchableOpacity
                      key={String(record.id)}
                      style={[
                        styles.recordSelectorItem,
                        { width: 235 },
                        selected && styles.recordSelectorItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedIncidentRecordId(String(record.id));
                        setSelectedIncidentStationId(null);
                        clearIncidentSelection();
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.recordSelectorTitle,
                            selected && styles.recordSelectorTitleSelected,
                          ]}
                        >
                          {clientPermissions.verDatos
                            ? record.form?.cliente || "Cliente sin nombre"
                            : "Registro de servicio"}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.recordSelectorSubtitle,
                            selected && styles.recordSelectorSubtitleSelected,
                          ]}
                        >
                          {clientPermissions.verDatos
                            ? `${record.createdAt || "Sin fecha"} · ${
                                record.form?.area || "Sin área"
                              }`
                            : "Información limitada"}
                        </Text>
                      </View>

                      {selected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color="#fff"
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {selectedIncidentRecord && (
                <>
                  <View style={{ marginBottom: 14 }}>
                    <InfoRow
                      label="Cliente"
                      value={selectedIncidentRecord.form?.cliente}
                    />
                    <InfoRow
                      label="Servicio"
                      value={selectedIncidentRecord.form?.tipoServicio}
                    />
                    <InfoRow
                      label="Tipo de estación principal"
                      value={selectedIncidentRecord.form?.tipoEstacionPrincipal}
                    />
                    <InfoRow
                      label="Detalle de estación"
                      value={selectedIncidentRecord.form?.detalleEstacion}
                    />
                    <InfoRow
                      label="Área"
                      value={selectedIncidentRecord.form?.area}
                    />
                    <InfoRow
                      label="Cantidad de estaciones"
                      value={
                        selectedIncidentRecord.form?.cantidadEstaciones ||
                        String(incidentStations.length)
                      }
                    />
                  </View>

                  <Text style={styles.fieldLabel}>2. Seleccionar estación</Text>

                  {incidentStations.length === 0 ? (
                    <View style={styles.noPhotoBox}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={24}
                        color="#999"
                      />
                      <Text style={styles.noPhotoText}>
                        Este registro no contiene estaciones.
                      </Text>
                    </View>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginBottom: 14 }}
                      contentContainerStyle={{ gap: 8, paddingRight: 8 }}
                    >
                      {incidentStations.map((station) => {
                        const selected =
                          String(station.id) === activeIncidentStationId;
                        return (
                          <TouchableOpacity
                            key={String(station.id)}
                            onPress={() =>
                              setSelectedIncidentStationId(String(station.id))
                            }
                            style={{
                              minWidth: 125,
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: selected ? "#1B5E20" : "#DADADA",
                              backgroundColor: selected ? "#1B5E20" : "#FAFAFA",
                            }}
                          >
                            <Text
                              style={{
                                color: selected ? "#fff" : "#333",
                                fontWeight: "800",
                              }}
                            >
                              Estación {station.numero}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={{
                                color: selected ? "#E8F5E9" : "#666",
                                fontSize: 12,
                                marginTop: 3,
                              }}
                            >
                              {station.ubicacion || "Sin ubicación"}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}

                  <View style={styles.incidentSummary}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={20}
                      color="#FB8C00"
                    />
                    <Text style={styles.incidentSummaryText}>
                      Evidencias marcadas: {selectedCount}
                    </Text>
                  </View>

                  {selectedIncidentStation && (
                    <View style={styles.stationCard}>
                      <View style={styles.stationHeader}>
                        <View style={styles.stationBadge}>
                          <Text style={styles.stationBadgeText}>
                            Estación {selectedIncidentStation.numero}
                          </Text>
                        </View>
                        <Text style={styles.stationLocation}>
                          {selectedIncidentStation.ubicacion || "Sin ubicación"}
                        </Text>
                      </View>

                      <IncidentPhotoItem
                        label={PHOTO_LABELS.estadoEncontrado}
                        data={selectedIncidentStation.estadoEncontrado}
                        selected={
                          !!selectedNonConformities[
                            getIncidentKey(
                              selectedIncidentRecord.id,
                              selectedIncidentStation.id,
                              "estadoEncontrado",
                            )
                          ]
                        }
                        onPreview={() =>
                          selectedIncidentStation.estadoEncontrado &&
                          setPreviewPhoto(selectedIncidentStation.estadoEncontrado)
                        }
                        onToggle={() =>
                          toggleNonConformity(
                            selectedIncidentRecord,
                            selectedIncidentStation,
                            "estadoEncontrado",
                            selectedIncidentStation.estadoEncontrado,
                          )
                        }
                      />

                      <IncidentPhotoItem
                        label={PHOTO_LABELS.estadoFinal}
                        data={selectedIncidentStation.estadoFinal}
                        selected={
                          !!selectedNonConformities[
                            getIncidentKey(
                              selectedIncidentRecord.id,
                              selectedIncidentStation.id,
                              "estadoFinal",
                            )
                          ]
                        }
                        onPreview={() =>
                          selectedIncidentStation.estadoFinal &&
                          setPreviewPhoto(selectedIncidentStation.estadoFinal)
                        }
                        onToggle={() =>
                          toggleNonConformity(
                            selectedIncidentRecord,
                            selectedIncidentStation,
                            "estadoFinal",
                            selectedIncidentStation.estadoFinal,
                          )
                        }
                      />

                      {clientPermissions.verFicha && (
                        <IncidentPhotoItem
                          label={PHOTO_LABELS.formatoFisico}
                          data={selectedIncidentStation.formatoFisico}
                          selected={
                            !!selectedNonConformities[
                              getIncidentKey(
                                selectedIncidentRecord.id,
                                selectedIncidentStation.id,
                                "formatoFisico",
                              )
                            ]
                          }
                          onPreview={() =>
                            selectedIncidentStation.formatoFisico &&
                            setPreviewPhoto(selectedIncidentStation.formatoFisico)
                          }
                          onToggle={() =>
                            toggleNonConformity(
                              selectedIncidentRecord,
                              selectedIncidentStation,
                              "formatoFisico",
                              selectedIncidentStation.formatoFisico,
                            )
                          }
                        />
                      )}
                    </View>
                  )}

                  <View style={styles.inputGroupLarge}>
                    <View style={styles.textAreaHeader}>
                      <Ionicons
                        name="document-text-outline"
                        size={20}
                        color="#2E7D32"
                        style={styles.inputIcon}
                      />
                      <Text style={styles.textAreaLabel}>
                        Observación de la incidencia
                      </Text>
                    </View>

                    <TextInput
                      placeholder="Describe brevemente la inconformidad. Este campo es opcional."
                      placeholderTextColor="#999"
                      style={styles.textArea}
                      multiline
                      value={incidentObservation}
                      onChangeText={setIncidentObservation}
                    />
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.saveIncidentBtn,
                      (selectedCount === 0 || savingIncident) && { opacity: 0.6 },
                    ]}
                    onPress={saveIncident}
                    disabled={selectedCount === 0 || savingIncident}
                  >
                    <Ionicons
                      name="save-outline"
                      size={20}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.saveIncidentText}>
                      {savingIncident ? "Registrando..." : "Registrar incidencia"}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Panel Cliente</Text>
          <Text style={styles.subtitle}>EnviroClean</Text>
        </View>

        <TouchableOpacity
          onPress={async () => { await clearCurrentUserSession(); router.replace("/login"); }}
          style={styles.logoutBtn}
        >
          <Ionicons name="log-out-outline" size={20} color="#c62828" />
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {viewMode === "home" && renderHome()}
        {viewMode === "evidencias" && renderEvidenceMode()}
        {viewMode === "incidencia" && renderIncidentMode()}
      </ScrollView>

      <Modal
        visible={!!previewPhoto}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <View style={styles.previewModal}>
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setPreviewPhoto(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {previewPhoto?.uri && (
            <Image
              source={{ uri: previewPhoto.uri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}

          <View style={styles.previewInfo}>
            <Text style={styles.previewDate}>
              📅 {previewPhoto?.createdAt || "Sin fecha"}
            </Text>

            {clientPermissions.verGPS ? (
              previewPhoto?.gps ? (
                <View style={{ alignItems: "center" }}>
                  <Text style={styles.previewGps}>
                    📍 {previewPhoto.gps.latitude.toFixed(5)},{" "}
                    {previewPhoto.gps.longitude.toFixed(5)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => openGoogleMaps(previewPhoto.gps)}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#1565C0",
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                      Abrir en Google Maps
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.previewGps}>📍 GPS no disponible</Text>
              )
            ) : (
              <Text style={styles.previewGps}>
                📍 GPS no disponible
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ==================== CARD DE EVIDENCIAS ==================== */

const RecordEvidenceCard = ({
  record,
  stations,
  expanded,
  onToggle,
  onPreview,
  permissions,
  getWorkerLabel,
}: {
  record: ServiceRecord;
  stations: NormalizedStation[];
  expanded: boolean;
  onToggle: () => void;
  onPreview: (photo: PhotoData | null) => void;
  permissions: ClientPermissions;
  getWorkerLabel: (record: ServiceRecord) => string;
}) => {
  return (
    <View style={styles.recordCard}>
      <TouchableOpacity style={styles.recordHeader} onPress={onToggle}>
        <View style={{ flex: 1 }}>
          <Text style={styles.recordTitle}>
            {permissions.verDatos
              ? record.form?.cliente || "Cliente sin nombre"
              : "Registro de servicio"}
          </Text>
          {permissions.verDatos ? (
            <>
              <Text style={styles.recordSubtitle}>
                {record.createdAt || "Sin fecha"} • {record.form?.area || "Sin área"}
              </Text>
              <Text style={styles.recordService}>
                {record.form?.tipoServicio || "Servicio no especificado"}
              </Text>
            </>
          ) : (
            <Text style={styles.recordSubtitle}>
              Información limitada por el administrador
            </Text>
          )}
          {permissions.verTrabajador && (
            <Text style={styles.recordService}>
              Trabajador: {getWorkerLabel(record)}
            </Text>
          )}
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={22}
          color="#1B5E20"
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.recordDetails}>
          {permissions.verDatos && (
            <>
              <InfoRow label="Nombre del cliente" value={record.form?.cliente} />
              <InfoRow label="Tipo de servicio" value={record.form?.tipoServicio} />
              <InfoRow
                label="Tipo de estación principal"
                value={record.form?.tipoEstacionPrincipal}
              />
              <InfoRow
                label="Detalle de estación"
                value={record.form?.detalleEstacion}
              />
              <InfoRow label="Área de trabajo" value={record.form?.area} />
              <InfoRow
                label="Cantidad de estaciones"
                value={record.form?.cantidadEstaciones || String(stations.length)}
              />
              <InfoRow
                label="Observaciones generales"
                value={record.form?.observaciones || "Sin observaciones"}
              />
              <InfoRow label="Fecha del registro" value={record.createdAt} />
            </>
          )}

          {stations.length === 0 ? (
            <View style={styles.noPhotoBox}>
              <Ionicons name="alert-circle-outline" size={24} color="#aaa" />
              <Text style={styles.noPhotoText}>
                Este registro no tiene estaciones disponibles.
              </Text>
            </View>
          ) : (
            stations.map((station) => (
              <View key={String(station.id)} style={styles.stationCard}>
                <View style={styles.stationHeader}>
                  <View style={styles.stationBadge}>
                    <Text style={styles.stationBadgeText}>
                      Estación {station.numero}
                    </Text>
                  </View>
                  {permissions.verDatos && (
                    <Text style={styles.stationLocation}>
                      {station.ubicacion || "Sin ubicación"}
                    </Text>
                  )}
                </View>

                <EvidencePhotoItem
                  label={PHOTO_LABELS.estadoEncontrado}
                  data={station.estadoEncontrado}
                  onPreview={() => onPreview(station.estadoEncontrado)}
                />

                <EvidencePhotoItem
                  label={PHOTO_LABELS.estadoFinal}
                  data={station.estadoFinal}
                  onPreview={() => onPreview(station.estadoFinal)}
                />

                {permissions.verFicha && (
                  <EvidencePhotoItem
                    label={PHOTO_LABELS.formatoFisico}
                    data={station.formatoFisico}
                    onPreview={() => onPreview(station.formatoFisico)}
                  />
                )}
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
};

/* ==================== FOTO PARA VER EVIDENCIAS ==================== */

const EvidencePhotoItem = ({
  label,
  data,
  onPreview,
}: {
  label: string;
  data: PhotoData | null;
  onPreview: () => void;
}) => {
  return (
    <View style={styles.photoItem}>
      <View style={styles.photoHeader}>
        <Text style={styles.photoLabel}>{label}</Text>

        {data?.uri ? (
          <View style={styles.photoBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#2E7D32" />
            <Text style={styles.photoBadgeText}>Disponible</Text>
          </View>
        ) : (
          <View style={styles.photoBadgeGray}>
            <Ionicons name="remove-circle-outline" size={16} color="#777" />
            <Text style={styles.photoBadgeGrayText}>Sin foto</Text>
          </View>
        )}
      </View>

      {data?.uri ? (
        <TouchableOpacity onPress={onPreview} activeOpacity={0.9}>
          <Image source={{ uri: data.uri }} style={styles.photoThumbnail} />
          <Text style={styles.photoDate}>
            📅 {data.createdAt || "Sin fecha"}
          </Text>
          <Text style={styles.photoDate}>
            📍 {data.gps
              ? `${data.gps.latitude.toFixed(6)}, ${data.gps.longitude.toFixed(6)}`
              : "GPS no disponible"}
          </Text>
          {data.gps && (
            <TouchableOpacity
              onPress={() => openPhotoMap(data.gps)}
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                backgroundColor: "#1565C0",
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 7,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons name="map-outline" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                Ver ubicación
              </Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.noPhotoBox}>
          <Ionicons name="image-outline" size={24} color="#aaa" />
          <Text style={styles.noPhotoText}>No se registró evidencia</Text>
        </View>
      )}
    </View>
  );
};

/* ==================== FOTO PARA INCIDENCIA ==================== */

const IncidentPhotoItem = ({
  label,
  data,
  selected,
  onPreview,
  onToggle,
}: {
  label: string;
  data: PhotoData | null;
  selected: boolean;
  onPreview: () => void;
  onToggle: () => void;
}) => {
  const hasPhoto = !!data?.uri;

  return (
    <View style={[styles.photoItem, selected && styles.photoItemNoConforme]}>
      <View style={styles.photoHeader}>
        <Text style={styles.photoLabel}>{label}</Text>

        {selected ? (
          <View style={styles.noConformeBadge}>
            <Ionicons name="alert-circle" size={16} color="#fff" />
            <Text style={styles.noConformeBadgeText}>No conforme</Text>
          </View>
        ) : hasPhoto ? (
          <View style={styles.photoBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#2E7D32" />
            <Text style={styles.photoBadgeText}>Disponible</Text>
          </View>
        ) : (
          <View style={styles.photoBadgeGray}>
            <Ionicons name="remove-circle-outline" size={16} color="#777" />
            <Text style={styles.photoBadgeGrayText}>Sin foto</Text>
          </View>
        )}
      </View>

      {hasPhoto ? (
        <TouchableOpacity onPress={onPreview} activeOpacity={0.9}>
          <Image source={{ uri: data.uri }} style={styles.photoThumbnail} />
        </TouchableOpacity>
      ) : (
        <View style={styles.noPhotoBox}>
          <Ionicons name="image-outline" size={24} color="#aaa" />
          <Text style={styles.noPhotoText}>No se registró evidencia</Text>
        </View>
      )}

      {data && (
        <View style={{ marginBottom: 10 }}>
          <Text style={styles.photoDate}>
            📅 {data.createdAt || "Sin fecha"}
          </Text>
          <Text style={styles.photoDate}>
            📍 {data.gps
              ? `${data.gps.latitude.toFixed(6)}, ${data.gps.longitude.toFixed(6)}`
              : "GPS no disponible"}
          </Text>
          {data.gps && (
            <TouchableOpacity
              onPress={() => openPhotoMap(data.gps)}
              style={{
                marginTop: 7,
                alignSelf: "flex-start",
                backgroundColor: "#1565C0",
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 7,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons name="map-outline" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                Ver ubicación
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.noConformeButton, selected && styles.noConformeButtonOn]}
        onPress={onToggle}
      >
        <Ionicons
          name={selected ? "close-circle-outline" : "alert-circle-outline"}
          size={18}
          color={selected ? "#fff" : "#c62828"}
        />
        <Text
          style={[
            styles.noConformeButtonText,
            selected && styles.noConformeButtonTextOn,
          ]}
        >
          {selected ? "Quitar No conforme" : "Marcar como No conforme"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

/* ==================== FILA INFO ==================== */

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) => {
  const displayValue =
    value === undefined || value === null || String(value).trim() === ""
      ? "No registrado"
      : String(value);

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{displayValue}</Text>
    </View>
  );
};

/* ==================== ESTILOS ==================== */

