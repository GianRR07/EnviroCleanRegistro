import { getRecordsAppwrite } from "@/utils/appwriteRecords";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
// Importar estilos centralizados desde styles.ts
import { workerHistoryStyles as styles } from "@/styles";
import { clearCurrentUserSession } from "@/utils/session";
import { SafeAreaView } from "react-native-safe-area-context";

const APPWRITE_ENDPOINT = "https://nyc.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6a46e8b90028a108e50f";
const APPWRITE_BUCKET_ID = "photos";

export default function WorkerHistory() {
  const router = useRouter();

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRecords();

    const interval = setInterval(loadRecords, 8000);
    return () => clearInterval(interval);
  }, []);

  const loadRecords = async () => {
    try {
      setLoading(true);
      const data = await getRecordsAppwrite();
      setRecords(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error:", error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const getPhotoUrl = (photoData: any) => {
    if (!photoData) return null;

    if (typeof photoData === "string" && photoData.startsWith("http")) {
      return photoData;
    }

    if (photoData?.uri?.startsWith("http")) {
      return photoData.uri;
    }

    const fileId =
      photoData?.appwriteId ||
      photoData?.fileId ||
      photoData?.$id ||
      photoData?.id;

    if (!fileId) return null;

    return `${APPWRITE_ENDPOINT}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}/view?project=${APPWRITE_PROJECT_ID}`;
  };

  const logout = async () => {
    await clearCurrentUserSession();
    router.replace("/login");
  };

  const getStations = (record: any) => {
    const stations = record?.stations || [];
    if (Array.isArray(stations) && stations.length > 0) return stations;

    const boxes = record?.boxes || {};
    return Object.values(boxes || {});
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER + LOGOUT */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Historial</Text>
          <Text style={styles.subtitle}>Registros sincronizados</Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={22} color="#c62828" />
        </TouchableOpacity>
      </View>

      {loading && <Text style={styles.loading}>Cargando registros...</Text>}

      <ScrollView>
        {records.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No hay registros</Text>
          </View>
        ) : (
          records.map((r: any, i: number) => (
            <View key={r.$id || i} style={styles.card}>
              <View style={styles.rowHeader}>
                <Text style={styles.client}>
                  {r.form?.cliente || "Sin cliente"}
                </Text>

                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {r.form?.tipoServicio || "Servicio"}
                  </Text>
                </View>
              </View>

              <Text style={styles.line}>Área: {r.form?.area || "-"}</Text>

              <Text style={styles.line}>
                Estación: {r.form?.tipoEstacionPrincipal || "-"}
              </Text>

              <Text style={styles.line}>Estado: {r.status || "pendiente"}</Text>

              <Text style={styles.date}>
                Fecha: {r.createdAt || r.$createdAt || "-"}
              </Text>

              {/* 🔥 FOTOS */}
              {getStations(r).map((station: any, idx: number) => (
                <View key={idx} style={styles.stationCard}>
                  <Text style={styles.stationTitle}>
                    Estación {station.numero || idx + 1}
                  </Text>

                  {["estadoEncontrado", "estadoFinal", "formatoFisico"].map(
                    (type) => {
                      const photo = station?.[type];
                      const url = getPhotoUrl(photo);

                      if (!url) return null;

                      return (
                        <View key={type} style={styles.photoBox}>
                          <Text style={styles.photoLabel}>{type}</Text>

                          <Image source={{ uri: url }} style={styles.photo} />
                        </View>
                      );
                    },
                  )}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Los estilos locales se han eliminado porque se utilizan los importados desde styles.ts
