# Orden — Finanzas y tareas

PWA personal, 100 % offline. HTML + CSS + JS con módulos nativos, sin build ni dependencias.
Los datos viven solo en el dispositivo (IndexedDB); el respaldo se hace desde **Ajustes → Respaldo**.

## Desarrollo local

```bash
node tools/serve.mjs          # http://localhost:5173
node tools/check-assets.mjs   # verifica la lista de caché del service worker
```

Íconos (solo si cambia el diseño): `powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1`

## Publicar en GitHub Pages (gratis)

1. Crear un repositorio **público** vacío en GitHub, por ejemplo `orden`.
   El código queda visible; los datos no, porque nunca salen del celular.
2. Desde esta carpeta:
   ```bash
   git init -b main
   git add .
   git commit -m "Orden: primera versión"
   git remote add origin https://github.com/<usuario>/orden.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   rama `main`, carpeta `/ (root)`, **Save**.
4. En uno o dos minutos queda en `https://<usuario>.github.io/orden/` (con HTTPS, requisito para instalarla).

Alternativa con repositorio privado: Cloudflare Pages (plan gratuito), conectando el repositorio,
sin comando de build y con `/` como directorio de salida.

## Instalar en el celular

Abrir la URL publicada **con conexión** la primera vez (descarga todo para el uso offline).

- **Android (Chrome):** menú ⋮ → **Instalar aplicación** (o **Agregar a la pantalla principal**).
- **iPhone (Safari):** botón Compartir → **Agregar a pantalla de inicio**.
  Usar siempre el ícono instalado: en iOS sus datos son independientes de los de Safari.

Después de instalar:

1. Abrir **Ajustes** y verificar que diga *Almacenamiento persistente*; si no, tocar
   **Solicitar almacenamiento persistente**.
2. Probar offline: activar el modo avión, cerrar la app y volver a abrirla.

## Publicar una actualización

1. Hacer los cambios.
2. Subir `VERSION` en `sw.js` (por ejemplo, `v7` → `v8`) y agregar a `ASSETS` cualquier archivo nuevo.
3. `node tools/check-assets.mjs`
4. `git commit -am "…"` y `git push`.
5. En el celular, abrir la app con conexión: aparece **Hay una nueva versión disponible → Actualizar**.

## Monedas

Cada movimiento se carga en pesos o en dólares. Los totales nunca se mezclan ni se convierten:
**Movimientos** muestra un saldo por moneda y **Resumen** tiene un selector Pesos / Dólares, con su
propio ingreso fijo del período en cada moneda. Los datos anteriores a esta función quedan en pesos.

## Medios de pago

Cada gasto se marca con un medio de pago (Tarjeta y Mercado Pago de entrada; se agregan, renombran
o eliminan desde **Finanzas → ícono de etiqueta**, igual que las categorías). **Movimientos** muestra
los gastos por medio en cada saldo y permite ver un apartado a la vez; **Resumen** tiene la sección
**Gastos por medio de pago**. Los gastos cargados antes quedan como "Sin medio de pago" hasta editarlos.

## Carga desde capturas

**Finanzas → ícono de imagen**: se eligen capturas de los movimientos (banco, billetera, tarjeta),
el texto se lee en el dispositivo con Tesseract.js (`vendor/tesseract/`, ver su README) y se sugiere
la categoría según el historial y comercios conocidos (`js/modules/finance/classifier.js`).
Todo se revisa antes de guardar; los movimientos ya cargados se omiten.

El lector (≈ 6 MB) no se precarga: se descarga la primera vez que se usa (con conexión) y queda
en el caché `orden-vendor-1`, que se conserva entre versiones. Si se reemplazan los archivos de
`vendor/`, cambiar ese nombre en `sw.js`.

## Advertencias

- Los datos están atados a la dirección de la app. Si cambia la URL (otro nombre de repositorio,
  otro dominio), la app nueva arranca vacía: exportar antes y luego importar el respaldo.
- Desinstalar la app o borrar los datos del sitio en el navegador elimina todo. Exportar respaldos
  con regularidad (**Ajustes → Exportar datos** o **Compartir respaldo**) y guardarlos fuera del celular.
