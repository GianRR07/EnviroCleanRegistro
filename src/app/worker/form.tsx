import { saveRecordAppwrite } from "@/utils/appwriteRecords";
import { uploadPhoto } from "@/utils/uploadPhoto";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
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
  appwriteId?: string;
  gps: GPSData | null;
  createdAt: string;
};

type PhotoType = "estadoEncontrado" | "estadoFinal" | "formatoFisico";

type TipoServicio =
  | ""
  | "Desratizacion"
  | "Control Aviar"
  | "Desinsectacion"
  | "Capturador de Insectos";
type TipoEstacionPrincipal = "" | "Jaula" | "Cebadero" | "Capturador";
type TipoCebadero = "" | "Trampa pegante" | "Bloque";

type FormData = {
  cliente: string;
  tipoServicio: TipoServicio;
  tipoEstacionPrincipal: TipoEstacionPrincipal;
  detalleEstacion: string;
  area: string;
  observaciones: string;
  cantidadEstaciones: string;
};

type StationData = {
  id: number;
  numero: string;
  ubicacion: string;
  estadoEncontrado: PhotoData | null;
  estadoFinal: PhotoData | null;
  formatoFisico: PhotoData | null;
};

type ActiveCameraData = {
  stationId: number;
  type: PhotoType;
} | null;

const DRAFT_STORAGE_KEY = "enviroclean_worker_draft_v2";
const RECORDS_STORAGE_KEY = "EnviroClean_records";
const PHOTO_DIRECTORY = `${FileSystem.documentDirectory}enviroclean-photos/`;

const DEFAULT_FORM: FormData = {
  cliente: "",
  tipoServicio: "",
  tipoEstacionPrincipal: "",
  detalleEstacion: "",
  area: "",
  observaciones: "",
  cantidadEstaciones: "1",
};

