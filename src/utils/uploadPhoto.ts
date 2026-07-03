import * as FileSystem from "expo-file-system/legacy";

const BUCKET_ID = "photos";
const PROJECT_ID = "6a46e8b90028a108e50f";
const ENDPOINT = "https://nyc.cloud.appwrite.io/v1";

export async function uploadPhoto(uri: string) {
  try {
    console.log("URI FINAL:", uri);

    const info = await FileSystem.getInfoAsync(uri);
    console.log("FILE INFO:", info);

    if (!info.exists || !info.size) {
      throw new Error("El archivo no existe o está vacío.");
    }

    const uploadUrl = `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files`;

    const response = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType: "image/jpeg",
      parameters: {
        fileId: "unique()",
      },
      headers: {
        "X-Appwrite-Project": PROJECT_ID,
      },
    });

    console.log("APPWRITE RAW RESPONSE:", response.body);

    const result = JSON.parse(response.body);

    if (response.status < 200 || response.status >= 300) {
      throw result;
    }

    console.log("✅ Foto subida a Appwrite:", result);

    return result;
  } catch (error) {
    console.error("❌ Error subiendo foto:", error);
    throw error;
  }
}
