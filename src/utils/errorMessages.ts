export const translateAppwriteError = (
  error: any,
  fallback = "Ocurrió un error inesperado. Intenta nuevamente.",
) => {
  const rawMessage = String(error?.message ?? "");
  const message = rawMessage.toLowerCase();
  const type = String(error?.type ?? "").toLowerCase();
  const code = Number(error?.code ?? 0);

  // Errores generados por nuestra propia validación local.
  // Estos no vienen de Appwrite, por eso se deben mostrar tal cual.
  if (!error?.code && !error?.type && rawMessage) {
    const localMessages = [
      "completa usuario y contraseña",
      "escribe un usuario",
      "la contraseña debe tener al menos",
      "selecciona un rol válido",
      "ya existe un usuario",
      "usuario o contraseña incorrectos",
      "este usuario está inactivo",
      "este usuario no tiene un rol válido",
    ];

    if (localMessages.some((text) => message.includes(text))) {
      return rawMessage;
    }
  }

  if (
    code === 401 ||
    code === 403 ||
    message.includes("current user is not authorized") ||
    message.includes("not authorized") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("missing scope") ||
    type.includes("unauthorized") ||
    type.includes("forbidden") ||
    type.includes("scope")
  ) {
    return "No tienes permisos para realizar esta acción. Revisa los permisos de Appwrite o comunícate con el administrador.";
  }

  if (
    message.includes("collection with the requested id") ||
    message.includes("collection_not_found") ||
    type.includes("collection_not_found")
  ) {
    return "No se encontró una colección necesaria en Appwrite. Revisa que la base de datos tenga las colecciones configuradas correctamente.";
  }

  if (
    message.includes("document with the requested id") &&
    message.includes("could not be found")
  ) {
    return "No se encontró el registro solicitado en la base de datos.";
  }

  if (
    message.includes("document with the requested id already exists") ||
    message.includes("already exists") ||
    type.includes("document_already_exists")
  ) {
    return "Ya existe un registro con esos datos. Verifica la información antes de volver a guardar.";
  }

  if (
    message.includes("invalid credentials") ||
    message.includes("invalid password") ||
    message.includes("user_invalid_credentials") ||
    type.includes("user_invalid_credentials")
  ) {
    return "Usuario o contraseña incorrectos.";
  }

  if (
    message.includes("invalid document structure") ||
    type.includes("document_invalid_structure")
  ) {
    if (message.includes("password") || message.includes("contraseña")) {
      return "La contraseña no cumple los requisitos. Usa al menos 6 caracteres.";
    }

    if (message.includes("missing required attribute")) {
      return "Falta completar un campo obligatorio en Appwrite. Revisa que todos los atributos requeridos estén llenos.";
    }

    if (message.includes("unknown attribute")) {
      return "El sistema está enviando un campo que no existe en Appwrite. Revisa que los atributos de la colección coincidan con el código.";
    }

    return "Hay un problema con la estructura del documento en Appwrite. Revisa que los atributos coincidan con los del sistema.";
  }

  if (
    message.includes("password") &&
    (message.includes("6") || message.includes("characters") || message.includes("short"))
  ) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }

  if (
    message.includes("attribute") &&
    (message.includes("unknown") || message.includes("invalid") || message.includes("required"))
  ) {
    return "Hay un problema con los campos configurados en Appwrite. Revisa que los atributos de la colección coincidan con los del sistema.";
  }

  if (
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("timeout")
  ) {
    return "No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta nuevamente.";
  }

  return fallback;
};
