import { databases, ID } from "@/utils/appwrite";

const DATABASE_ID = "enviroclean-db";
const COLLECTION_ID = "records";

export const saveRecordAppwrite = async (record: any) => {
  try {
    console.log("📤 Enviando a Appwrite...");

    const response = await databases.createDocument(
      DATABASE_ID,
      COLLECTION_ID,
      ID.unique(),
      {
        cliente: record.form.cliente,
        tipoServicio: record.form.tipoServicio,
        area: record.form.area,
        observaciones: record.form.observaciones,
        status: record.status,
        createdAt: record.createdAt,
        boxes: JSON.stringify(record.boxes),
      },
    );

    console.log("✔ Guardado:", response.$id);

    return response;
  } catch (error: any) {
    console.log("❌ APPWRITE ERROR COMPLETO");
    console.log("Code:", error.code);
    console.log("Type:", error.type);
    console.log("Message:", error.message);
    console.log(error);

    throw error;
  }
};
