# Corrección: “Trabajador no registrado”

## Diagnóstico

El panel administrador no era el origen del problema. El documento guardado en Appwrite llegaba con:

```txt
idUser: null
trabajadorId: ausente
trabajadorUsuario: ausente
trabajadorNombre: ausente
```

Por ello, el administrador aplicaba correctamente el texto de respaldo `No registrado`.

La causa estaba en `src/utils/appwriteRecords.ts`: cuando Appwrite rechazaba los atributos `trabajadorId`, `trabajadorUsuario` o `trabajadorNombre` por no existir en la colección, el código reintentaba el guardado eliminando toda la identidad del trabajador.

## Cambios realizados

1. `src/app/worker/form.tsx`
   - La sesión activa se consulta nuevamente justo antes de guardar.
   - Se exige que la sesión tenga rol `trabajador` y un ID válido de Appwrite.
   - Ya no se reutiliza la identidad almacenada en un borrador local, evitando atribuciones al trabajador anterior del dispositivo.

2. `src/utils/appwriteRecords.ts`
   - Se guarda el `$id` del trabajador en la relación existente `idUser`.
   - Se intenta guardar también los campos descriptivos `trabajador*` cuando existen.
   - Si esos tres campos no existen, se reintenta conservando `idUser` en lugar de eliminar toda la identidad.
   - La lectura reconoce `idUser` como ID o como documento relacionado.
   - Se amplió la lectura a 100 registros e incidencias.

3. `src/app/admin/index.tsx`
   - Se cargan registros, incidencias y usuarios en una sola operación.
   - Cada registro se relaciona con `app_users` mediante `idUser`.
   - El nombre y usuario se completan desde el documento del trabajador.

4. `src/utils/authUsers.ts`
   - Se amplió la consulta a 100 usuarios para que la resolución no quede limitada a los primeros 25.

5. `src/types/assets.d.ts`
   - Se añadieron declaraciones para archivos CSS, permitiendo ejecutar la comprobación de TypeScript correctamente.

## Resultado esperado en un registro nuevo

En los logs del administrador deberá aparecer algo similar a:

```json
{
  "idUser": "ID_DEL_DOCUMENTO_APP_USERS",
  "trabajadorId": "ID_DEL_DOCUMENTO_APP_USERS",
  "trabajadorUsuario": "usuario.trabajador",
  "trabajadorNombre": "Nombre del trabajador"
}
```

Aunque la colección no tenga los tres atributos `trabajador*`, debe aparecer al menos:

```json
{
  "idUser": "ID_DEL_DOCUMENTO_APP_USERS"
}
```

El panel administrador podrá resolver el nombre consultando `app_users`.

## Registros antiguos

Los registros existentes con `idUser: null` continuarán mostrando `No registrado`. No es posible determinar automáticamente quién los creó. Deben editarse manualmente en Appwrite y asignarles el documento correcto de `app_users`, siempre que se conozca al trabajador.

## Validación realizada

```txt
npx tsc --noEmit
TYPECHECK_OK
```
