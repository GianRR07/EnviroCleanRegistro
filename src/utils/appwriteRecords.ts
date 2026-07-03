import { databases, ID } from "@/utils/appwrite";

const DATABASE_ID = "enviroclean-db";
const COLLECTION_ID = "records";

export const saveRecordAppwrite = async (record: any) => {
  try {
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
  } catch (error) {
    console.log("❌ Error:", error);
  }
};
