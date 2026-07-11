import { databases, ID, Query } from "@/utils/appwrite";

const DATABASE_ID = "enviroclean-db";
const RECORDS_COLLECTION_ID = "records";
const INCIDENTS_COLLECTION_ID = "incidents";

const parseJsonField = (value: any, fallback: any) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const hasText = (value: any) => {
  return value !== undefined && value !== null && String(value).trim().length > 0;
};

const hasPhoto = (photo: any) => {
  if (!photo) return false;
  if (typeof photo === "string") return photo.trim().length > 0;
  return !!(photo.uri || photo.appwriteId || photo.fileId || photo.$id || photo.id);
};

// La colección `records` ya acepta `boxes` como JSON serializado. Usamos una
// clave reservada dentro de ese mismo JSON para conservar la identidad del
// trabajador incluso cuando Appwrite no permite escribir `idUser` ni los
// atributos `trabajador*`.
const WORKER_META_KEY = "__envirocleanWorker";
const FORM_META_KEY = "__envirocleanForm";

const decodeBoxesField = (value: any) => {
  const parsed = parseJsonField(value, {});

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    return {
      boxes: {},
      embeddedWorker: {} as Record<string, any>,
      embeddedForm: {} as Record<string, any>,
    };
  }

  const embeddedWorker =
    parsed[WORKER_META_KEY] && typeof parsed[WORKER_META_KEY] === "object"
      ? parsed[WORKER_META_KEY]
      : {};

  const embeddedForm =
    parsed[FORM_META_KEY] && typeof parsed[FORM_META_KEY] === "object"
      ? parsed[FORM_META_KEY]
      : {};

  const boxes = Object.fromEntries(
    Object.entries(parsed).filter(
      ([key]) => key !== WORKER_META_KEY && key !== FORM_META_KEY,
    ),
  );

  return { boxes, embeddedWorker, embeddedForm };
};

export const isServiceRecordComplete = (record: any) => {
  const form = record?.form ?? record ?? {};
  const { boxes } = decodeBoxesField(record?.boxes);
  const stations = Array.isArray(record?.stations) && record.stations.length > 0
    ? record.stations
    : Object.values(boxes || {});

  if (!hasText(form.cliente) || !hasText(form.tipoServicio) || !hasText(form.area)) {
    return false;
  }

  if (!Array.isArray(stations) || stations.length === 0) return false;

  return stations.every((station: any) => {
    return (
      hasText(station.numero) &&
      hasText(station.ubicacion) &&
      hasPhoto(station.estadoEncontrado) &&
      hasPhoto(station.estadoFinal) &&
      hasPhoto(station.formatoFisico)
    );
  });
};

export const resolveServiceRecordStatus = (record: any) => {
  if (record?.status === "rechazado") return "rechazado";
  return isServiceRecordComplete(record) ? "completado" : "pendiente";
};

type WorkerPayloadOptions = {
  relationshipMode: "single" | "array" | "none";
  includeSnapshot: boolean;
};

const getRelationshipUserId = (value: any): string => {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.length > 0 ? getRelationshipUserId(value[0]) : "";
  }
  if (typeof value === "string") return value;
  return value.$id ?? value.id ?? value.appwriteId ?? "";
};

const getRelationshipUserDocument = (value: any) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? first : null;
  }
  return typeof value === "object" ? value : null;
};

const getWorkerIdentity = (record: any) => {
  const relatedUserId = getRelationshipUserId(record?.idUser);
  const relatedUser = getRelationshipUserDocument(record?.idUser);
  const worker = record?.worker ?? {};
  const { embeddedWorker } = decodeBoxesField(record?.boxes);

  return {
    id:
      record?.trabajadorId ||
      worker?.id ||
      worker?.appwriteId ||
      relatedUserId ||
      embeddedWorker?.id ||
      embeddedWorker?.appwriteId ||
      "",
    username:
      record?.trabajadorUsuario ||
      worker?.username ||
      relatedUser?.username ||
      embeddedWorker?.username ||
      "",
    name:
      record?.trabajadorNombre ||
      worker?.name ||
      relatedUser?.name ||
      embeddedWorker?.name ||
      "",
  };
};

