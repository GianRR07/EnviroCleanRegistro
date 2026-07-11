import { getCurrentUserSession } from "@/utils/session";
import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

const homeForRole = (role?: string) => {
  if (role === "admin") return "/admin";
  if (role === "trabajador") return "/worker";
  if (role === "cliente") return "/client";
  return "/login";
};

const routeMatchesRole = (pathname: string, role?: string) => {
  if (pathname === "/" || pathname === "/login") return true;
  if (role === "admin") return pathname.startsWith("/admin");
  if (role === "trabajador") return pathname.startsWith("/worker");
  if (role === "cliente") return pathname.startsWith("/client");
  return false;
};

/**
 * Evita que el historial nativo deje entrar a pantallas de otro rol.
 * También corrige la ruta al volver desde segundo plano o usar el botón
 * físico de retroceso de Android.
 */
export function SessionRouteGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const checkSequence = useRef(0);

  useEffect(() => {
    if (!navigationState?.key) return;

    let mounted = true;

    const enforceSessionRoute = async () => {
      const sequence = ++checkSequence.current;
      const session = await getCurrentUserSession();

      if (!mounted || sequence !== checkSequence.current) return;

      if (!session) {
        if (pathname !== "/login" && pathname !== "/") {
          router.replace("/login");
        }
        return;
      }

      const home = homeForRole(session.role);

      if (pathname === "/login" || !routeMatchesRole(pathname, session.role)) {
        router.replace(home as any);
      }
    };

    void enforceSessionRoute();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void enforceSessionRoute();
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [navigationState?.key, pathname, router]);

  return null;
}
