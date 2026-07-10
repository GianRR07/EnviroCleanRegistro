import { getCurrentUserSession } from "@/utils/session";
import { useRootNavigationState, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    if (!rootNavigationState?.key) return;

    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const redirectBySession = async () => {
      const currentUser = await getCurrentUserSession();
      if (!isMounted) return;

      let target: "/login" | "/admin" | "/worker" | "/client" = "/login";

      if (currentUser?.role === "admin") target = "/admin";
      else if (currentUser?.role === "trabajador") target = "/worker";
      else if (currentUser?.role === "cliente") target = "/client";

      // Evita navegar antes de que Expo Router haya montado completamente
      // el árbol de navegación. Esto previene el warning de React en desarrollo:
      // "Can't perform a React state update on a component that hasn't mounted yet".
      timeoutId = setTimeout(() => {
        if (isMounted) router.replace(target);
      }, 0);
    };

    redirectBySession();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [rootNavigationState?.key, router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
