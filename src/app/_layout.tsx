import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
import { Stack } from "expo-router";

import { AnimatedSplashOverlay } from "@/components/animated-icon";

// 👇 IMPORTANTE: contexto global
import { AppProvider } from "../context/AppContext";

export default function Layout() {
  const colorScheme = useColorScheme();

  return (
    <AppProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        
        <AnimatedSplashOverlay />

        <Stack
          screenOptions={{
            headerShown: false,
          }}
        />

      </ThemeProvider>
    </AppProvider>
  );
}