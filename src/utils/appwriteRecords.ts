import { databases, ID } from "@/utils/appwrite";

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

export const isServiceRecordComplete = (record: any) => {
  const form = record?.form ?? record ?? {};
  const boxes = parseJsonField(record?.boxes, {});
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

const buildRecordPayload = (record: any, includeWorkerFields = true) => {
  const requestedStatus = resolveServiceRecordStatus(record);

  const payload: Record<string, any> = {
    cliente: record.form?.cliente ?? "",
    tipoServicio: record.form?.tipoServicio ?? "",
    area: record.form?.area ?? "",
    observaciones: record.form?.observaciones ?? "",
    status: requestedStatus,
    createdAt: record.createdAt ?? "",
    boxes: JSON.stringify(record.boxes ?? {}),
  };

  if (includeWorkerFields) {
    payload.trabajadorId = record.trabajadorId ?? record.worker?.id ?? record.worker?.appwriteId ?? "";
    payload.trabajadorUsuario = record.trabajadorUsuario ?? record.worker?.username ?? "";
    payload.trabajadorNombre =
      record.trabajadorNombre ??
      record.worker?.name ??
      record.worker?.username ??
      "Trabajador no identificado";
  }

  return payload;
};

const isUnknownAttributeError = (error: any) => {
  const message = String(error?.message ?? "").toLowerCase();
  const type = String(error?.type ?? "").toLowerCase();

  return (
    type.includes("document_invalid_structure") &&
    (message.includes("unknown attribute") ||
      message.includes("trabajadorid") ||
      message.includes("trabajadorusuario") ||
      message.includes("trabajadornombre"))
  );
};

export const saveRecordAppwrite = async (record: any) => {
  try {
    console.log("📤 Enviando registro nuevo a Appwrite...");

    let payload = buildRecordPayload(record, true);
    let response: any;

    try {
      response = await databases.createDocument(
        DATABASE_ID,
        RECORDS_COLLECTION_ID,
        ID.unique(),
        payload,
      );
    } catch (error: any) {
      if (!isUnknownAttributeError(error)) throw error;

      console.log(
        "⚠️ La colección records no tiene los campos de trabajador. Reintentando sin esos campos.",
      );
      payload = buildRecordPayload(record, false);
      response = await databases.createDocument(
        DATABASE_ID,
        RECORDS_COLLECTION_ID,
        ID.unique(),
        payload,
      );
    }

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

    let payload = buildRecordPayload(record, true);
    let response: any;

    try {
      response = await databases.updateDocument(
        DATABASE_ID,
        RECORDS_COLLECTION_ID,
        recordId,
        payload,
      );
    } catch (error: any) {
      if (!isUnknownAttributeError(error)) throw error;

      console.log(
        "⚠️ La colección records no tiene los campos de trabajador. Reintentando actualización sin esos campos.",
      );
      payload = buildRecordPayload(record, false);
      response = await databases.updateDocument(
        DATABASE_ID,
        RECORDS_COLLECTION_ID,
        recordId,
        payload,
      );
    }

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
    );

    const records = response.documents.map((doc: any) => {
      const boxes = parseJsonField(doc.boxes, {});

      const normalizedRecord = {
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id,
        form: {
          cliente: doc.cliente ?? "",
          tipoServicio: doc.tipoServicio ?? "",
          area: doc.area ?? "",
          observaciones: doc.observaciones ?? "",
        },
        worker: {
          id: doc.trabajadorId ?? "",
          username: doc.trabajadorUsuario ?? "",
          name: doc.trabajadorNombre ?? "",
        },
        trabajadorId: doc.trabajadorId ?? "",
        trabajadorUsuario: doc.trabajadorUsuario ?? "",
        trabajadorNombre: doc.trabajadorNombre ?? "",
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
