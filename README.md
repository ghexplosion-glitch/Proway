# Proway Pedidos 1.0

App instalable para trabajar primero en el celular y, más adelante, en la computadora. Pedidos, imágenes, cobros, versiones y avances se guardan en una base local del dispositivo.

## Instalar en el celular

1. Abre la dirección HTTPS publicada de la app con conexión. Espera a que aparezca **Guardado en este equipo** y a que termine la carga.
2. En Android usa Chrome → menú → **Instalar app** o **Agregar a pantalla principal**. En iPhone usa Safari → Compartir → **Agregar a pantalla de inicio**.
3. Abre la app desde su icono. En **Tablas → Respaldo**, importa el archivo privado `Proway-pedidos-iniciales.json`, revisa el conteo y pulsa **Restaurar este respaldo**.
4. Comprueba el pedido seleccionado. Después prueba abrir la app en modo avión.

El código de esta entrega está preparado para publicar. La instalación en un celular requiere una dirección HTTPS; el ZIP por sí solo no crea esa dirección.

## Probar un pedido nuevo

1. **Inicio → Crear nuevo pedido.** Completa los campos verdes del cliente, prendas, tallas y corte Hombre o Mujer. El botón del formulario del cliente muestra únicamente su pedido.
2. **Cobro.** Confirma si pagará una persona física o moral. Fija el precio general o el especial por talla y corte. El precio inicial general es $800 con IVA incluido; puedes seleccionar “más IVA”.
3. Captura el depósito neto y, cuando exista, la retención real por separado. Valida el pago recibido. Los cobros ya validados permanecen en el control fiscal aunque después corrijas la cotización.
4. **Diseño.** Reemplaza la imagen de muestra desde la galería. Aprueba el diseño y valida pedido, cotización y anticipo. Inicia entonces el plazo de 20 días hábiles.
5. Valida la impresión para pasar a **Costura**, valida la costura para pasar a **Empaque**, comprueba piezas y etiquetas, y libera a **Envío**.
6. Captura paquetería, guía, fechas y estado. El historial de envío se actualiza manualmente.

El conteo por producto, talla y corte se calcula desde el mismo listado. Las tarifas de sublimación y short conservadas en el respaldo se usan para el costo interno. Los precios y costos se consultan en sus pestañas; las medidas no aparecen en el costeo.

## Documentos y cliente

- Cada sección ofrece **Vista previa** y **Exportar** en PDF y Excel. El PDF incluye los registros completos y las imágenes cargadas. Las etiquetas se distribuyen en cuatro columnas.
- El Excel de cotización permite corregir cantidad y precio en las celdas verdes. Sus importes, IVA, retención y saldo estimado se recalculan con fórmulas.
- La exportación para Google Sheets descarga un Excel. Con conexión, impórtalo en Sheets para crear una hoja editable.
- **Compartir cotización** prepara un enlace de consulta cuando la app está publicada en HTTPS. Incluye solo cotización y miniaturas de diseño, y conserva la versión enviada. Quien reciba el enlace puede verlo. El PDF conserva el diseño con mayor resolución.
- Puedes compartir el PDF mediante el menú del celular o descargarlo. La app abre el menú; tú eliges destinatario y confirmas el envío.
- La importación acepta `.xlsx`, CSV y TSV. Revisa la hoja y el tratamiento del precio antes de confirmar. Para archivos `.xls` antiguos, guarda primero como `.xlsx`. Una hoja de Google Sheets compartida para lectura puede importarse con conexión; para hojas privadas, descarga el Excel.
- Al importar un listado en un pedido existente, se conservan sus datos de contacto. Las filas idénticas se omiten al agregar; el código de diseño forma parte de la comparación.

## RESICO persona física

Proway está configurado como emisor persona física, régimen 626. Completa el nombre fiscal, RFC y código postal reales en **Tablas → Precios**.

- Para venta de prendas a persona moral, se estima la retención de ISR del 1.25% sobre el subtotal sin IVA y se muestra el neto a pagar.
- El control mensual interno calcula ISR sobre los cobros validados sin IVA, con la tabla mensual del artículo 113-E. No descuenta costos de producción.
- Las retenciones registradas se acreditan en la estimación cuando se marcan como respaldadas en CFDI. Puedes agregar ingresos RESICO fuera de la app para completar el mes, sin duplicar los pedidos registrados.
- La cotización es una **proforma sin timbrar**. Esta versión no timbra CFDI ni presenta declaraciones al SAT. El cálculo mensual es una estimación que debe conciliarse con los CFDI y los demás ingresos del régimen.

Fuentes: [LISR, artículos 113-E y 113-J](https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf), [Ley del IVA](https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf), [requisitos de facturación SAT](https://www.sat.gob.mx/minisitio/Factura/solicita_requisitos.htm).

## Computadora y respaldos

Cuando tengas computadora, abre la misma dirección de la app e instálala desde Chrome o Edge. Descarga un respaldo completo del celular e impórtalo en la computadora; así conservas el mismo perfil local y los pedidos.

La sincronización automática entre equipos y el respaldo automático a Drive no están conectados en esta versión. Por ahora, el traslado es mediante el archivo de respaldo. Usa un equipo como base principal y respáldalo antes de restaurar en otro para conservar una versión completa. Los datos y diseños no se publican junto con el código.

## Publicar desde GitHub

El código de la app se mantiene en [ghexplosion-glitch/Proway](https://github.com/ghexplosion-glitch/Proway). El archivo privado de pedidos iniciales y los respaldos van separados del repositorio y de la carpeta pública `www`.

Para Cloudflare Pages: conecta el repositorio, usa **Framework preset: None**, comando de compilación vacío y **Build output directory: www**. La app es estática y ya incluye sus bibliotecas para trabajar sin conexión. También puedes usar la carga directa de la carpeta `www` en Pages.

Fuentes: [Cloudflare: HTML estático](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/), [instalación PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Ejecutar y comprobar el código

Con Node.js 20 o posterior:

```sh
node server.mjs
```

Abre `http://localhost:4173` en esa computadora. Para las pruebas:

```sh
npm ci
npx playwright install chromium
npm test
```

Docker es opcional para servir la app desde una computadora del taller:

```sh
docker compose up --build -d
```

Abre `http://localhost:8080`. Docker sirve los archivos; los pedidos siguen guardándose en cada dispositivo. Para instalar y usar el modo sin conexión en teléfonos, publica con HTTPS.

## Actualizar

Incrementa la versión del caché en `www/sw.js` en cada publicación. Cuando el dispositivo tenga conexión, detectará la nueva versión y mostrará **Actualizar app**. Ese botón guarda los cambios antes de cargar la actualización; la base local se conserva.

Las bibliotecas están incluidas en `www/vendor` con sus licencias. La app no necesita CDNs ni instalar paquetes para su uso normal.
