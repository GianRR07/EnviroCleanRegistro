import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  saveRecordAppwrite,
  updateServiceRecordAppwrite,
} from "@/utils/appwriteRecords";
import { uploadPhoto } from "@/utils/uploadPhoto";

export const LOCAL_RECORDS_KEY = "EnviroClean_records";
export const PENDING_RECORDS_KEY = "EnviroClean_pending_records_v1";

export type RecordSyncStatus = "pending" | "syncing" | "synced" | "error";
export type PhotoSyncStatus =
  | "pendiente"
  | "subiendo"
  | "sincronizada"
  | "error";

export type EstadoSincronizacionRegistro =
  | "pendiente"
  | "sincronizando"
  | "parcial"
  | "sincronizado"
  | "error";

type PhotoField = "estadoEncontrado" | "estadoFinal" | "formatoFisico";

const PHOTO_FIELDS: PhotoField[] = [
  "estadoEncontrado",
  "estadoFinal",
  "formatoFisico",
];

const parseArray = (raw: string | null): any[] => {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    return value as T;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const getAppwriteId = (value: any) =>
  value?.appwriteId || value?.fileId || value?.$id || "";

const getClientRecordId = (value: any) =>
  value?.clientRecordId || value?.id || "";

const recordMatches = (left: any, right: any) => {
  const leftAppwrite = getAppwriteId(left);
  const rightAppwrite = getAppwriteId(right);

  if (
    leftAppwrite &&
    rightAppwrite &&
    String(leftAppwrite) === String(rightAppwrite)
  ) {
    return true;
  }

  const leftClientId = getClientRecordId(left);
  const rightClientId = getClientRecordId(right);

  return Boolean(
    leftClientId &&
    rightClientId &&
    String(leftClientId) === String(rightClientId),
  );
};

const upsertInto = (records: any[], record: any) => {
  const index = records.findIndex((item) => recordMatches(item, record));

  if (index >= 0) {
    const next = [...records];

    next[index] = {
      ...next[index],
      ...record,
      form: {
        ...(next[index]?.form ?? {}),
        ...(record?.form ?? {}),
      },
    };

    return next;
  }

  return [...records, record];
};

/*
 * Serializa las modificaciones de AsyncStorage.
 * Esto evita que un registro nuevo se pierda si el usuario guarda mientras
 * otro registro está actualizando sus puntos de control de fotografías.
 */
let storageMutationChain: Promise<void> = Promise.resolve();

const withStorageLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previousOperation = storageMutationChain;
  let releaseCurrentOperation!: () => void;

  storageMutationChain = new Promise<void>((resolve) => {
    releaseCurrentOperation = resolve;
  });

  await previousOperation;

  try {
    return await operation();
  } finally {
    releaseCurrentOperation();
  }
};

const readRecordsUnsafe = async (key: string) =>
  parseArray(await AsyncStorage.getItem(key));

export const getLocalRecords = async () => {
  return readRecordsUnsafe(LOCAL_RECORDS_KEY);
};

export const getPendingRecords = async () => {
  return readRecordsUnsafe(PENDING_RECORDS_KEY);
};

export const getPendingRecordCount = async () => {
  const records = await getPendingRecords();
  return records.length;
};

export const upsertLocalRecord = async (record: any) => {
  return withStorageLock(async () => {
    const records = await readRecordsUnsafe(LOCAL_RECORDS_KEY);
    const next = upsertInto(records, record);

    await AsyncStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(next));
    return record;
  });
};

/*
 * Guarda el mismo estado tanto en el historial local como en la cola.
 * Se usa después de cada fotografía para que un reinicio pueda continuar.
 */
const persistPendingRecord = async (record: any) => {
  return withStorageLock(async () => {
    const [localRecords, pendingRecords] = await Promise.all([
      readRecordsUnsafe(LOCAL_RECORDS_KEY),
      readRecordsUnsafe(PENDING_RECORDS_KEY),
    ]);

    const nextLocal = upsertInto(localRecords, record);
    const nextPending = upsertInto(pendingRecords, record);

    await AsyncStorage.multiSet([
      [LOCAL_RECORDS_KEY, JSON.stringify(nextLocal)],
      [PENDING_RECORDS_KEY, JSON.stringify(nextPending)],
    ]);

    return record;
  });
};

