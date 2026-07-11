# Corrección V2: trabajador mostrado como “No registrado”

## Diagnóstico confirmado por los logs

La sesión sí contiene correctamente al trabajador antes del envío:

- ID: `6a506e99000f8b5885da`
- Usuario: `JuanWK`
- Nombre: `Juan Risco`

El problema ocurre en Appwrite. La colección `records` rechaza:

1. `idUser` junto con los campos `trabajador*`.
2. `idUser` por sí solo.
3. Los campos `trabajadorId`, `trabajadorUsuario` y `trabajadorNombre`.

La versión anterior terminaba guardando únicamente los datos básicos, por eso el documento regresaba con `idUser: null` y el panel mostraba “No registrado”.

## Solución V2

La identidad del trabajador se guarda también dentro del JSON ya admitido por el atributo `boxes`, usando la clave reservada:

```json
"__envirocleanWorker": {
  "id": "ID_DEL_TRABAJADOR",
  "appwriteId": "ID_DEL_TRABAJADOR",
  "username": "USUARIO",
  "name": "NOMBRE"
}
```

Al leer el registro, `getRecordsAppwrite()` extrae este metadato, lo elimina de la lista de estaciones y reconstruye:

- `trabajadorId`
- `trabajadorUsuario`
- `trabajadorNombre`
- `worker`

Esto funciona sin crear atributos nuevos en Appwrite.

## Compatibilidad adicional

El código ahora prueba `idUser` en ambos formatos:

- Relación singular: `idUser: "ID"`
- Relación múltiple: `idUser: ["ID"]`

También imprime el error real de Appwrite para conocer la configuración exacta de la relación.

## Log esperado

Si Appwrite sigue rechazando todos los atributos de identidad, debe aparecer:

```text
👤 Identidad guardada mediante: identidad embebida en boxes
✔ Registro guardado: ID_DEL_REGISTRO
```

Después, al recargar desde Appwrite, el registro normalizado debe contener:

```json
"trabajadorId": "6a506e99000f8b5885da",
"trabajadorUsuario": "JuanWK",
"trabajadorNombre": "Juan Risco"
```

## Importante

Los registros creados antes de instalar esta V2 seguirán sin identidad porque ya fueron almacenados sin el metadato. La prueba debe realizarse con un registro nuevo.
