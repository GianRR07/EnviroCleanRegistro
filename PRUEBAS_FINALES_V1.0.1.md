# EnviroClean Registro — versión de pruebas 1.0.1

## Correcciones incorporadas

### 1. Navegación segura por rol

- Se añadió una protección global de rutas basada en la sesión activa.
- Un administrador solo puede permanecer en `/admin`.
- Un cliente solo puede permanecer en `/client`.
- Un trabajador solo puede permanecer en `/worker`.
- El botón físico de retroceso cierra primero cámaras, vistas previas o modales.
- En pantallas secundarias del trabajador, retroceder vuelve al panel del trabajador.
- En los paneles principales, retroceder sale de la aplicación sin atravesar pantallas de otra sesión.

### 2. Detalle completo de registros

Los paneles de trabajador, cliente y administrador muestran:

- nombre del cliente;
- tipo de servicio;
- tipo de estación principal;
- detalle de estación;
- área de trabajo;
- observaciones generales;
- cantidad de estaciones;
- número y ubicación de cada estación;
- foto de estado encontrado;
- foto de estado final;
- foto del formato físico;
- fecha y hora de cada foto;
- coordenadas GPS de cada foto;
- acceso para abrir la ubicación en Google Maps.

Los campos adicionales del formulario se conservan dentro del JSON `boxes`, sin exigir atributos nuevos en la colección `records` de Appwrite.

> Los registros creados antes de esta versión solo mostrarán la información que efectivamente se guardó en su momento. Los nuevos registros conservarán todos los campos.

### 3. Registro de incidencias reorganizado

- Los registros se seleccionan mediante tarjetas horizontales.
- Al elegir un registro, sus datos se muestran inmediatamente.
- Las estaciones aparecen como selectores visibles y ordenados.
- Al elegir una estación, sus fotografías quedan visibles en la misma sección.
- Las no conformidades seleccionadas se conservan mientras se revisan distintas estaciones.

### 4. Trabajo sin conexión

- Las fotografías se copian al directorio persistente de la aplicación antes de cualquier subida.
- El registro se guarda primero en AsyncStorage.
- Si Appwrite no está disponible, el registro queda marcado como pendiente.
- La aplicación reintenta la sincronización cada 20 segundos mientras la pantalla correspondiente está activa.
- El trabajador dispone de un botón de sincronización manual.
- El borrador no puede borrarse mientras exista un registro pendiente de envío.
- Se evitó la sincronización simultánea durante el guardado para no crear registros o archivos duplicados.

## Validaciones realizadas

- `npx tsc --noEmit`: correcto.
- `npx expo lint`: correcto.
- `npx expo config --type public`: correcto.
- `npm ls react-native-fast-base64 react-native-buffer --all`: vacío.
- `app.json` y `package.json`: JSON válido.
- Perfil EAS `preview`: configurado para generar APK.
- Perfil EAS `production`: configurado para generar AAB.

## Instalación y ejecución

```powershell
npm install
npx expo start --clear
```

## Crear la APK de pruebas

```powershell
eas build --platform android --profile preview
```

## Pruebas de aceptación recomendadas

1. Iniciar como trabajador, abrir formulario e historial y usar varias veces el botón físico Atrás.
2. Cerrar sesión, iniciar como cliente y confirmar que Atrás nunca abre una pantalla del trabajador.
3. Repetir la prueba con administrador.
4. Crear un registro nuevo y comprobar todos los campos en los tres paneles.
5. Revisar las tres fotos de cada estación, fecha, hora y GPS.
6. Activar modo avión, tomar fotos y guardar un registro.
7. Cerrar y abrir la aplicación: el registro pendiente debe seguir visible.
8. Recuperar internet y pulsar **Sincronizar ahora**.
9. Confirmar en administrador y cliente que el registro aparece una sola vez.
10. Crear una incidencia y cambiar entre estaciones; la estación seleccionada debe mostrarse inmediatamente.
