import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppUser } from "@/utils/authUsers";

const CURRENT_USER_KEY = "enviroclean.currentUser";

export const saveCurrentUserSession = async (user: AppUser) => {
  await AsyncStorage.setItem(
    CURRENT_USER_KEY,
    JSON.stringify({
      id: user.id,
      appwriteId: user.appwriteId,
      username: user.username,
      usernameLower: user.usernameLower,
      name: user.name,
      role: user.role,
      active: user.active,
    }),
  );
};

export const getCurrentUserSession = async (): Promise<AppUser | null> => {
  const raw = await AsyncStorage.getItem(CURRENT_USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    await AsyncStorage.removeItem(CURRENT_USER_KEY);
    return null;
  }
};

export const clearCurrentUserSession = async () => {
  await AsyncStorage.removeItem(CURRENT_USER_KEY);
};
