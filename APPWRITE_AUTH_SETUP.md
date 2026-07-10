# Configuración manual de usuarios para EnviroClean

Esta versión reemplaza el ingreso fijo `admin/admin`, `worker/worker` y `client/client` por usuarios creados en la colección `app_users` de Appwrite.

## 1. Base de datos

Usar la base de datos existente:

```txt
enviroclean-db
```

## 2. Crear colección de usuarios

Crear una colección nueva con este ID exacto:

```txt
app_users
```

Nombre visible sugerido:

```txt
Usuarios de la app
```

## 3. Atributos de la colección `app_users`

Crear estos atributos:

| Atributo | Tipo | Tamaño | Requerido |
|---|---:|---:|---|
| username | string | 50 | Sí |
| usernameLower | string | 50 | Sí |
| passwordHash | string | 64 | Sí |
| role | string | 20 | Sí |
| name | string | 100 | Sí |
| active | boolean | - | Sí |
| createdAt | string | 40 | No |
| updateAt | string | 40 | No |

Valores permitidos para `role`:

```txt
admin
trabajador
cliente
```

## 4. Índice recomendado

Crear un índice para poder buscar por usuario:

```txt
Key: usernameLower_idx
Type: key
Attribute: usernameLower
Order: ASC
```

Si Appwrite permite marcarlo como único en tu versión, hacerlo único ayuda a evitar usuarios repetidos.

## 5. Permisos

Como esta versión usa la colección `app_users` desde la app móvil, configurar permisos en la colección:

```txt
Create: Any
Read: Any
Update: Any
Delete: Any
```

Nota: esta es una solución funcional para la app actual. Para una versión empresarial más segura, lo ideal sería migrar luego a Appwrite Auth + Functions.

## 6. Crear manualmente el primer administrador

Crear un documento manual en la colección `app_users` con estos valores exactos:

| Campo | Valor |
|---|---|
| username | EnviroRRHH |
| usernameLower | envirorrhh |
| passwordHash | a75bab0bd5bc1014f044fcb1943fe65e94753a6a6b479113cc531fe73a6db911 |
| role | admin |
| name | Enviro RRHH |
| active | true |
| createdAt | 09/07/2026 00:00:00 |
| updateAt | 09/07/2026 00:00:00 |

Con ese documento se podrá iniciar sesión así:

```txt
Usuario: EnviroRRHH
Contraseña: Enviro2026-
```

El usuario no distingue mayúsculas/minúsculas. Por ejemplo, `EnviroRRHH`, `envirorrhh` y `ENVIROrrhh` funcionarán igual. La contraseña sí debe escribirse exactamente como está.

## 7. Importante sobre API Keys

No guardar API Keys de Appwrite dentro del proyecto móvil. La app móvil solo usa:

```txt
Endpoint: https://nyc.cloud.appwrite.io/v1
Project ID: 6a46e8b90028a108e50f
```

La API Key solo sirve para tareas administrativas fuera de la app. Si una API Key fue compartida por chat o WhatsApp, es recomendable revocarla/regenerarla en Appwrite después de terminar la configuración.

## 8. Campos recomendados en la colección `records` para mostrar trabajador en Admin

Para que el panel administrador muestre qué trabajador envió cada formulario, agregar estos atributos opcionales en la colección `records`:

| Atributo | Tipo | Tamaño | Requerido |
|---|---:|---:|---|
| trabajadorId | string | 50 | No |
| trabajadorUsuario | string | 50 | No |
| trabajadorNombre | string | 100 | No |

Si estos campos todavía no existen, la app intenta guardar el registro sin romperse; pero el administrador mostrará `Trabajador: No registrado` en los registros que no tengan esos datos. Para que aparezca el nombre correctamente en los nuevos registros, crea estos tres atributos en Appwrite.
