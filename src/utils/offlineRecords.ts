import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  saveRecordAppwrite,
  updateServiceRecordAppwrite,
} from "@/utils/appwriteRecords";
import { uploadPhoto } from "@/utils/uploadPhoto";

export const LOCAL_RECORDS_KEY = "EnviroClean_records";
export const PENDING_RECORDS_KEY = "EnviroClean_pending_records_v1";

export type RecordSyncStatus = "pending" | "syncing" | "synced" | "error";

const parseArray = (raw: string | null): any[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const recordMatches = (left: any, right: any) => {
  const leftAppwrite = left?.appwriteId || left?.$id;
  const rightAppwrite = right?.appwriteId || right?.$id;

  if (leftAppwrite && rightAppwrite) {
    return String(leftAppwrite) === String(rightAppwrite);
  }

  return String(left?.id ?? "") === String(right?.id ?? "");
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

export const getLocalRecords = async () => {
  return parseArray(await AsyncStorage.getItem(LOCAL_RECORDS_KEY));
};

export const getPendingRecords = async () => {
  return parseArray(await AsyncStorage.getItem(PENDING_RECORDS_KEY));
};

export const getPendingRecordCount = async () => {
  const records = await getPendingRecords();
  return records.length;
};

export const upsertLocalRecord = async (record: any) => {
  const records = await getLocalRecords();
  const next = upsertInto(records, record);
  await AsyncStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(next));
  return record;
};

export const queueRecordForSync = async (record: any) => {
  const queued = {
    ...record,
    syncStatus: "pending" as RecordSyncStatus,
    queuedAt: record?.queuedAt ?? new Date().toISOString(),
    lastSyncError: "",
  };

  await upsertLocalRecord(queued);

  const pending = await getPendingRecords();
  const nextPending = upsertInto(pending, queued);
  await AsyncStorage.setItem(PENDING_RECORDS_KEY, JSON.stringify(nextPending));

  return queued;
};

const removePendingRecord = async (record: any) => {
  const pending = await getPendingRecords();
  const next = pending.filter((item) => !recordMatches(item, record));
  await AsyncStorage.setItem(PENDING_RECORDS_KEY, JSON.stringify(next));
};

const getStations = (record: any) => {
  if (Array.isArray(record?.stations) && record.stations.length > 0) {
    return record.stations;
  }

  if (record?.boxes && typeof record.boxes === "object") {
    return Object.values(record.boxes).filter(
      (station: any) => station && typeof station === "object" && station.numero,
    );
  }

  return [];
};

const syncPhoto = async (photo: any) => {
  if (!photo) return null;
  if (photo.appwriteId || photo.fileId || photo.$id) return photo;
  if (!photo.uri) return photo;

  const uploaded = await uploadPhoto(photo.uri);
  return {
    ...photo,
    appwriteId: uploaded.$id,
  };
};

const syncStationPhotos = async (station: any) => {
  return {
    ...station,
    estadoEncontrado: await syncPhoto(station?.estadoEncontrado),
    estadoFinal: await syncPhoto(station?.estadoFinal),
    formatoFisico: await syncPhoto(
      station?.formatoFisico || station?.fichaFirmada,
    ),
  };
};

const buildBoxes = (stations: any[]) => {
  return stations.reduce<Record<string, any>>((accumulator, station, index) => {
    accumulator[String(index + 1)] = station;
    return accumulator;
  }, {});
};

export const syncRecordNow = async (record: any) => {
  const stations = getStations(record);
  const syncedStations: any[] = [];

  // Se sincronizan de forma secuencial para no saturar el teléfono ni Appwrite.
  for (const station of stations) {
    syncedStations.push(await syncStationPhotos(station));
  }

  const recordWithPhotos = {
    ...record,
    stations: syncedStations,
    boxes: buildBoxes(syncedStations),
    syncStatus: "syncing" as RecordSyncStatus,
  };

  const currentAppwriteId = recordWithPhotos.appwriteId || recordWithPhotos.$id;
  const response = currentAppwriteId
    ? await updateServiceRecordAppwrite(String(currentAppwriteId), recordWithPhotos)
    : await saveRecordAppwrite(recordWithPhotos);

  const syncedRecord = {
    ...recordWithPhotos,
    appwriteId: response.$id,
    $id: response.$id,
    syncStatus: "synced" as RecordSyncStatus,
    lastSyncAt: new Date().toISOString(),
    lastSyncError: "",
  };

  await upsertLocalRecord(syncedRecord);
  await removePendingRecord(record);

  return syncedRecord;
};

let pendingSyncPromise:
  | Promise<{
      synced: number;
      failed: number;
      pending: number;
      syncedRecords: any[];
    }>
  | null = null;

export const syncPendingRecords = async () => {
  if (pendingSyncPromise) return pendingSyncPromise;

  pendingSyncPromise = (async () => {
    const pending = await getPendingRecords();
    let synced = 0;
    let failed = 0;
    const syncedRecords: any[] = [];

    for (const record of pending) {
      try {
        const result = await syncRecordNow(record);
        syncedRecords.push(result);
        synced += 1;
      } catch (error: any) {
        failed += 1;
        const failedRecord = {
          ...record,
          syncStatus: "pending" as RecordSyncStatus,
          lastSyncError: error?.message || "Sin conexión o error de sincronización",
          lastSyncAttemptAt: new Date().toISOString(),
        };
        await upsertLocalRecord(failedRecord);

        const currentPending = await getPendingRecords();
        const nextPending = upsertInto(currentPending, failedRecord);
        await AsyncStorage.setItem(
          PENDING_RECORDS_KEY,
          JSON.stringify(nextPending),
        );
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
          local?.syncStatus === "pending" ? "pending" : "synced",
      };
    } else {
      merged.push(local);
    }
  }

  return merged;
};