const removePendingAndSaveSynced = async (record: any) => {
  return withStorageLock(async () => {
    const [localRecords, pendingRecords] = await Promise.all([
      readRecordsUnsafe(LOCAL_RECORDS_KEY),
      readRecordsUnsafe(PENDING_RECORDS_KEY),
    ]);

    const nextLocal = upsertInto(localRecords, record);
    const nextPending = pendingRecords.filter(
      (item) => !recordMatches(item, record),
    );

    await AsyncStorage.multiSet([
      [LOCAL_RECORDS_KEY, JSON.stringify(nextLocal)],
      [PENDING_RECORDS_KEY, JSON.stringify(nextPending)],
    ]);

    return record;
  });
};

const getStations = (record: any): any[] => {
  const stations = parseJson<any[]>(record?.stations, []);

  if (Array.isArray(stations) && stations.length > 0) {
    return stations;
  }

  const boxes = parseJson<Record<string, any>>(record?.boxes, {});

  if (boxes && typeof boxes === "object") {
    return Object.entries(boxes)
      .filter(([key, station]) => {
        return (
          !String(key).startsWith("__enviroclean") &&
          station &&
          typeof station === "object"
        );
      })
      .map(([, station]) => station);
  }

  return [];
};

const buildBoxes = (stations: any[]) => {
  return stations.reduce<Record<string, any>>((accumulator, station, index) => {
    accumulator[String(index + 1)] = station;
    return accumulator;
  }, {});
};

const normalizePhotoForQueue = (photo: any) => {
  if (!photo) return null;

  const isAlreadyUploaded = Boolean(getAppwriteId(photo));

  return {
    ...photo,
    estadoSincronizacion: (isAlreadyUploaded
      ? "sincronizada"
      : "pendiente") as PhotoSyncStatus,
    intentosSincronizacion: Number(photo?.intentosSincronizacion || 0),
    ultimoErrorSincronizacion: photo?.ultimoErrorSincronizacion ?? null,
  };
};

const normalizeStationsForQueue = (record: any) => {
  return getStations(record).map((station) => ({
    ...station,
    estadoEncontrado: normalizePhotoForQueue(station?.estadoEncontrado),
    estadoFinal: normalizePhotoForQueue(station?.estadoFinal),
    formatoFisico: normalizePhotoForQueue(
      station?.formatoFisico || station?.fichaFirmada,
    ),
  }));
};

export const queueRecordForSync = async (record: any) => {
  const normalizedStations = normalizeStationsForQueue(record);

  const queued = {
    ...record,
    clientRecordId: String(record?.clientRecordId || record?.id || Date.now()),
    stations: normalizedStations,
    boxes: buildBoxes(normalizedStations),
    syncStatus: "pending" as RecordSyncStatus,
    estadoSincronizacion: "pendiente" as EstadoSincronizacionRegistro,
    queuedAt: record?.queuedAt ?? new Date().toISOString(),
    lastSyncError: "",
  };

  await persistPendingRecord(queued);
  return queued;
};

const updatePhotoInStations = (
  stations: any[],
  stationIndex: number,
  field: PhotoField,
  photo: any,
) => {
  return stations.map((station, index) =>
    index === stationIndex
      ? {
          ...station,
          [field]: photo,
        }
      : station,
  );
};

const getPhotoProgress = (stations: any[]) => {
  const photos = stations.flatMap((station) =>
    PHOTO_FIELDS.map((field) => station?.[field]).filter(Boolean),
  );

  const synchronized = photos.filter((photo) =>
    Boolean(getAppwriteId(photo)),
  ).length;

  return {
    total: photos.length,
    synchronized,
  };
};

const getFailureVisualState = (
  stations: any[],
): EstadoSincronizacionRegistro => {
  const progress = getPhotoProgress(stations);
  return progress.synchronized > 0 ? "parcial" : "error";
};

const createRecordWithStations = (
  record: any,
  stations: any[],
  patch: Record<string, any> = {},
) => ({
  ...record,
  ...patch,
  stations,
  boxes: buildBoxes(stations),
  updatedAt: new Date().toISOString(),
});

