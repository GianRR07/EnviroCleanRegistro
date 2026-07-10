import { authenticateAppUser } from "@/utils/authUsers";
import { translateAppwriteError } from "@/utils/errorMessages";
import { saveCurrentUserSession } from "@/utils/session";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

// Importar estilos centralizados
import { loginStyles as styles } from "@/styles";

export default function Login() {
  const router = useRouter();

  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!user.trim() || !password.trim()) {
      alert("Por favor completa todos los campos");
      return;
    }

    try {
      setLoading(true);
      const authenticatedUser = await authenticateAppUser(user, password);
      await saveCurrentUserSession(authenticatedUser);

      if (authenticatedUser.role === "admin") {
        router.replace("/admin");
      } else if (authenticatedUser.role === "trabajador") {
        router.replace("/worker");
      } else if (authenticatedUser.role === "cliente") {
        router.replace("/client");
      } else {
        alert("Este usuario no tiene un rol válido asignado.");
      }
    } catch (error: any) {
      console.log("❌ Error de login:", error);
      alert(translateAppwriteError(error, "No se pudo iniciar sesión."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.content}>
          {/* === LOGO ESTILIZADO CON COLORES DE LA MARCA === */}
          <View style={styles.logoContainer}>
            <View style={styles.logoRow}>
              <Ionicons
                name="leaf"
                size={34}
                color="#2E7D32"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.logoEnviro}>Enviro</Text>
              <Text style={styles.logoClean}>Clean</Text>
            </View>
            <Text style={styles.tagline}>
              Ingeniería y Saneamiento Ambiental
            </Text>
          </View>

          <Text style={styles.welcome}>Bienvenido de nuevo</Text>
          <Text style={styles.subtitle}>
            Ingresa tus credenciales para continuar
          </Text>

          {/* === FORMULARIO EN TARJETA === */}
          <View style={styles.formCard}>
            {/* Usuario */}
            <View style={styles.inputWrapper}>
              <Ionicons
                name="person-outline"
                size={22}
                color="#2E7D32"
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Usuario"
                value={user}
                onChangeText={setUser}
                style={styles.input}
                placeholderTextColor="#9E9E9E"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Contraseña */}
            <View style={styles.inputWrapper}>
              <Ionicons
                name="lock-closed-outline"
                size={22}
                color="#2E7D32"
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Contraseña"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                placeholderTextColor="#9E9E9E"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color="#757575"
                />
              </TouchableOpacity>
            </View>

            {/* Olvidaste contraseña */}
            <TouchableOpacity
              style={styles.forgotContainer}
              onPress={() =>
                alert(
                  "Comunícate al +51 941 719 133 y solicita un cambio de contraseña.\n\n" +
                    "Por temas de seguridad este proceso no se maneja de forma automática.",
                )
              }
            >
              <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            {/* Botón Ingresar */}
            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={loading}
            >
              <View style={styles.buttonContent}>
                {loading ? (
                  <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons
                    name="log-in-outline"
                    size={22}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                )}
                <Text style={styles.buttonText}>
                  {loading ? "Validando..." : "Ingresar"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>EnviroClean © 2026</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
