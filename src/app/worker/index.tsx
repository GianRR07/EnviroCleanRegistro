import { useAndroidBackHandler } from "@/hooks/use-android-back-handler";
import { workerMenuStyles as styles } from "@/styles";
import {
  getPendingRecordCount,
  syncPendingRecords,
} from "@/utils/offlineRecords";
import { clearCurrentUserSession } from "@/utils/session";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WorkerMenu() {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await getPendingRecordCount());
  }, []);

  const synchronize = useCallback(async (showFeedback = false) => {
    if (syncing) return;

    try {
      setSyncing(true);
      const result = await syncPendingRecords();
      setPendingCount(result.pending);

      if (showFeedback) {
        if (result.synced > 0) {
          alert(`Se sincronizaron ${result.synced} registro(s).`);
        } else if (result.pending > 0) {
          alert("Aún no hay conexión. Los registros siguen seguros en el dispositivo.");
        } else {
          alert("No hay registros pendientes de sincronización.");
        }
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  useFocusEffect(
    useCallback(() => {
      void refreshPendingCount();
      void synchronize(false);

      const interval = setInterval(() => {
        void synchronize(false);
      }, 20000);

      return () => clearInterval(interval);
    }, [refreshPendingCount, synchronize]),
  );

  useAndroidBackHandler(() => {
    BackHandler.exitApp();
    return true;
  });

  const logout = async () => {
    await clearCurrentUserSession();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <View style={{ width: 44 }} />
        <Text style={styles.title}>Panel de Trabajador</Text>
        <TouchableOpacity
          onPress={logout}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 3,
          }}
        >
          <Ionicons name="log-out-outline" size={24} color="#C62828" />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Selecciona una opción</Text>

      {pendingCount > 0 && (
        <TouchableOpacity
          onPress={() => void synchronize(true)}
          disabled={syncing}
          style={{
            marginTop: 14,
            marginHorizontal: 18,
            padding: 14,
            borderRadius: 14,
            backgroundColor: "#FFF8E1",
            borderWidth: 1,
            borderColor: "#FFE082",
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          {syncing ? (
            <ActivityIndicator color="#F57F17" />
          ) : (
            <Ionicons name="cloud-upload-outline" size={24} color="#F57F17" />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#E65100", fontWeight: "800" }}>
              {pendingCount} registro(s) sin sincronizar
            </Text>
            <Text style={{ color: "#6D4C41", marginTop: 3, fontSize: 13 }}>
              Se enviarán automáticamente cuando vuelva la conexión.
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.wrapper}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/worker/form")}
        >
          <Ionicons name="create-outline" size={32} color="#2E7D32" />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardText}>Crear formulario</Text>
            <Text style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              Registra un servicio nuevo o continúa un registro pendiente.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/worker/history")}
        >
          <Ionicons name="document-text-outline" size={32} color="#1565C0" />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardText}>Ver registros</Text>
            <Text style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              Consulta registros enviados y pendientes del dispositivo.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#999" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
