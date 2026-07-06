import { getRecordsAppwrite } from "@/utils/appwriteRecords";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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

  const logout = () => {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F8E9",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    alignItems: "center",
  },

  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1B5E20",
  },

  subtitle: {
    fontSize: 13,
    color: "#555",
  },

  logoutBtn: {
    padding: 8,
  },

  loading: {
    paddingHorizontal: 16,
    color: "#1565C0",
    fontWeight: "600",
  },

  card: {
    backgroundColor: "#fff",
    margin: 12,
    padding: 16,
    borderRadius: 16,
    elevation: 3,
  },

  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  client: {
    fontSize: 16,
    fontWeight: "700",
  },

  badge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  badgeText: {
    color: "#1B5E20",
    fontWeight: "700",
    fontSize: 12,
  },

  line: {
    fontSize: 13,
    color: "#444",
    marginTop: 4,
  },

  date: {
    fontSize: 12,
    color: "#666",
    marginTop: 6,
  },

  stationCard: {
    marginTop: 14,
    padding: 12,
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
  },

  stationTitle: {
    fontWeight: "700",
    marginBottom: 8,
  },

  photoBox: {
    marginBottom: 10,
  },

  photoLabel: {
    fontSize: 12,
    color: "#555",
    marginBottom: 4,
  },

  photo: {
    width: "100%",
    height: 160,
    borderRadius: 10,
  },

  emptyCard: {
    padding: 20,
    margin: 20,
    backgroundColor: "#fff",
    borderRadius: 14,
    alignItems: "center",
  },

  emptyText: {
    color: "#777",
  },
});
