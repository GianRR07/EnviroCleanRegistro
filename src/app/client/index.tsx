import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type GPSData = {
  latitude: number;
  longitude: number;
};

type PhotoData = {
  uri: string;
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
};

type IncidentRecord = {
  id: number;
  recordId: number | string;
  cliente?: string;
  createdAt: string;
  status: "registrada";
  observation: string;
  selectedItems: IncidentItem[];
};

type ViewMode = "home" | "evidencias" | "incidencia";

const INCIDENTS_STORAGE_KEY = "enviroclean_client_incidents_v1";

const PHOTO_LABELS: Record<PhotoKey, string> = {
  estadoEncontrado: "Foto del estado en el que se encontró la estación",
  estadoFinal: "Foto del estado en el que se dejó la estación",
  formatoFisico: "Foto de formato físico llenado por el operario",
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

  const [selectedNonConformities, setSelectedNonConformities] = useState<
    Record<string, IncidentItem>
  >({});

  const [incidentObservation, setIncidentObservation] = useState("");

  useFocusEffect(
    useCallback(() => {
      loadRecords();
    }, []),
  );

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

  const isServiceRecord = (item: any): item is ServiceRecord => {
    return (
      item &&
      typeof item === "object" &&
      item.id !== undefined &&
      item.form &&
      (item.stations || item.boxes) &&
      item.createdAt
    );
  };

  const parsePossibleJson = (value: any) => {
    if (typeof value !== "string") return value;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  const normalizeCloudRecord = (item: any): ServiceRecord | null => {
    try {
      const possiblePayload =
        item?.record || item?.payload || item?.data || item?.json || item;

      const parsed = parsePossibleJson(possiblePayload);

      if (!parsed || typeof parsed !== "object") return null;

      const normalized = {
        ...parsed,
        id: parsed.id ?? item?.$id ?? Date.now(),
        appwriteId: item?.$id,
      };

      return isServiceRecord(normalized) ? normalized : null;
    } catch {
      return null;
    }
  };

  const getLocalRecords = async (): Promise<ServiceRecord[]> => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const values = await AsyncStorage.multiGet(keys);

      const foundRecords: ServiceRecord[] = [];

      values.forEach(([, value]) => {
        if (!value) return;

        try {
          const parsed = JSON.parse(value);

          if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
              if (isServiceRecord(item)) foundRecords.push(item);
            });
            return;
          }

          if (Array.isArray(parsed?.records)) {
            parsed.records.forEach((item: any) => {
              if (isServiceRecord(item)) foundRecords.push(item);
            });
            return;
          }

          if (isServiceRecord(parsed)) {
            foundRecords.push(parsed);
          }
        } catch {
          // Ignora claves de AsyncStorage que no sean JSON de registros.
        }
      });

      return foundRecords;
    } catch (error) {
      console.log("Error leyendo registros locales:", error);
      return [];
    }
  };

  const getCloudRecords = async (): Promise<ServiceRecord[]> => {
    try {
      const appwriteModule: any = await import("@/utils/appwriteRecords");

      const cloudFunction =
        appwriteModule.getRecordsAppwrite ||
        appwriteModule.listRecordsAppwrite ||
        appwriteModule.getAllRecordsAppwrite;

      if (!cloudFunction) return [];

      const response = await cloudFunction();

      const rawRecords = Array.isArray(response)
        ? response
        : Array.isArray(response?.documents)
          ? response.documents
          : [];

      return rawRecords
        .map((item: any) => normalizeCloudRecord(item))
        .filter(Boolean) as ServiceRecord[];
    } catch (error) {
      console.log("No se pudieron cargar registros desde Appwrite:", error);
      return [];
    }
  };

  const removeDuplicatedRecords = (items: ServiceRecord[]) => {
    const map = new Map<string, ServiceRecord>();

    items.forEach((item) => {
      const key = String(item.id ?? item.appwriteId);
      if (!map.has(key)) map.set(key, item);
    });

    return Array.from(map.values()).sort((a, b) => {
      const dateA = Number(a.id) || 0;
      const dateB = Number(b.id) || 0;
      return dateB - dateA;
    });
  };

  const loadRecords = async () => {
    setLoading(true);

    try {
      const [localRecords, cloudRecords] = await Promise.all([
        getLocalRecords(),
        getCloudRecords(),
      ]);

      const allRecords = removeDuplicatedRecords([
        ...cloudRecords,
        ...localRecords,
      ]);

      setRecords(allRecords);

      if (!selectedIncidentRecordId && allRecords.length > 0) {
        setSelectedIncidentRecordId(String(allRecords[0].id));
      }
    } catch (error) {
      console.log("Error cargando registros:", error);
      Alert.alert("Error", "No se pudieron cargar los registros.");
    } finally {
      setLoading(false);
    }
  };

  const normalizeStations = (record: ServiceRecord): NormalizedStation[] => {
    if (Array.isArray(record.stations)) {
      return record.stations.map((station, index) => ({
        id: station.id ?? `${record.id}-station-${index + 1}`,
        numero: station.numero || String(index + 1),
        ubicacion: station.ubicacion || station.name || record.form?.area || "",
        estadoEncontrado: station.estadoEncontrado || null,
        estadoFinal: station.estadoFinal || null,
        formatoFisico: station.formatoFisico || station.fichaFirmada || null,
      }));
    }

    if (record.boxes && typeof record.boxes === "object") {
      return Object.entries(record.boxes).map(([key, station], index) => ({
        id: station.id ?? key,
        numero: station.numero || String(index + 1),
        ubicacion: station.ubicacion || station.name || record.form?.area || "",
        estadoEncontrado: station.estadoEncontrado || null,
        estadoFinal: station.estadoFinal || null,
        formatoFisico: station.formatoFisico || station.fichaFirmada || null,
      }));
    }

    return [];
  };

  const selectedIncidentRecord = useMemo(() => {
    return (
      records.find((item) => String(item.id) === selectedIncidentRecordId) ||
      null
    );
  }, [records, selectedIncidentRecordId]);

  const selectedCount = Object.keys(selectedNonConformities).length;

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
        recordId: record.id,
        stationId: station.id,
        stationNumber: station.numero,
        stationLocation: station.ubicacion,
        photoKey,
        photoLabel: PHOTO_LABELS[photoKey],
        photoUri: photo?.uri,
      };

      return copy;
    });
  };

  const saveIncident = async () => {
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
      const incident: IncidentRecord = {
        id: Date.now(),
        recordId: selectedIncidentRecord.id,
        cliente: selectedIncidentRecord.form?.cliente,
        createdAt: getPeruDate(),
        status: "registrada",
        observation: incidentObservation.trim(),
        selectedItems,
      };

      const previous = await AsyncStorage.getItem(INCIDENTS_STORAGE_KEY);
      const incidents = previous ? JSON.parse(previous) : [];

      await AsyncStorage.setItem(
        INCIDENTS_STORAGE_KEY,
        JSON.stringify([incident, ...incidents]),
      );

      try {
        const appwriteModule: any = await import("@/utils/appwriteRecords");

        const saveIncidentCloud =
          appwriteModule.saveIncidentAppwrite ||
          appwriteModule.createIncidentAppwrite;

        if (saveIncidentCloud) {
          await saveIncidentCloud(incident);
        }
      } catch (error) {
        console.log("Incidencia guardada localmente. Appwrite no disponible.");
      }

      setSelectedNonConformities({});
      setIncidentObservation("");

      Alert.alert("Correcto", "Incidencia registrada correctamente.");
    } catch (error) {
      console.log("Error registrando incidencia:", error);
      Alert.alert("Error", "No se pudo registrar la incidencia.");
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
                Revisa fotos, fecha, ubicación y datos del servicio.
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
                />
              ))}
        </View>
      </View>
    );
  };

  const renderIncidentMode = () => {
    const stations = selectedIncidentRecord
      ? normalizeStations(selectedIncidentRecord)
      : [];

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
            Selecciona un registro y marca las evidencias que deseas reportar
            como No conforme.
          </Text>

          {records.length === 0 ? (
            renderRecordsEmpty()
          ) : (
            <>
              <Text style={styles.fieldLabel}>Seleccionar registro</Text>

              <View style={styles.recordSelectorList}>
                {records.map((record) => {
                  const selected =
                    String(record.id) === selectedIncidentRecordId;

                  return (
                    <TouchableOpacity
                      key={String(record.id)}
                      style={[
                        styles.recordSelectorItem,
                        selected && styles.recordSelectorItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedIncidentRecordId(String(record.id));
                        clearIncidentSelection();
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.recordSelectorTitle,
                            selected && styles.recordSelectorTitleSelected,
                          ]}
                        >
                          {record.form?.cliente || "Cliente sin nombre"}
                        </Text>
                        <Text
                          style={[
                            styles.recordSelectorSubtitle,
                            selected && styles.recordSelectorSubtitleSelected,
                          ]}
                        >
                          {record.createdAt || "Sin fecha"} •{" "}
                          {record.form?.area || "Sin área"}
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
              </View>

              {selectedIncidentRecord && (
                <>
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

                  {stations.map((station) => (
                    <View key={String(station.id)} style={styles.stationCard}>
                      <View style={styles.stationHeader}>
                        <View style={styles.stationBadge}>
                          <Text style={styles.stationBadgeText}>
                            Estación {station.numero}
                          </Text>
                        </View>
                        <Text style={styles.stationLocation}>
                          {station.ubicacion || "Sin ubicación"}
                        </Text>
                      </View>

                      <IncidentPhotoItem
                        label={PHOTO_LABELS.estadoEncontrado}
                        data={station.estadoEncontrado}
                        selected={
                          !!selectedNonConformities[
                            getIncidentKey(
                              selectedIncidentRecord.id,
                              station.id,
                              "estadoEncontrado",
                            )
                          ]
                        }
                        onPreview={() =>
                          station.estadoEncontrado &&
                          setPreviewPhoto(station.estadoEncontrado)
                        }
                        onToggle={() =>
                          toggleNonConformity(
                            selectedIncidentRecord,
                            station,
                            "estadoEncontrado",
                            station.estadoEncontrado,
                          )
                        }
                      />

                      <IncidentPhotoItem
                        label={PHOTO_LABELS.estadoFinal}
                        data={station.estadoFinal}
                        selected={
                          !!selectedNonConformities[
                            getIncidentKey(
                              selectedIncidentRecord.id,
                              station.id,
                              "estadoFinal",
                            )
                          ]
                        }
                        onPreview={() =>
                          station.estadoFinal &&
                          setPreviewPhoto(station.estadoFinal)
                        }
                        onToggle={() =>
                          toggleNonConformity(
                            selectedIncidentRecord,
                            station,
                            "estadoFinal",
                            station.estadoFinal,
                          )
                        }
                      />

                      <IncidentPhotoItem
                        label={PHOTO_LABELS.formatoFisico}
                        data={station.formatoFisico}
                        selected={
                          !!selectedNonConformities[
                            getIncidentKey(
                              selectedIncidentRecord.id,
                              station.id,
                              "formatoFisico",
                            )
                          ]
                        }
                        onPreview={() =>
                          station.formatoFisico &&
                          setPreviewPhoto(station.formatoFisico)
                        }
                        onToggle={() =>
                          toggleNonConformity(
                            selectedIncidentRecord,
                            station,
                            "formatoFisico",
                            station.formatoFisico,
                          )
                        }
                      />
                    </View>
                  ))}

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
                      selectedCount === 0 && { opacity: 0.6 },
                    ]}
                    onPress={saveIncident}
                    disabled={selectedCount === 0}
                  >
                    <Ionicons
                      name="save-outline"
                      size={20}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.saveIncidentText}>
                      Registrar incidencia
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
          onPress={() => router.replace("/login")}
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

      <Modal visible={!!previewPhoto} animationType="fade" transparent>
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

            {previewPhoto?.gps ? (
              <Text style={styles.previewGps}>
                📍 {previewPhoto.gps.latitude.toFixed(5)},{" "}
                {previewPhoto.gps.longitude.toFixed(5)}
              </Text>
            ) : (
              <Text style={styles.previewGps}>📍 GPS no disponible</Text>
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
}: {
  record: ServiceRecord;
  stations: NormalizedStation[];
  expanded: boolean;
  onToggle: () => void;
  onPreview: (photo: PhotoData | null) => void;
}) => {
  return (
    <View style={styles.recordCard}>
      <TouchableOpacity style={styles.recordHeader} onPress={onToggle}>
        <View style={{ flex: 1 }}>
          <Text style={styles.recordTitle}>
            {record.form?.cliente || "Cliente sin nombre"}
          </Text>
          <Text style={styles.recordSubtitle}>
            {record.createdAt || "Sin fecha"} •{" "}
            {record.form?.area || "Sin área"}
          </Text>
          <Text style={styles.recordService}>
            {record.form?.tipoServicio || "Servicio no especificado"}
          </Text>
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={22}
          color="#1B5E20"
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.recordDetails}>
          <InfoRow
            label="Tipo de estación"
            value={record.form?.tipoEstacionPrincipal}
          />
          <InfoRow label="Detalle" value={record.form?.detalleEstacion} />
          <InfoRow label="Observaciones" value={record.form?.observaciones} />

          {stations.map((station) => (
            <View key={String(station.id)} style={styles.stationCard}>
              <View style={styles.stationHeader}>
                <View style={styles.stationBadge}>
                  <Text style={styles.stationBadgeText}>
                    Estación {station.numero}
                  </Text>
                </View>
                <Text style={styles.stationLocation}>
                  {station.ubicacion || "Sin ubicación"}
                </Text>
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

              <EvidencePhotoItem
                label={PHOTO_LABELS.formatoFisico}
                data={station.formatoFisico}
                onPreview={() => onPreview(station.formatoFisico)}
              />
            </View>
          ))}
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
  if (!value) return null;

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
};

/* ==================== ESTILOS ==================== */

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
    marginRight: 8,
  },

  logoutText: {
    color: "#c62828",
    fontWeight: "600",
  },

  container: {
    paddingHorizontal: 20,
    paddingBottom: 50,
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
    fontSize: 18,
    fontWeight: "800",
    color: "#1B5E20",
    marginBottom: 10,
  },

  cardDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 16,
  },

  mainActionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  mainActionIconBlue: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E3F2FD",
    justifyContent: "center",
    alignItems: "center",
  },

  mainActionIconOrange: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFF3E0",
    justifyContent: "center",
    alignItems: "center",
  },

  actionContent: {
    flex: 1,
  },

  mainActionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#333",
    marginBottom: 3,
  },

  mainActionSubtitle: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },

  topActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 10,
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C8E6C9",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },

  backButtonText: {
    color: "#1B5E20",
    fontWeight: "700",
  },

  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2E7D32",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },

  refreshButtonText: {
    color: "#fff",
    fontWeight: "700",
  },

  emptyCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#555",
    marginTop: 10,
    marginBottom: 6,
  },

  emptyText: {
    fontSize: 14,
    color: "#777",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 14,
  },

  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 6,
  },

  secondaryButtonText: {
    color: "#2E7D32",
    fontWeight: "700",
  },

  recordCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginBottom: 12,
    overflow: "hidden",
  },

  recordHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },

  recordTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1B5E20",
    marginBottom: 4,
  },

  recordSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 3,
  },

  recordService: {
    fontSize: 13,
    color: "#333",
    fontWeight: "600",
  },

  recordDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },

  infoRow: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },

  infoLabel: {
    fontSize: 12,
    color: "#777",
    fontWeight: "700",
    marginBottom: 3,
  },

  infoValue: {
    fontSize: 14,
    color: "#333",
  },

  stationCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },

  stationHeader: {
    marginBottom: 12,
  },

  stationBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#1B5E20",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 8,
  },

  stationBadgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },

  stationLocation: {
    fontSize: 14,
    color: "#555",
    fontWeight: "600",
  },

  photoItem: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  photoItemNoConforme: {
    borderColor: "#ef9a9a",
    backgroundColor: "#fffafa",
  },

  photoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10,
  },

  photoLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },

  photoBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },

  photoBadgeText: {
    color: "#2E7D32",
    fontSize: 12,
    fontWeight: "700",
  },

  photoBadgeGray: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F1F1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },

  photoBadgeGrayText: {
    color: "#777",
    fontSize: 12,
    fontWeight: "700",
  },

  noConformeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#c62828",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },

  noConformeBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },

  photoThumbnail: {
    width: "100%",
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#eee",
  },

  photoDate: {
    color: "#666",
    fontSize: 13,
  },

  noPhotoBox: {
    height: 110,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },

  noPhotoText: {
    color: "#888",
    fontSize: 13,
    marginTop: 6,
  },

  recordSelectorList: {
    gap: 10,
    marginBottom: 16,
  },

  fieldLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#333",
    marginBottom: 10,
  },

  recordSelectorItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  recordSelectorItemSelected: {
    backgroundColor: "#2E7D32",
    borderColor: "#2E7D32",
  },

  recordSelectorTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#333",
    marginBottom: 3,
  },

  recordSelectorTitleSelected: {
    color: "#fff",
  },

  recordSelectorSubtitle: {
    fontSize: 12,
    color: "#666",
  },

  recordSelectorSubtitleSelected: {
    color: "#E8F5E9",
  },

  incidentSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    gap: 8,
  },

  incidentSummaryText: {
    color: "#E65100",
    fontWeight: "800",
  },

  noConformeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ffcdd2",
    borderRadius: 12,
    paddingVertical: 11,
    gap: 7,
  },

  noConformeButtonOn: {
    backgroundColor: "#c62828",
    borderColor: "#c62828",
  },

  noConformeButtonText: {
    color: "#c62828",
    fontWeight: "800",
  },

  noConformeButtonTextOn: {
    color: "#fff",
  },

  inputGroupLarge: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  inputIcon: {
    marginRight: 10,
  },

  textAreaHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },

  textAreaLabel: {
    color: "#333",
    fontSize: 15,
    fontWeight: "700",
  },

  textArea: {
    minHeight: 120,
    fontSize: 16,
    color: "#222",
    textAlignVertical: "top",
    paddingBottom: 12,
  },

  saveIncidentBtn: {
    backgroundColor: "#c62828",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 16,
    marginTop: 8,
  },

  saveIncidentText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },

  previewModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  previewClose: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
  },

  previewImage: {
    width: "100%",
    height: "70%",
  },

  previewInfo: {
    marginTop: 20,
    alignItems: "center",
  },

  previewDate: {
    color: "#fff",
    fontSize: 15,
    marginBottom: 6,
  },

  previewGps: {
    color: "#ccc",
    fontSize: 14,
  },
});
