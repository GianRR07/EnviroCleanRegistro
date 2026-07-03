import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

export default function Login() {
  const router = useRouter();

  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    if (!user.trim() || !password.trim()) {
      alert("Por favor completa todos los campos");
      return;
    }

    const trimmedUser = user.trim().toLowerCase();

    if (trimmedUser === "admin") {
      router.replace("/admin");
    } else if (trimmedUser === "worker") {
      router.replace("/worker");
    } else if (trimmedUser === "client") {
      router.replace("/client");
    } else {
      alert("Usuario inválido. Prueba con: admin, worker o client");
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
              style={styles.button}
              onPress={handleLogin}
              activeOpacity={0.85}
            >
              <View style={styles.buttonContent}>
                <Ionicons
                  name="log-in-outline"
                  size={22}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.buttonText}>Ingresar</Text>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F1F8E9", // Fondo verde muy suave (toque ambiental)
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    paddingBottom: 20,
  },

  // === LOGO ===
  logoContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoEnviro: {
    fontSize: 38,
    fontWeight: "800",
    color: "#2E7D32", // Verde de tu marca
    letterSpacing: 0.5,
  },
  logoClean: {
    fontSize: 38,
    fontWeight: "800",
    color: "#1565C0", // Azul de tu marca
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 13,
    color: "#546E7A",
    marginTop: 4,
    fontWeight: "500",
    textAlign: "center",
  },

  welcome: {
    fontSize: 26,
    fontWeight: "700",
    color: "#212121",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: "#616161",
    textAlign: "center",
    marginBottom: 28,
  },

  // === TARJETA DEL FORMULARIO ===
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 26,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#212121",
    paddingVertical: 15,
  },
  eyeButton: {
    padding: 6,
    marginLeft: 8,
  },

  forgotContainer: {
    alignSelf: "flex-end",
    marginBottom: 22,
  },
  forgotText: {
    color: "#2E7D32",
    fontSize: 14,
    fontWeight: "600",
  },

  button: {
    backgroundColor: "#2E7D32",
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: "#2E7D32",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },

  footer: {
    textAlign: "center",
    color: "#9E9E9E",
    fontSize: 12,
    marginTop: 40,
  },
});
