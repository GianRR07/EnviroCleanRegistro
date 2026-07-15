import { useAndroidBackHandler } from "@/hooks/use-android-back-handler";
import { translateAppwriteError } from "@/utils/errorMessages";
import { queueRecordForSync, syncPendingRecords } from "@/utils/offlineRecords";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
// Importar estilos centralizados
import { workerFormStyles as styles } from "@/styles";
import {
  clearCurrentUserSession,
  getCurrentUserSession,
} from "@/utils/session";
import { SafeAreaView } from "react-native-safe-area-context";

type GPSData = {
  latitude: number;
  longitude: number;
};

type EstadoSincronizacionFoto =
  | "pendiente"
  | "subiendo"
  | "sincronizada"
  | "error";

type PhotoData = {
  uri: string;
  appwriteId?: string;
  gps: GPSData | null;
  createdAt: string;
  estadoSincronizacion?: EstadoSincronizacionFoto;
  intentosSincronizacion?: number;
  ultimoErrorSincronizacion?: string | null;
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

const getPeruDate = () =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

const createStation = (index: number, area: string): StationData => ({
  id: Date.now() + index + Math.floor(Math.random() * 100000),
  numero: String(index),
  ubicacion: area,
  estadoEncontrado: null,
  estadoFinal: null,
  formatoFisico: null,
});

export default function Worker() {
  const router = useRouter();
  const cameraRef = useRef<any>(null);
  const draftLoadedRef = useRef(false);
  const syncInProgressRef = useRef(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [activeCamera, setActiveCamera] = useState<ActiveCameraData>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoData | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const [locationPermissionGranted, setLocationPermissionGranted] =
    useState(false);

  const [form, setForm] = useState<FormData>(DEFAULT_FORM);

  const [stations, setStations] = useState<StationData[]>(() => [
    createStation(1, ""),
  ]);

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

  const loadDraft = useCallback(async () => {
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

        // La identidad del trabajador nunca se restaura desde el borrador.
      }
    } catch (error) {
      console.log("Error cargando borrador:", error);
    } finally {
      draftLoadedRef.current = true;
    }
  }, []);

  const preparePermissions = useCallback(async () => {
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
  }, [requestCameraPermission]);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void loadDraft();
      void preparePermissions();
    }, 0);

    return () => clearTimeout(initialLoad);
  }, [loadDraft, preparePermissions]);

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

      // La foto se conserva primero en el almacenamiento interno. El GPS se
      // obtiene antes de cerrar la captura para que la evidencia local ya quede
      // completa aun cuando el trabajador guarde el registro inmediatamente.
      const gps = await getGPS();
      const data: PhotoData = {
        uri: permanentUri,
        gps,
        createdAt: getPeruDate(),
        estadoSincronizacion: "pendiente",
        intentosSincronizacion: 0,
        ultimoErrorSincronizacion: null,
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

      // La subida se realiza al guardar/sincronizar el registro. Así se evita
      // duplicar archivos si el usuario guarda mientras una subida paralela sigue activa.
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

  const resetFormForNewRecord = useCallback(async () => {
    /*
     * Solo se limpia el borrador visual.
     * No se eliminan físicamente las fotografías porque pueden pertenecer
     * a un registro que continúa pendiente dentro de la cola local.
     */
    await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
    setForm(DEFAULT_FORM);
    setStations([createStation(1, "")]);
  }, []);

  const clearDraft = async () => {
    Alert.alert(
      "Limpiar formulario",
      "¿Deseas borrar los datos del formulario actual? Los registros ya guardados localmente no serán eliminados.",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Sí, limpiar",
          style: "destructive",
          onPress: async () => {
            try {
              await resetFormForNewRecord();
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

  const runBackgroundSync = useCallback(async () => {
    if (syncInProgressRef.current) return;

    syncInProgressRef.current = true;

    try {
      await syncPendingRecords();
    } catch (error) {
      /*
       * Un error de red nunca revierte el guardado local.
       * La cola conservará los registros para el siguiente intento.
       */
      console.log(
        "Sincronización pendiente; los registros continúan seguros en el dispositivo:",
        error,
      );
    } finally {
      syncInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    /*
     * Se intenta sincronizar al abrir el formulario, cada 30 segundos y
     * cuando la aplicación regresa al primer plano.
     */
    void runBackgroundSync();

    const intervalId = setInterval(() => {
      void runBackgroundSync();
    }, 30_000);

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void runBackgroundSync();
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [runBackgroundSync]);

  useAndroidBackHandler(() => {
    if (previewPhoto) {
      setPreviewPhoto(null);
      return true;
    }

    if (activeCamera) {
      setActiveCamera(null);
      setIsCameraReady(false);
      return true;
    }

    router.replace("/worker");
    return true;
  });

  const saveRegister = async () => {
    if (savingRecord) return;

    setSavingRecord(true);

    try {
      const sessionWorker = await getCurrentUserSession();

      if (!sessionWorker || sessionWorker.role !== "trabajador") {
        throw new Error(
          "No hay una sesión válida de trabajador. Cierra la pantalla e inicia sesión nuevamente.",
        );
      }

      const workerId = sessionWorker.appwriteId || sessionWorker.id || "";

      if (!workerId) {
        throw new Error(
          "La cuenta del trabajador no tiene un ID válido en Appwrite.",
        );
      }

      const isRecordComplete = (
        formData: typeof form,
        stationsData: typeof stations,
      ) => {
        if (
          !formData.cliente ||
          !formData.tipoServicio ||
          !formData.tipoEstacionPrincipal ||
          !formData.area
        ) {
          return false;
        }

        if (!stationsData || stationsData.length === 0) return false;

        return stationsData.every(
          (station) =>
            !!station.numero &&
            !!station.ubicacion &&
            !!station.estadoEncontrado &&
            !!station.estadoFinal &&
            !!station.formatoFisico,
        );
      };

      const estadoRegistro = isRecordComplete(form, stations)
        ? "completado"
        : "pendiente";

      const localRecordId = Date.now();
      const recordCreatedAt = getPeruDate();

      const workerInfo = {
        id: workerId,
        appwriteId: workerId,
        username: sessionWorker.username || "",
        name:
          sessionWorker.name ||
          sessionWorker.username ||
          "Trabajador no identificado",
      };

      /*
       * No reconstruimos las fotografías en form.tsx.
       * `stations` ya tiene el tipo StationData[] y cada foto nueva se crea
       * con estado "pendiente". La normalización y los reintentos pertenecen
       * exclusivamente a offlineRecords.ts.
       */
      const stationsForRecord: StationData[] = stations;

      const record = {
        id: localRecordId,
        clientRecordId: String(localRecordId),
        form: {
          ...form,
          cantidadEstaciones:
            form.cantidadEstaciones || String(stationsForRecord.length),
        },
        boxes: stationsForRecord.reduce<Record<number, StationData>>(
          (accumulator, station, index) => {
            accumulator[index + 1] = station;
            return accumulator;
          },
          {},
        ),
        stations: stationsForRecord,
        status: estadoRegistro,
        syncStatus: "pending",
        estadoSincronizacion: "pendiente",
        createdAt: recordCreatedAt,
        updatedAt: recordCreatedAt,
        worker: workerInfo,
        trabajadorId: workerInfo.id,
        trabajadorUsuario: workerInfo.username,
        trabajadorNombre: workerInfo.name,
      };

      /*
       * ÚNICA OPERACIÓN QUE BLOQUEA EL BOTÓN:
       * guardar el registro completo y las rutas de sus fotos en la cola local.
       */
      await queueRecordForSync(record);

      /*
       * El trabajador puede iniciar inmediatamente otro registro.
       * No se borran las fotos físicas; ahora pertenecen al registro en cola.
       */
      await resetFormForNewRecord();

      Alert.alert(
        estadoRegistro === "completado"
          ? "Registro guardado"
          : "Registro guardado como pendiente",
        "La información y las fotografías quedaron guardadas en el dispositivo. Puedes realizar otro registro mientras la sincronización continúa en segundo plano.",
      );

      /*
       * No utilizar await aquí. La red nunca debe bloquear el formulario.
       */
      void runBackgroundSync();
    } catch (error: any) {
      console.log("ERROR AL GUARDAR LOCALMENTE", error);

      Alert.alert(
        "Error",
        translateAppwriteError(
          error,
          "No se pudo guardar el registro en el dispositivo.",
        ),
      );
    } finally {
      setSavingRecord(false);
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
          onPress={async () => {
            await clearCurrentUserSession();
            router.replace("/login");
          }}
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

        {/* ESTADO DEL GUARDADO Y BOTONES */}
        <View
          style={{
            backgroundColor: "#E8F5E9",
            borderRadius: 14,
            padding: 14,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: "#A5D6A7",
          }}
        >
          <Text
            style={{
              color: "#2E7D32",
              fontWeight: "800",
            }}
          >
            GUARDADO LOCAL SEGURO
          </Text>

          <Text style={{ color: "#555", marginTop: 6 }}>
            Al guardar, el formulario se libera inmediatamente. La aplicación
            enviará los registros y fotografías pendientes sin impedir que
            continúes trabajando.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, savingRecord && { opacity: 0.55 }]}
          onPress={saveRegister}
          disabled={savingRecord}
        >
          <Ionicons
            name="save-outline"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />

          <Text style={styles.saveBtnText}>
            {savingRecord
              ? "Guardando en el dispositivo..."
              : "Guardar registro en el dispositivo"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.clearBtn} onPress={clearDraft}>
          <Ionicons
            name="trash-outline"
            size={20}
            color="#c62828"
            style={{ marginRight: 8 }}
          />

          <Text style={styles.clearBtnText}>Limpiar formulario actual</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* MODAL CÁMARA */}
      <Modal
        visible={!!activeCamera}
        animationType="slide"
        onRequestClose={() => {
          if (loadingPhoto) return;
          setActiveCamera(null);
          setIsCameraReady(false);
        }}
      >
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
