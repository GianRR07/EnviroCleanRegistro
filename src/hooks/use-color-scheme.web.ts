import { useSyncExternalStore } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

const subscribe = () => () => undefined;

/**
 * Mantiene un valor estable durante el render estático y habilita el esquema
 * real una vez que la aplicación está ejecutándose en el navegador.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : "light";
}
