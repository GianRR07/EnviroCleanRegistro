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

export const saveRecordAppwrite = async (record: any) => {
  try {
    console.log("📤 Enviando registro a Appwrite...");

    const response = await databases.createDocument(
      DATABASE_ID,
      RECORDS_COLLECTION_ID,
      ID.unique(),
      {
        cliente: record.form?.cliente ?? "",
        tipoServicio: record.form?.tipoServicio ?? "",
        area: record.form?.area ?? "",
        observaciones: record.form?.observaciones ?? "",
        status: record.status ?? "pendiente",
        createdAt: record.createdAt ?? "",
        boxes: JSON.stringify(record.boxes ?? {}),
      },
    );

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

export const getRecordsAppwrite = async () => {
  try {
    console.log("📥 Leyendo registros desde Appwrite...");

    const response = await databases.listDocuments(
      DATABASE_ID,
      RECORDS_COLLECTION_ID,
    );

    const records = response.documents.map((doc: any) => {
      const boxes = parseJsonField(doc.boxes, {});

      return {
        ...doc,
        id: doc.$id,
        appwriteId: doc.$id,
        form: {
          cliente: doc.cliente ?? "",
          tipoServicio: doc.tipoServicio ?? "",
          area: doc.area ?? "",
          observaciones: doc.observaciones ?? "",
        },
        boxes,
        stations: Object.values(boxes || {}),
        status: doc.status ?? "pendiente",
        createdAt: doc.createdAt ?? doc.$createdAt ?? "",
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

export const saveIncidentAppwrite = async (incident: any) => {
  try {
    console.log("📤 Enviando incidencia a Appwrite...");

    const response = await databases.createDocument(
      DATABASE_ID,
      INCIDENTS_COLLECTION_ID,
      ID.unique(),
      {
        recordId: String(incident.recordId ?? ""),
        cliente: incident.cliente ?? "",
        createdAt: incident.createdAt ?? "",
        status: incident.status ?? "registrada",
        observation: incident.observation ?? "",
        selectedItems: JSON.stringify(incident.selectedItems ?? []),
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
