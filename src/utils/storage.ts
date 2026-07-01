import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ENVIROCLEAN_RECORDS";

export const saveRecord = async (record: any) => {
  try {
    const existing = await AsyncStorage.getItem(KEY);
    const list = existing ? JSON.parse(existing) : [];

    list.unshift(record);

    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    console.log("saveRecord error", e);
  }
};

export const getRecords = async () => {
  try {
    const data = await AsyncStorage.getItem(KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};