export const syncRecordNow = async (record: any) => {
  let stations = normalizeStationsForQueue(record);

  let workingRecord = createRecordWithStations(record, stations, {
    syncStatus: "syncing" as RecordSyncStatus,
    estadoSincronizacion: "sincronizando" as EstadoSincronizacionRegistro,
    lastSyncAttemptAt: new Date().toISOString(),
    lastSyncError: "",
  });

  await persistPendingRecord(workingRecord);

  /*
   * Cada fotografía se sube de forma secuencial. Después de recibir su ID
   * de Appwrite, el registro completo se vuelve a guardar en AsyncStorage.
   * En un reintento, las fotos que ya poseen ID se omiten automáticamente.
   */
  for (let stationIndex = 0; stationIndex < stations.length; stationIndex++) {
    for (const field of PHOTO_FIELDS) {
      const currentPhoto = stations[stationIndex]?.[field];

      if (!currentPhoto) continue;

      if (getAppwriteId(currentPhoto)) {
        if (currentPhoto.estadoSincronizacion !== "sincronizada") {
          stations = updatePhotoInStations(stations, stationIndex, field, {
            ...currentPhoto,
            estadoSincronizacion: "sincronizada" as PhotoSyncStatus,
            ultimoErrorSincronizacion: null,
          });
        }
        continue;
      }

      const attemptNumber =
        Number(currentPhoto?.intentosSincronizacion || 0) + 1;

      if (!currentPhoto?.uri) {
        const message = `La fotografía ${field} de la estación ${
          stationIndex + 1
        } no tiene una ruta local válida.`;

        stations = updatePhotoInStations(stations, stationIndex, field, {
          ...currentPhoto,
          estadoSincronizacion: "error" as PhotoSyncStatus,
          intentosSincronizacion: attemptNumber,
          ultimoErrorSincronizacion: message,
        });

        workingRecord = createRecordWithStations(workingRecord, stations, {
          syncStatus: "error" as RecordSyncStatus,
          estadoSincronizacion: getFailureVisualState(stations),
          lastSyncError: message,
          lastSyncAttemptAt: new Date().toISOString(),
        });

        await persistPendingRecord(workingRecord);
        throw new Error(message);
      }

      const uploadingPhoto = {
        ...currentPhoto,
        estadoSincronizacion: "subiendo" as PhotoSyncStatus,
        intentosSincronizacion: attemptNumber,
        ultimoErrorSincronizacion: null,
      };

      stations = updatePhotoInStations(
        stations,
        stationIndex,
        field,
        uploadingPhoto,
      );

      try {
        const uploaded = await uploadPhoto(currentPhoto.uri);
        const uploadedId = uploaded?.$id || uploaded?.id;

        if (!uploadedId) {
          throw new Error(
            "Appwrite no devolvió el identificador de la fotografía subida.",
          );
        }

        const synchronizedPhoto = {
          ...uploadingPhoto,
          appwriteId: String(uploadedId),
          estadoSincronizacion: "sincronizada" as PhotoSyncStatus,
          ultimoErrorSincronizacion: null,
          sincronizadaAt: new Date().toISOString(),
        };

        stations = updatePhotoInStations(
          stations,
          stationIndex,
          field,
          synchronizedPhoto,
        );

        const progress = getPhotoProgress(stations);
        const visualState: EstadoSincronizacionRegistro =
          progress.synchronized > 0 && progress.synchronized < progress.total
            ? "parcial"
            : "sincronizando";

        workingRecord = createRecordWithStations(workingRecord, stations, {
          syncStatus: "syncing" as RecordSyncStatus,
          estadoSincronizacion: visualState,
          lastSyncError: "",
          lastSyncAttemptAt: new Date().toISOString(),
        });

        /* Punto de control definitivo de esta fotografía. */
        await persistPendingRecord(workingRecord);
      } catch (error: any) {
        const message =
          error?.message || "No se pudo sincronizar la fotografía.";

        stations = updatePhotoInStations(stations, stationIndex, field, {
          ...uploadingPhoto,
          estadoSincronizacion: "error" as PhotoSyncStatus,
          ultimoErrorSincronizacion: message,
        });

        workingRecord = createRecordWithStations(workingRecord, stations, {
          syncStatus: "error" as RecordSyncStatus,
          estadoSincronizacion: getFailureVisualState(stations),
          lastSyncError: message,
          lastSyncAttemptAt: new Date().toISOString(),
        });

        await persistPendingRecord(workingRecord);
        throw error;
      }
    }
  }

  workingRecord = createRecordWithStations(workingRecord, stations, {
    syncStatus: "syncing" as RecordSyncStatus,
    estadoSincronizacion: "sincronizando" as EstadoSincronizacionRegistro,
    lastSyncError: "",
  });

  /*
   * Se guarda también el punto de control de "todas las fotos listas"
   * antes de crear o actualizar el documento principal.
   */
  await persistPendingRecord(workingRecord);

  try {
    const currentAppwriteId = workingRecord.appwriteId || workingRecord.$id;

    const response = currentAppwriteId
      ? await updateServiceRecordAppwrite(
          String(currentAppwriteId),
          workingRecord,
        )
      : await saveRecordAppwrite(workingRecord);

    const responseId = response?.$id || response?.id || currentAppwriteId;

    if (!responseId) {
      throw new Error(
        "Appwrite no devolvió el identificador del registro sincronizado.",
      );
    }

    const syncedRecord = createRecordWithStations(workingRecord, stations, {
      appwriteId: String(responseId),
      $id: String(responseId),
      syncStatus: "synced" as RecordSyncStatus,
      estadoSincronizacion: "sincronizado" as EstadoSincronizacionRegistro,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: "",
    });

    await removePendingAndSaveSynced(syncedRecord);
    return syncedRecord;
  } catch (error: any) {
    const message =
      error?.message || "No se pudo sincronizar el registro en Appwrite.";

    const failedRecord = createRecordWithStations(workingRecord, stations, {
      syncStatus: "error" as RecordSyncStatus,
      estadoSincronizacion: getFailureVisualState(stations),
      lastSyncError: message,
      lastSyncAttemptAt: new Date().toISOString(),
    });

    await persistPendingRecord(failedRecord);
    throw error;
  }
};

