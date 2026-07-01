import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";

export default function Login() {
  const router = useRouter();

  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
  if (user === "admin") {
    router.replace("/admin");
  } else if (user === "worker") {
    router.replace("/worker");
  } else if (user === "client") {
    router.replace("/client");
  } else {
    alert("Usuario inválido");
  }
};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>EnviroClean</Text>

      <TextInput
        placeholder="Usuario"
        value={user}
        onChangeText={setUser}
        style={styles.input}
      />

      <TextInput
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Ingresar</Text>
      </TouchableOpacity>
    </View>
  );
}

/* 👇 AQUÍ VA EL STYLES (AL FINAL DEL ARCHIVO) */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    paddingHorizontal: 25,
  },

  title: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30,
    color: "#111",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
    color: "#000",
  },

  button: {
    backgroundColor: "#2E7D32",
    padding: 14,
    borderRadius: 10,
  },

  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
});