const buildRecordPayload = (
  record: any,
  options: WorkerPayloadOptions,
) => {
  const requestedStatus = resolveServiceRecordStatus(record);
  const worker = getWorkerIdentity(record);
  const { boxes, embeddedForm } = decodeBoxesField(record?.boxes);
  const recordForm = record?.form ?? embeddedForm ?? {};

  const formSnapshot = {
    cliente: recordForm?.cliente ?? "",
    tipoServicio: recordForm?.tipoServicio ?? "",
    tipoEstacionPrincipal: recordForm?.tipoEstacionPrincipal ?? "",
    detalleEstacion: recordForm?.detalleEstacion ?? "",
    area: recordForm?.area ?? "",
    observaciones: recordForm?.observaciones ?? "",
    cantidadEstaciones:
      recordForm?.cantidadEstaciones ?? String(Object.keys(boxes || {}).length),
  };

  const boxesWithMetadata: Record<string, any> = {
    ...boxes,
    [FORM_META_KEY]: formSnapshot,
  };

  if (worker.id) {
    boxesWithMetadata[WORKER_META_KEY] = {
      id: worker.id,
      appwriteId: worker.id,
      username: worker.username,
      name: worker.name || worker.username || "Trabajador no identificado",
    };
  }

  const payload: Record<string, any> = {
    cliente: formSnapshot.cliente,
    tipoServicio: formSnapshot.tipoServicio,
    area: formSnapshot.area,
    observaciones: formSnapshot.observaciones,
    status: requestedStatus,
    createdAt: record.createdAt ?? "",
    boxes: JSON.stringify(boxesWithMetadata),
  };

  // Se prueban ambas cardinalidades porque una relación múltiple exige un
  // arreglo de IDs, mientras que una relación singular exige un solo ID.
  if (options.relationshipMode === "single" && worker.id) {
    payload.idUser = worker.id;
  } else if (options.relationshipMode === "array" && worker.id) {
    payload.idUser = [worker.id];
  }

  // Estos campos son una copia legible del trabajador. Son opcionales porque
  // algunas instalaciones antiguas de la colección `records` todavía no los
  // tienen creados.
  if (options.includeSnapshot) {
    payload.trabajadorId = worker.id;
    payload.trabajadorUsuario = worker.username;
    payload.trabajadorNombre =
      worker.name || worker.username || "Trabajador no identificado";
  }

  return payload;
};