let pendingSyncPromise: Promise<{
  synced: number;
  failed: number;
  pending: number;
  syncedRecords: any[];
}> | null = null;

export const syncPendingRecords = async () => {
  if (pendingSyncPromise) return pendingSyncPromise;

  pendingSyncPromise = (async () => {
    const pendingSnapshot = await getPendingRecords();
    let synced = 0;
    let failed = 0;
    const syncedRecords: any[] = [];

    for (const record of pendingSnapshot) {
      try {
        const result = await syncRecordNow(record);
        syncedRecords.push(result);
        synced += 1;
      } catch (error: any) {
        failed += 1;

        /*
         * syncRecordNow ya guardó el punto exacto del fallo. Se recupera la
         * versión más reciente para no sobrescribirla con la copia antigua
         * tomada al comenzar este recorrido.
         */
        const latestPendingRecords = await getPendingRecords();
        const latestRecord =
          latestPendingRecords.find((item) => recordMatches(item, record)) ||
          record;

        const currentStations = getStations(latestRecord);
        const failedRecord = createRecordWithStations(
          latestRecord,
          currentStations,
          {
            syncStatus: "error" as RecordSyncStatus,
            estadoSincronizacion:
              latestRecord?.estadoSincronizacion ||
              getFailureVisualState(currentStations),
            lastSyncError:
              latestRecord?.lastSyncError ||
              error?.message ||
              "Sin conexión o error de sincronización",
            lastSyncAttemptAt: new Date().toISOString(),
          },
        );

        await persistPendingRecord(failedRecord);
      }
    }

    const remaining = await getPendingRecords();

    return {
      synced,
      failed,
      pending: remaining.length,
      syncedRecords,
    };
  })().finally(() => {
    pendingSyncPromise = null;
  });

  return pendingSyncPromise;
};

export const mergeRemoteAndLocalRecords = async (remoteRecords: any[]) => {
  const localRecords = await getLocalRecords();
  let merged = Array.isArray(remoteRecords) ? [...remoteRecords] : [];

  for (const local of localRecords) {
    const index = merged.findIndex((remote) => recordMatches(remote, local));

    if (index >= 0) {
      const remote = merged[index];

      merged[index] = {
        ...remote,
        ...local,
        appwriteId: remote.appwriteId || remote.$id || local.appwriteId,
        $id: remote.$id || remote.appwriteId || local.$id,
        form: {
          ...(remote?.form ?? {}),
          ...(local?.form ?? {}),
        },
        stations:
          Array.isArray(local?.stations) && local.stations.length > 0
            ? local.stations
            : remote?.stations,
        boxes:
          local?.boxes && Object.keys(local.boxes).length > 0
            ? local.boxes
            : remote?.boxes,
        syncStatus:
          local?.syncStatus ||
          (remote?.appwriteId || remote?.$id ? "synced" : "pending"),
        estadoSincronizacion:
          local?.estadoSincronizacion ||
          (remote?.appwriteId || remote?.$id ? "sincronizado" : "pendiente"),
      };
    } else {
      merged.push(local);
    }
  }

  return merged;
};
