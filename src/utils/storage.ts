import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ENVIROCLEAN_RECORDS";

// 🔥 obtener todos los registros
export const getRecords = async () => {
  try {
    const data = await AsyncStorage.getItem(KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

// 🔥 guardar nuevo registro
export const saveRecord = async (record: any) => {
  try {
    const old = await getRecords();

    const updated = [...old, record];

    await AsyncStorage.setItem(KEY, JSON.stringify(updated));

    return true;
  } catch (e) {
    console.log("ERROR SAVE:", e);
    return false;
  }
};

// 🔥 actualizar registro (para fotos parciales)
export const updateRecord = async (id: number, newData: any) => {
  const data = await getRecords();

  const updated = data.map((r: any) =>
    r.id === id ? { ...r, ...newData } : r
  );

  await AsyncStorage.setItem(KEY, JSON.stringify(updated));
};

// 🔥 borrar todo (debug)
export const clearRecords = async () => {
  await AsyncStorage.removeItem(KEY);
};