const isSchemaValidationError = (error: any) => {
  const type = String(error?.type ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();

  return (
    type.includes("document_invalid_structure") ||
    message.includes("unknown attribute") ||
    message.includes("invalid document structure")
  );
};

const workerPayloadCandidates: {
  label: string;
  options: WorkerPayloadOptions;
}[] = [
  {
    label: "relación idUser singular y campos de trabajador",
    options: { relationshipMode: "single", includeSnapshot: true },
  },
  {
    label: "relación idUser múltiple y campos de trabajador",
    options: { relationshipMode: "array", includeSnapshot: true },
  },
  {
    label: "relación idUser singular",
    options: { relationshipMode: "single", includeSnapshot: false },
  },
  {
    label: "relación idUser múltiple",
    options: { relationshipMode: "array", includeSnapshot: false },
  },
  {
    label: "campos de trabajador",
    options: { relationshipMode: "none", includeSnapshot: true },
  },
  {
    label: "identidad embebida en boxes",
    options: { relationshipMode: "none", includeSnapshot: false },
  },
];

const createRecordWithSchemaFallback = async (record: any) => {
  let lastError: any;

  for (const candidate of workerPayloadCandidates) {
    const payload = buildRecordPayload(record, candidate.options);

    try {
      const response = await databases.createDocument(
        DATABASE_ID,
        RECORDS_COLLECTION_ID,
        ID.unique(),
        payload,
      );
      return { response, payload, mode: candidate.label };
    } catch (error: any) {
      lastError = error;
      if (!isSchemaValidationError(error)) throw error;

      console.log(
        `⚠️ El esquema de records no aceptó ${candidate.label}. Probando una variante compatible...`,
      );
      console.log(
        `   ↳ ${error?.type ?? error?.code ?? "error"}: ${error?.message ?? "Sin detalle"}`,
      );
    }
  }

  throw lastError;
};

const updateRecordWithSchemaFallback = async (recordId: string, record: any) => {
  let lastError: any;

  for (const candidate of workerPayloadCandidates) {
    const payload = buildRecordPayload(record, candidate.options);

    try {
      const response = await databases.updateDocument(
        DATABASE_ID,
        RECORDS_COLLECTION_ID,
        recordId,
        payload,
      );
      return { response, payload, mode: candidate.label };
    } catch (error: any) {
      lastError = error;
      if (!isSchemaValidationError(error)) throw error;

      console.log(
        `⚠️ El esquema de records no aceptó ${candidate.label}. Probando una variante compatible...`,
      );
      console.log(
        `   ↳ ${error?.type ?? error?.code ?? "error"}: ${error?.message ?? "Sin detalle"}`,
      );
    }
  }

  throw lastError;
};

export const saveRecordAppwrite = async (record: any) => {
  try {
    console.log("📤 Enviando registro nuevo a Appwrite...");

    const { response, payload, mode } = await createRecordWithSchemaFallback(record);

    console.log(`👤 Identidad guardada mediante: ${mode}`);

    if (response.status !== payload.status) {
      console.log(
        `ℹ️ Appwrite devolvió status=${response.status}. Forzando status=${payload.status}...`,
      );
      await databases.updateDocument(
        DATABASE_ID,
        RECORDS_COLLECTION_ID,
        response.$id,
        { status: payload.status },
      );
    }

    console.log("✔ Registro guardado:", response.$id);
    return response;
  } catch (error: any) {
    console.log("❌ APPWRITE ERROR GUARDANDO REGISTRO");
    console.log("Code:", error.code);
    console.log("Type:", error.type);
    console.log("Message:", error.message);
    console.log(error);
    throw error;
  }
};

export const updateServiceRecordAppwrite = async (recordId: string, record: any) => {
  try {
    console.log(`📤 Actualizando registro existente en Appwrite: ${recordId}`);

    const { response, payload, mode } = await updateRecordWithSchemaFallback(
      recordId,
      record,
    );

    console.log(`👤 Identidad actualizada mediante: ${mode}`);

    if (response.status !== payload.status) {
      console.log(
        `ℹ️ Appwrite devolvió status=${response.status}. Forzando status=${payload.status}...`,
      );
      await databases.updateDocument(
        DATABASE_ID,
        RECORDS_COLLECTION_ID,
        response.$id,
        { status: payload.status },
      );
    }

    console.log("✔ Registro actualizado:", response.$id);
    return response;
  } catch (error: any) {
    console.log("❌ APPWRITE ERROR ACTUALIZANDO REGISTRO");
    console.log("Code:", error.code);
    console.log("Type:", error.type);
    console.log("Message:", error.message);
    console.log(error);
    throw error;
  }
};

export const getRecordsAppwrite = async () => {
  try {
    console.log("📥 Leyendo registros desde Appwrite...");

    const response = await databases.listDocuments(
      DATABASE_ID,
      RECORDS_COLLECTION_ID,
      [Query.limit(100)],
    );

    const records = response.documents.map((doc: any) => {
      const { boxes, embeddedWorker, embeddedForm } = decodeBoxesField(doc.boxes);
      const relatedUser = getRelationshipUserDocument(doc.idUser);
      const relatedUserId = getRelationshipUserId(doc.idUser);

      const workerId =
        doc.trabajadorId ||
        relatedUserId ||
        embeddedWorker?.id ||
        embeddedWorker?.appwriteId ||
        "";
      const workerUsername =
        doc.trabajadorUsuario ||
        relatedUser?.username ||
        embeddedWorker?.username ||
        "";
      const workerName =
        doc.trabajadorNombre ||
        relatedUser?.name ||
        embeddedWorker?.name ||
        workerUsername ||
        "";

      const normalizedRecord = {
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id,
        idUser: doc.idUser ?? null,
        idUserId: relatedUserId,
        form: {
          cliente: doc.cliente || embeddedForm?.cliente || "",
          tipoServicio: doc.tipoServicio || embeddedForm?.tipoServicio || "",
          tipoEstacionPrincipal: embeddedForm?.tipoEstacionPrincipal || "",
          detalleEstacion: embeddedForm?.detalleEstacion || "",
          area: doc.area || embeddedForm?.area || "",
          observaciones: doc.observaciones || embeddedForm?.observaciones || "",
          cantidadEstaciones:
            embeddedForm?.cantidadEstaciones || String(Object.keys(boxes || {}).length),
        },
        worker: {
          id: workerId,
          appwriteId: workerId,
          username: workerUsername,
          name: workerName,
        },
        trabajadorId: workerId,
        trabajadorUsuario: workerUsername,
        trabajadorNombre: workerName,
        boxes,
        stations: Object.values(boxes || {}),
        status: doc.status ?? "pendiente",
        createdAt: doc.createdAt ?? doc.$createdAt ?? "",
      };

      return {
        ...normalizedRecord,
        status: resolveServiceRecordStatus(normalizedRecord),
      };
    });

    return records.reverse();
  } catch (error: any) {
    console.log("❌ ERROR LEYENDO REGISTROS DESDE APPWRITE");
    console.log("Code:", error.code);
    console.log("Type:", error.type);
    console.log("Message:", error.message);
    console.log(error);
    throw error;
  }
};

export const getIncidentsAppwrite = async () => {
  try {
    console.log("📥 Leyendo incidencias desde Appwrite...");

    const response = await databases.listDocuments(
      DATABASE_ID,
      INCIDENTS_COLLECTION_ID,
      [Query.limit(100)],
    );

    const incidents = response.documents.map((doc: any) => {
      return {
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id,
        recordId: doc.recordId ?? "",
        cliente: doc.cliente ?? "",
        tipoIncidencia: doc.tipoIncidencia ?? "",
        observacion: doc.observacion ?? "",
        imagenes: parseJsonField(doc.imagenes, []),
        estado: doc.estado ?? "pendiente",
        createdAt: doc.createdAt ?? doc.$createdAt ?? "",
      };
    });

    return incidents.reverse();
  } catch (error: any) {
    console.log("❌ ERROR LEYENDO INCIDENCIAS DESDE APPWRITE");
    console.log("Code:", error.code);
    console.log("Type:", error.type);
    console.log("Message:", error.message);
    console.log(error);

    return [];
  }
};

export const saveIncidentAppwrite = async (incident: any) => {
  try {
    console.log("📤 Enviando incidencia a Appwrite...");

    /**
     * En Appwrite la colección de incidencias (`incidents`) está pensada para
     * almacenar un historial de no conformidades. Los campos que se guardan son:
     *
     * - recordId: identifica a qué registro de servicio pertenece la incidencia
     * - cliente: nombre del cliente vinculado al servicio
     * - tipoIncidencia: descripción concatenada de las evidencias marcadas
     * - observacion: texto libre introducido por el cliente
     * - imagenes: JSON serializado con los identificadores/URIs de las fotos
     * - createdAt: marca de tiempo legible para el usuario
     * - estado: estado de la incidencia (pendiente, atendida, cerrada, etc.)
     */
    const response = await databases.createDocument(
      DATABASE_ID,
      INCIDENTS_COLLECTION_ID,
      ID.unique(),
      {
        recordId: String(incident.recordId ?? ""),
        cliente: incident.cliente ?? "",
        tipoIncidencia: incident.tipoIncidencia ?? "",
        observacion: incident.observacion ?? "",
        imagenes: JSON.stringify(incident.imagenes ?? []),
        createdAt: incident.createdAt ?? "",
        estado: incident.estado ?? "pendiente",
      },
    );

    console.log("✔ Incidencia guardada:", response.$id);

    return response;
  } catch (error: any) {
    console.log("❌ APPWRITE ERROR GUARDANDO INCIDENCIA");
    console.log("Code:", error.code);
    console.log("Type:", error.type);
    console.log("Message:", error.message);
    console.log(error);

    throw error;
  }
};

/**
 * Actualiza el estado de un registro existente en Appwrite. Se utiliza para
 * marcar un registro como completado, pendiente o rechazado en función de
 * la validación en la aplicación cliente.
 *
 * @param recordId Identificador del documento en la colección de registros.
 * @param status Nuevo estado a almacenar (ej. "completado", "pendiente", "rechazado").
 */
export const updateRecordStatusAppwrite = async (
  recordId: string,
  status: string,
) => {
  try {
    console.log(`📤 Actualizando estado del registro ${recordId} a: ${status}`);
    const response = await databases.updateDocument(
      DATABASE_ID,
      RECORDS_COLLECTION_ID,
      recordId,
      {
        status,
      },
    );
    console.log("✔ Estado actualizado:", response.$id);
    return response;
  } catch (error: any) {
    console.log("❌ APPWRITE ERROR ACTUALIZANDO ESTADO DEL REGISTRO");
    console.log("Code:", error.code);
    console.log("Type:", error.type);
    console.log("Message:", error.message);
    console.log(error);
    throw error;
  }
};
