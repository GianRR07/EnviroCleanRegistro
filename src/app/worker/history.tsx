import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

const STORAGE_KEY = "enviroclean_records";

export default function WorkerHistory() {
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (data) setRecords(JSON.parse(data));
  };

  return (
    <ScrollView style={{ padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold" }}>
        Historial de registros
      </Text>

      {records.length === 0 ? (
        <Text style={{ marginTop: 20 }}>No hay registros aún</Text>
      ) : (
        records.map((r, i) => (
          <View
            key={i}
            style={{
              padding: 12,
              marginTop: 10,
              backgroundColor: "#fff",
              borderRadius: 10,
            }}
          >
            <Text>Cliente: {r.form?.cliente}</Text>
            <Text>Servicio: {r.form?.tipoServicio}</Text>
            <Text>Fecha: {r.createdAt}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