export default function Worker() {
  const router = useRouter();
  const cameraRef = useRef<any>(null);
  const draftLoadedRef = useRef(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [activeCamera, setActiveCamera] = useState<ActiveCameraData>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoData | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const [locationPermissionGranted, setLocationPermissionGranted] =
    useState(false);

  const [form, setForm] = useState<FormData>(DEFAULT_FORM);

  function createStation(index: number, area: string): StationData {
    return {
      id: Date.now() + index + Math.floor(Math.random() * 100000),
      numero: String(index),
      ubicacion: area,
      estadoEncontrado: null,
      estadoFinal: null,
      formatoFisico: null,
    };
  }

  const [stations, setStations] = useState<StationData[]>(() => [
    createStation(1, ""),
  ]);

  useEffect(() => {
    loadDraft();
    preparePermissions();
  }, []);

  useEffect(() => {
    if (!draftLoadedRef.current) return;

    const timer = setTimeout(async () => {
      try {
        const draft = {
          form,
          stations,
          updatedAt: getPeruDate(),
        };

        await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch (error) {
        console.log("Error guardando borrador:", error);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [form, stations]);

  const loadDraft = async () => {
    try {
      const savedDraft = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);

      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);

        if (parsed?.form) {
          setForm({
            ...DEFAULT_FORM,
            ...parsed.form,
          });
        }

        if (Array.isArray(parsed?.stations) && parsed.stations.length > 0) {
          setStations(parsed.stations);
        }
      }
    } catch (error) {
      console.log("Error cargando borrador:", error);
    } finally {
      draftLoadedRef.current = true;
    }
  };

  const preparePermissions = async () => {
    try {
      const camera = await requestCameraPermission();

      if (!camera.granted) {
        Alert.alert(
          "Permiso de cámara",
          "La app necesita permiso para usar la cámara.",
        );
      }

      const location = await Location.requestForegroundPermissionsAsync();
      setLocationPermissionGranted(location.status === "granted");
    } catch (error) {
      console.log("Error solicitando permisos:", error);
    }
  };

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

  const ensurePhotoDirectory = async () => {
    const directoryInfo = await FileSystem.getInfoAsync(PHOTO_DIRECTORY);

    if (!directoryInfo.exists) {
      await FileSystem.makeDirectoryAsync(PHOTO_DIRECTORY, {
        intermediates: true,
      });
    }
  };

  const savePhotoPermanently = async (temporaryUri: string) => {
    await ensurePhotoDirectory();

    const fileName = `foto_${Date.now()}_${Math.floor(
      Math.random() * 100000,
    )}.jpg`;

    const permanentUri = `${PHOTO_DIRECTORY}${fileName}`;

    await FileSystem.copyAsync({
      from: temporaryUri,
      to: permanentUri,
    });

    return permanentUri;
  };

  const getGPS = async (): Promise<GPSData | null> => {
    try {
      let hasLocationPermission = locationPermissionGranted;

      if (!hasLocationPermission) {
        const currentPermission =
          await Location.getForegroundPermissionsAsync();

        if (currentPermission.status !== "granted") {
          return null;
        }

        hasLocationPermission = true;
        setLocationPermissionGranted(true);
      }

      const lastLocation = await Location.getLastKnownPositionAsync({
        maxAge: 1000 * 60 * 5,
        requiredAccuracy: 100,
      });

      if (lastLocation) {
        return {
          latitude: lastLocation.coords.latitude,
          longitude: lastLocation.coords.longitude,
        };
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };
    } catch (error) {
      console.log("Error obteniendo GPS:", error);
      return null;
    }
  };

  const handleTipoServicioChange = (value: TipoServicio) => {
    setForm((prev) => ({
      ...prev,
      tipoServicio: value,
    }));
  };

  const handleTipoEstacionChange = (value: TipoEstacionPrincipal) => {
    let detalleEstacion = "";

    if (value === "Jaula") {
      detalleEstacion = "Organico";
    }

    if (value === "Cebadero") {
      detalleEstacion = "Trampa pegante";
    }

    if (value === "Capturador") {
      detalleEstacion = "Lamina Pegante";
    }

    setForm((prev) => ({
      ...prev,
      tipoEstacionPrincipal: value,
      detalleEstacion,
    }));
  };

  const handleDetalleCebaderoChange = (value: TipoCebadero) => {
    setForm((prev) => ({
      ...prev,
      detalleEstacion: value,
    }));
  };

  const handleAreaChange = (text: string) => {
    const previousArea = form.area;

    setForm((prev) => ({
      ...prev,
      area: text,
    }));

    setStations((prev) =>
      prev.map((station) => {
        const shouldCopyArea =
          station.ubicacion.trim() === "" || station.ubicacion === previousArea;

        return {
          ...station,
          ubicacion: shouldCopyArea ? text : station.ubicacion,
        };
      }),
    );
  };

  const handleQuantityChange = (text: string) => {
    const onlyNumbers = text.replace(/[^0-9]/g, "");
    const quantity = Number(onlyNumbers || 0);

    setForm((prev) => ({
      ...prev,
      cantidadEstaciones: onlyNumbers,
    }));

    setStations((prev) => {
      if (quantity <= 0) return [];

      if (quantity === prev.length) return prev;

      if (quantity > prev.length) {
        const newStations = [...prev];

        for (let index = prev.length + 1; index <= quantity; index++) {
          newStations.push(createStation(index, form.area));
        }

        return newStations;
      }

      return prev.slice(0, quantity);
    });
  };

  const updateStationField = (
    stationId: number,
    field: "numero" | "ubicacion",
    value: string,
  ) => {
    setStations((prev) =>
      prev.map((station) =>
        station.id === stationId
          ? {
              ...station,
              [field]: value,
            }
          : station,
      ),
    );
  };

  const openCamera = async (stationId: number, type: PhotoType) => {
    try {
      if (!cameraPermission?.granted) {
        const result = await requestCameraPermission();

        if (!result.granted) {
          Alert.alert(
            "Permiso requerido",
            "Debes permitir el uso de la cámara para tomar fotos.",
            [
              {
                text: "Cancelar",
                style: "cancel",
              },
              {
                text: "Abrir configuración",
                onPress: () => Linking.openSettings(),
              },
            ],
          );
          return;
        }
      }

      setIsCameraReady(false);
      setActiveCamera({ stationId, type });
    } catch (error) {
      console.log("Error abriendo cámara:", error);
      Alert.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !activeCamera || loadingPhoto || !isCameraReady) {
      return;
    }

    setLoadingPhoto(true);

    try {
      const { stationId, type } = activeCamera;

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        skipProcessing: true,
      });

      const permanentUri = await savePhotoPermanently(photo.uri);
      const uploaded = await uploadPhoto(permanentUri);

      const data: PhotoData = {
        uri: permanentUri,
        appwriteId: uploaded.$id,
        gps: null,
        createdAt: getPeruDate(),
      };

      setStations((prev) =>
        prev.map((station) =>
          station.id === stationId
            ? {
                ...station,
                [type]: data,
              }
            : station,
        ),
      );

      setActiveCamera(null);
      setIsCameraReady(false);
      setLoadingPhoto(false);

      getGPS().then((gps) => {
        if (!gps) return;

        setStations((prev) =>
          prev.map((station) => {
            if (station.id !== stationId) return station;

            const currentPhoto = station[type];

            if (!currentPhoto || currentPhoto.uri !== permanentUri) {
              return station;
            }

            return {
              ...station,
              [type]: {
                ...currentPhoto,
                gps,
              },
            };
          }),
        );
      });
    } catch (error) {
      console.log("Error al tomar foto:", error);
      Alert.alert("Error", "No se pudo tomar la foto.");
      setLoadingPhoto(false);
    }
  };

  const deletePhoto = async (stationId: number, type: PhotoType) => {
    const station = stations.find((item) => item.id === stationId);
    const photo = station?.[type];

    setStations((prev) =>
      prev.map((item) =>
        item.id === stationId
          ? {
              ...item,
              [type]: null,
            }
          : item,
      ),
    );

    try {
      if (photo?.uri) {
        const info = await FileSystem.getInfoAsync(photo.uri);

        if (info.exists) {
          await FileSystem.deleteAsync(photo.uri, {
            idempotent: true,
          });
        }
      }
    } catch (error) {
      console.log("No se pudo eliminar el archivo físico:", error);
    }
  };

  const clearDraft = async () => {
    Alert.alert(
      "Limpiar formulario",
      "¿Deseas borrar todos los datos y fotos guardadas en este borrador?",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Sí, borrar",
          style: "destructive",
          onPress: async () => {
            try {
              for (const station of stations) {
                const photos = [
                  station.estadoEncontrado,
                  station.estadoFinal,
                  station.formatoFisico,
                ];

                for (const photo of photos) {
                  if (photo?.uri) {
                    const info = await FileSystem.getInfoAsync(photo.uri);

                    if (info.exists) {
                      await FileSystem.deleteAsync(photo.uri, {
                        idempotent: true,
                      });
                    }
                  }
                }
              }

              await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);

              setForm(DEFAULT_FORM);
              setStations([createStation(1, "")]);

              Alert.alert("Listo", "Formulario limpiado correctamente.");
            } catch (error) {
              console.log("Error limpiando borrador:", error);
              Alert.alert("Error", "No se pudo limpiar el formulario.");
            }
          },
        },
      ],
    );
  };

  const saveRegister = async () => {
    try {
      const boxes = stations.reduce<Record<number, StationData>>(
        (accumulator, station, index) => {
          accumulator[index + 1] = station;
          return accumulator;
        },
        {},
      );

      const record = {
        id: Date.now(),
        form,
        boxes,
        stations,
        status: "pendiente",
        createdAt: getPeruDate(),
      };

      const existing = await AsyncStorage.getItem(RECORDS_STORAGE_KEY);

      const records = existing ? JSON.parse(existing) : [];

      records.push(record);

      await AsyncStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));

      console.log("✅ Registro creado:", record);

      console.log("➡️ Guardando local...");
      //await saveRecord(record);
      console.log("✅ Guardado local");

      console.log("➡️ Guardando en Appwrite...");
      await saveRecordAppwrite(record);
      console.log("✅ Guardado en Appwrite");

      Alert.alert("Correcto", "Registro guardado correctamente");
    } catch (error: any) {
      console.log("❌ ERROR GENERAL");
      console.log(error);
      console.log(error?.message);

      Alert.alert("Error", error?.message || "No se pudo guardar el registro.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Registro de Limpieza</Text>
          <Text style={styles.subtitle}>EnviroClean • Trabajador</Text>
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
        {/* DATOS GENERALES */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Datos generales</Text>

          <View style={styles.inputGroup}>
            <Ionicons
              name="business-outline"
              size={20}
              color="#2E7D32"
              style={styles.inputIcon}
            />
            <TextInput
              placeholder="Nombre del cliente"
              placeholderTextColor="#999"
              style={styles.input}
              value={form.cliente}
              onChangeText={(text) => setForm({ ...form, cliente: text })}
            />
          </View>

          <OptionSelector
            label="Tipo de servicio"
            icon="construct-outline"
            value={form.tipoServicio}
            options={[
              "Desratizacion",
              "Control Aviar",
              "Desinsectacion",
              "Capturador de Insectos",
            ]}
            placeholder="Selecciona una opción"
            onChange={(value) =>
              handleTipoServicioChange(value as TipoServicio)
            }
          />

          <OptionSelector
            label="Tipo de estación principal"
            icon="apps-outline"
            value={form.tipoEstacionPrincipal}
            options={["Jaula", "Cebadero", "Capturador"]}
            placeholder="Selecciona el tipo de estación"
            onChange={(value) =>
              handleTipoEstacionChange(value as TipoEstacionPrincipal)
            }
          />

          {form.tipoEstacionPrincipal === "Jaula" && (
            <View style={styles.readOnlyField}>
              <View style={styles.readOnlyHeader}>
                <Ionicons name="leaf-outline" size={20} color="#2E7D32" />
                <Text style={styles.readOnlyLabel}>Detalle de estación</Text>
              </View>
              <Text style={styles.readOnlyText}>Organico</Text>
            </View>
          )}

          {form.tipoEstacionPrincipal === "Cebadero" && (
            <OptionSelector
              label="Detalle de estación"
              icon="cube-outline"
              value={form.detalleEstacion}
              options={["Trampa pegante", "Bloque"]}
              placeholder="Selecciona una opción"
              onChange={(value) =>
                handleDetalleCebaderoChange(value as TipoCebadero)
              }
            />
          )}

          {form.tipoEstacionPrincipal === "Capturador" && (
            <View style={styles.readOnlyField}>
              <View style={styles.readOnlyHeader}>
                <Ionicons name="bug-outline" size={20} color="#2E7D32" />
                <Text style={styles.readOnlyLabel}>Detalle de estación</Text>
              </View>
              <Text style={styles.readOnlyText}>Lamina Pegante</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Ionicons
              name="location-outline"
              size={20}
              color="#2E7D32"
              style={styles.inputIcon}
            />
            <TextInput
              placeholder="Área de trabajo"
              placeholderTextColor="#999"
              style={styles.input}
              value={form.area}
              onChangeText={handleAreaChange}
            />
          </View>

          <View style={styles.inputGroupLarge}>
            <View style={styles.textAreaHeader}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color="#2E7D32"
                style={styles.inputIcon}
              />
              <Text style={styles.textAreaLabel}>Observaciones generales</Text>
            </View>

            <TextInput
              placeholder="Escribe observaciones generales si corresponde"
              placeholderTextColor="#999"
              style={styles.textArea}
              multiline
              value={form.observaciones}
              onChangeText={(text) => setForm({ ...form, observaciones: text })}
            />
          </View>

          <View style={styles.inputGroup}>
            <Ionicons
              name="calculator-outline"
              size={20}
              color="#2E7D32"
              style={styles.inputIcon}
            />
            <TextInput
              placeholder="Cantidad de estaciones de trabajo"
              placeholderTextColor="#999"
              style={styles.input}
              value={form.cantidadEstaciones}
              onChangeText={handleQuantityChange}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* ESTACIONES */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Estaciones de trabajo</Text>
            <View style={styles.counterBadge}>
              <Text style={styles.counterBadgeText}>{stations.length}</Text>
            </View>
          </View>

          {stations.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="alert-circle-outline" size={24} color="#999" />
              <Text style={styles.emptyText}>
                Ingresa la cantidad de estaciones de trabajo.
              </Text>
            </View>
          ) : (
            stations.map((station, index) => (
              <View key={station.id} style={styles.stationCard}>
                <View style={styles.stationTopBadge}>
                  <Text style={styles.stationTopBadgeText}>
                    Estación {index + 1}
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Ionicons
                    name="pricetag-outline"
                    size={20}
                    color="#2E7D32"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    placeholder="N°"
                    placeholderTextColor="#999"
                    style={styles.input}
                    value={station.numero}
                    onChangeText={(text) =>
                      updateStationField(station.id, "numero", text)
                    }
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Ionicons
                    name="navigate-outline"
                    size={20}
                    color="#2E7D32"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    placeholder="Ubicación de esta estación"
                    placeholderTextColor="#999"
                    style={styles.input}
                    value={station.ubicacion}
                    onChangeText={(text) =>
                      updateStationField(station.id, "ubicacion", text)
                    }
                  />
                </View>

                <PhotoItem
                  label="Foto del estado en el que se encontró la estación de trabajo"
                  data={station.estadoEncontrado}
                  onTake={() => openCamera(station.id, "estadoEncontrado")}
                  onView={() => setPreviewPhoto(station.estadoEncontrado)}
                  onDelete={() => deletePhoto(station.id, "estadoEncontrado")}
                />

                <PhotoItem
                  label="Foto del estado en el que se dejó la estación de trabajo"
                  data={station.estadoFinal}
                  onTake={() => openCamera(station.id, "estadoFinal")}
                  onView={() => setPreviewPhoto(station.estadoFinal)}
                  onDelete={() => deletePhoto(station.id, "estadoFinal")}
                />

                <PhotoItem
                  label="Foto de formato físico llenado por el operario"
                  data={station.formatoFisico}
                  onTake={() => openCamera(station.id, "formatoFisico")}
                  onView={() => setPreviewPhoto(station.formatoFisico)}
                  onDelete={() => deletePhoto(station.id, "formatoFisico")}
                />
              </View>
            ))
          )}
        </View>

        {/* BOTONES */}
        <TouchableOpacity style={styles.saveBtn} onPress={saveRegister}>
          <Ionicons
            name="save-outline"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.saveBtnText}>Guardar registro completo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.clearBtn} onPress={clearDraft}>
          <Ionicons
            name="trash-outline"
            size={20}
            color="#c62828"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.clearBtnText}>Limpiar formulario</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* MODAL CÁMARA */}
      <Modal visible={!!activeCamera} animationType="slide">
        <View style={{ flex: 1, backgroundColor: "black" }}>
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="back"
            mode="picture"
            onCameraReady={() => setIsCameraReady(true)}
          />

          <View style={styles.cameraOverlay}>
            <TouchableOpacity
              onPress={() => {
                setActiveCamera(null);
                setIsCameraReady(false);
              }}
              style={styles.cameraCancel}
              disabled={loadingPhoto}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={takePhoto}
              style={[
                styles.captureBtn,
                (loadingPhoto || !isCameraReady) && { opacity: 0.6 },
              ]}
              disabled={loadingPhoto || !isCameraReady}
            >
              <View style={styles.captureInner} />
            </TouchableOpacity>

            <Text style={styles.cameraHint}>
              {loadingPhoto
                ? "Guardando foto..."
                : !isCameraReady
                  ? "Preparando cámara..."
                  : "Toca para capturar"}
            </Text>
          </View>
        </View>
      </Modal>

      {/* MODAL PREVIEW */}
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
            <Text style={styles.previewDate}>📅 {previewPhoto?.createdAt}</Text>

            {previewPhoto?.gps ? (
              <Text style={styles.previewGps}>
                📍 {previewPhoto.gps.latitude.toFixed(5)},{" "}
                {previewPhoto.gps.longitude.toFixed(5)}
              </Text>
            ) : (
              <Text style={styles.previewGps}>
                📍 GPS cargando o no disponible
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ==================== SELECTOR TIPO LISTA ==================== */

const OptionSelector = ({
  label,
  icon,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) => {
  return (
    <View style={styles.selectorBox}>
      <View style={styles.selectorHeader}>
        <Ionicons name={icon} size={20} color="#2E7D32" />
        <Text style={styles.selectorLabel}>{label}</Text>
      </View>

      {!value && (
        <Text style={[styles.selectorValue, { color: "#999" }]}>
          {placeholder}
        </Text>
      )}

      <View style={styles.optionRow}>
        {options.map((option) => {
          const selected = value === option;

          return (
            <TouchableOpacity
              key={option}
              style={[styles.optionBtn, selected && styles.optionBtnSelected]}
              onPress={() => onChange(option)}
            >
              <Text
                style={[
                  styles.optionText,
                  selected && styles.optionTextSelected,
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

/* ==================== COMPONENTE PHOTO ITEM ==================== */

const PhotoItem = ({
  label,
  data,
  onTake,
  onView,
  onDelete,
}: {
  label: string;
  data: PhotoData | null;
  onTake: () => void;
  onView: () => void;
  onDelete: () => void;
}) => {
  const hasPhoto = !!data;

  return (
    <View style={styles.photoItem}>
      <View style={styles.photoHeader}>
        <Text style={styles.photoLabel}>{label}</Text>

        {hasPhoto && (
          <View style={styles.photoBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#2E7D32" />
            <Text style={styles.photoBadgeText}>Tomada</Text>
          </View>
        )}
      </View>

      {!hasPhoto ? (
        <TouchableOpacity style={styles.takePhotoBtn} onPress={onTake}>
          <Ionicons name="camera-outline" size={20} color="#fff" />
          <Text style={styles.takePhotoText}>Tomar foto</Text>
        </TouchableOpacity>
      ) : (
        <View>
          <TouchableOpacity onPress={onView} activeOpacity={0.9}>
            <Image source={{ uri: data.uri }} style={styles.photoThumbnail} />
          </TouchableOpacity>

          <View style={styles.photoActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={onTake}>
              <Ionicons name="refresh-outline" size={18} color="#1565C0" />
              <Text style={styles.actionTextBlue}>Repetir</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={onDelete}>
              <Ionicons name="trash-outline" size={18} color="#c62828" />
              <Text style={styles.actionTextRed}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

/* ==================== ESTILOS ==================== */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F1F8E9",
  },

  container: {
    padding: 20,
    paddingBottom: 50,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1B5E20",
  },

  subtitle: {
    color: "#555",
    fontSize: 14,
    marginTop: 2,
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: 18,
    marginTop: 4,
  },

  logoutText: {
    color: "#c62828",
    fontWeight: "600",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B5E20",
    marginBottom: 16,
  },

  counterBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  counterBadgeText: {
    color: "#1B5E20",
    fontWeight: "800",
  },

  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  inputIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
    color: "#222",
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

  textAreaHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },

  textAreaLabel: {
    color: "#333",
    fontSize: 15,
    fontWeight: "600",
  },

  textArea: {
    minHeight: 130,
    fontSize: 16,
    color: "#222",
    textAlignVertical: "top",
    paddingBottom: 12,
  },

  selectorBox: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  selectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  selectorLabel: {
    color: "#333",
    fontSize: 15,
    fontWeight: "700",
  },

  selectorValue: {
    color: "#222",
    fontSize: 16,
    marginBottom: 10,
  },

  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  optionBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C8E6C9",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  optionBtnSelected: {
    backgroundColor: "#2E7D32",
    borderColor: "#2E7D32",
  },

  optionText: {
    color: "#2E7D32",
    fontWeight: "700",
  },

  optionTextSelected: {
    color: "#fff",
  },

  readOnlyField: {
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },

  readOnlyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  readOnlyLabel: {
    color: "#1B5E20",
    fontSize: 15,
    fontWeight: "700",
  },

  readOnlyText: {
    color: "#1B5E20",
    fontSize: 16,
    fontWeight: "800",
  },

  stationCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },

  stationTopBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#1B5E20",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },

  stationTopBadgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },

  emptyBox: {
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  emptyText: {
    color: "#777",
    marginTop: 8,
    textAlign: "center",
  },

  photoItem: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
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
    fontWeight: "600",
    color: "#333",
  },

  photoBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 4,
  },

  photoBadgeText: {
    color: "#2E7D32",
    fontSize: 12,
    fontWeight: "600",
  },

  takePhotoBtn: {
    backgroundColor: "#2E7D32",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },

  takePhotoText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  photoThumbnail: {
    width: "100%",
    height: 140,
    borderRadius: 12,
    marginBottom: 10,
  },

  photoActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },

  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "#F5F5F5",
    borderRadius: 10,
  },

  actionTextBlue: {
    color: "#1565C0",
    fontWeight: "600",
  },

  actionTextRed: {
    color: "#c62828",
    fontWeight: "600",
  },

  saveBtn: {
    backgroundColor: "#1B5E20",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 10,
    shadowColor: "#1B5E20",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },

  saveBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },

  clearBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ffcdd2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 12,
  },

  clearBtnText: {
    color: "#c62828",
    fontSize: 16,
    fontWeight: "700",
  },

  cameraOverlay: {
    position: "absolute",
    bottom: 50,
    width: "100%",
    alignItems: "center",
  },

  cameraCancel: {
    position: "absolute",
    top: -620,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 30,
  },

  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },

  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#2E7D32",
  },

  cameraHint: {
    color: "#fff",
    marginTop: 16,
    fontSize: 14,
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
