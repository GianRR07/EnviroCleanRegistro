import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
} from "expo-router";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { SessionRouteGuard } from "@/components/session-route-guard";
import { AppProvider } from "../context/AppContext";

export default function Layout() {
  const colorScheme = useColorScheme();

  return (
    <AppProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <SessionRouteGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </AppProvider>
  );
}
