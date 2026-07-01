import { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Image,
} from "react-native";

import { CameraView } from "expo-camera";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { saveRecord } from "@/utils/storage";

export default function Worker() {
  const router = useRouter();
  const cameraRef = useRef<any>(null);

  const [activeCamera, setActiveCamera] = useState<any>(null);
  const [previewPhoto, setPreviewPhoto] = useState<any>(null);

  const [form, setForm] = useState({
    cliente: "",
    tipoServicio: "",
    area: "",
    observaciones: "",
  });

  const createBox = () => ({
    name: "",
    estadoEncontrado: null,
    estadoFinal: null,
    fichaFirmada: null,
  });

  const [boxes, setBoxes] = useState<any>({
    1: createBox(),
  });

  const addBox = () => {
    const id = Date.now();
    setBoxes((p: any) => ({ ...p, [id]: createBox() }));
  };

  const removeBox = (id: number) => {
    const copy = { ...boxes };
    delete copy[id];
    setBoxes(copy);
  };

  const getGPS = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const loc = await Location.getCurrentPositionAsync({});
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !activeCamera) return;

    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.7,
    });

    const gps = await getGPS();

    const peruDate = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(new Date());

const data = {
  uri: photo.uri,
  gps,
  date: peruDate,
};

    const { boxId, type } = activeCamera;

    setActiveCamera(null);

    setBoxes((prev: any) => ({
      ...prev,
      [boxId]: {
        ...prev[boxId],
        [type]: data,
      },
    }));
  };

  const deletePhoto = (boxId: number, type: string) => {
    setBoxes((prev: any) => ({
      ...prev,
      [boxId]: { ...prev[boxId], [type]: null },
    }));
  };

  const saveRegister = async () => {
    const record = {
      id: Date.now(),
      form,
      boxes,
      status: "pendiente",
      createdAt: new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(new Date()),
    };

    await saveRecord(record);
    alert("Registro guardado correctamente");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Registro de Limpieza</Text>

        <TouchableOpacity onPress={() => router.replace("/login")}>
          <Text style={styles.logout}>Salir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* FORM */}
        <View style={styles.card}>
          <Text style={styles.section}>Datos generales</Text>

          <TextInput placeholder="Cliente" style={styles.input}
            onChangeText={(t) => setForm({ ...form, cliente: t })} />

          <TextInput placeholder="Tipo servicio" style={styles.input}
            onChangeText={(t) => setForm({ ...form, tipoServicio: t })} />

          <TextInput placeholder="Área" style={styles.input}
            onChangeText={(t) => setForm({ ...form, area: t })} />

          <TextInput placeholder="Observaciones" style={styles.input}
            onChangeText={(t) => setForm({ ...form, observaciones: t })} />
        </View>

        {/* BOXES */}
        <View style={styles.card}>
          <Text style={styles.section}>Estaciones</Text>

          <TouchableOpacity style={styles.addBtn} onPress={addBox}>
            <Text style={{ color: "#fff", fontWeight: "bold" }}>
              + Añadir estación
            </Text>
          </TouchableOpacity>

          {Object.keys(boxes).map((key) => {
            const boxId = Number(key);
            const box = boxes[boxId];

            return (
              <View key={key} style={styles.boxCard}>
                <TextInput
                  placeholder="Nombre estación"
                  value={box.name}
                  style={styles.input}
                  onChangeText={(t) =>
                    setBoxes((p: any) => ({
                      ...p,
                      [boxId]: { ...p[boxId], name: t },
                    }))
                  }
                />

                <PhotoItem
                  label="Estado encontrado"
                  data={box.estadoEncontrado}
                  onTake={() =>
                    setActiveCamera({ boxId, type: "estadoEncontrado" })
                  }
                  onView={() => setPreviewPhoto(box.estadoEncontrado)}
                  onDelete={() => deletePhoto(boxId, "estadoEncontrado")}
                />

                <PhotoItem
                  label="Estado final"
                  data={box.estadoFinal}
                  onTake={() =>
                    setActiveCamera({ boxId, type: "estadoFinal" })
                  }
                  onView={() => setPreviewPhoto(box.estadoFinal)}
                  onDelete={() => deletePhoto(boxId, "estadoFinal")}
                />

                <PhotoItem
                  label="Ficha firmada"
                  data={box.fichaFirmada}
                  onTake={() =>
                    setActiveCamera({ boxId, type: "fichaFirmada" })
                  }
                  onView={() => setPreviewPhoto(box.fichaFirmada)}
                  onDelete={() => deletePhoto(boxId, "fichaFirmada")}
                />

                <TouchableOpacity
                  style={styles.deleteBox}
                  onPress={() => removeBox(boxId)}
                >
                  <Text style={{ color: "#fff" }}>Eliminar estación</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={saveRegister}>
          <Text style={{ color: "#fff", textAlign: "center" }}>
            Guardar registro
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* CAMERA */}
      <Modal visible={!!activeCamera}>
        <View style={{ flex: 1 }}>
          <CameraView ref={cameraRef} style={{ flex: 1 }} />

          <View style={styles.cameraActions}>
            <TouchableOpacity onPress={() => setActiveCamera(null)} style={styles.btnOutline}>
              <Text>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={takePhoto} style={styles.btnPrimary}>
              <Text style={{ color: "#fff" }}>Capturar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PREVIEW FIX (SIN NEGRO) */}
      <Modal visible={!!previewPhoto} animationType="fade">
        <View style={styles.previewFix}>
          <TouchableOpacity
            onPress={() => setPreviewPhoto(null)}
            style={{ marginBottom: 10 }}
          >
            <Text style={{ color: "#fff", fontSize: 18 }}>✕ cerrar</Text>
          </TouchableOpacity>

          {previewPhoto?.uri ? (
            <Image
              source={{ uri: previewPhoto.uri }}
              style={styles.previewImg}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ color: "#fff" }}>No hay imagen</Text>
          )}

          <View style={{ marginTop: 10 }}>
            {previewPhoto?.date && (
              <Text style={{ color: "#fff" }}>
                📅 {previewPhoto.date}
              </Text>
            )}

            {previewPhoto?.gps && (
              <Text style={{ color: "#fff" }}>
                📍 {previewPhoto.gps.latitude.toFixed(5)},{" "}
                {previewPhoto.gps.longitude.toFixed(5)}
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* COMPONENT */
const PhotoItem = ({ label, data, onTake, onView, onDelete }: any) => (
  <View style={styles.photoBox}>
    <Text style={{ fontWeight: "bold" }}>{label}</Text>

    {!data ? (
      <TouchableOpacity style={styles.takeBtn} onPress={onTake}>
        <Text style={{ color: "#fff" }}>📷 Tomar foto</Text>
      </TouchableOpacity>
    ) : (
      <View>
        <TouchableOpacity onPress={onView}>
          <Image source={{ uri: data.uri }} style={styles.image} />
        </TouchableOpacity>

        <Text style={styles.meta}>📅 {data.date}</Text>

        {data.gps && (
          <Text style={styles.meta}>
            📍 {data.gps.latitude.toFixed(5)}, {data.gps.longitude.toFixed(5)}
          </Text>
        )}

        <View style={styles.row}>
          <TouchableOpacity onPress={onTake} style={styles.repeatBtn}>
            <Text style={{ color: "#1976D2" }}>Repetir</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
            <Text style={{ color: "red" }}>Borrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { padding: 15 },
  header: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: "bold" },
  logout: { color: "red" },

  card: { backgroundColor: "#fff", padding: 15, borderRadius: 10, marginBottom: 10 },
  section: { fontWeight: "bold", marginBottom: 10 },

  input: { borderWidth: 1, borderColor: "#ddd", padding: 10, borderRadius: 8, marginBottom: 10 },

  addBtn: { backgroundColor: "green", padding: 12, borderRadius: 10 },

  boxCard: { marginBottom: 10 },

  deleteBox: { backgroundColor: "red", padding: 10, borderRadius: 10, marginTop: 10 },

  saveBtn: { backgroundColor: "#1B5E20", padding: 15, borderRadius: 10 },

  takeBtn: { backgroundColor: "#2E7D32", padding: 10, borderRadius: 8, marginTop: 5 },

  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },

  repeatBtn: { borderWidth: 1, borderColor: "#1976D2", padding: 6, borderRadius: 8 },

  deleteBtn: { borderWidth: 1, borderColor: "red", padding: 6, borderRadius: 8 },

  image: { height: 120, borderRadius: 10, marginTop: 8 },

  meta: { fontSize: 12 },

  previewFix: {
    flex: 1,
    backgroundColor: "black",
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },

  previewImg: {
    width: "100%",
    height: "80%",
  },

  cameraActions: {
    position: "absolute",
    bottom: 30,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
  },

  btnPrimary: {
    backgroundColor: "#2E7D32",
    padding: 12,
    borderRadius: 10,
  },

  btnOutline: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
  },

  photoBox: {
    backgroundColor: "#f2f2f2",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
});