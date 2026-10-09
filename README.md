# Proway Pedidos 1.1

App instalable para trabajar primero en el celular y, más adelante, en la computadora. Pedidos, imágenes, cobros, versiones y avances se guardan en una base local del dispositivo. La colaboración sincroniza los pedidos con el equipo cuando hay conexión.

## Instalar en el celular

1. Abre la dirección HTTPS publicada de la app con conexión. Espera a que aparezca **Guardado en este equipo** y a que termine la carga.
2. En Android usa Chrome → menú → **Instalar app** o **Agregar a pantalla principal**. En iPhone usa Safari → Compartir → **Agregar a pantalla de inicio**.
3. Abre la app desde su icono. Para colaboración, el propietario usa su invitación privada de primer acceso y crea su cuenta. Los demás entran mediante invitaciones creadas por el propietario en **Equipo**. Para trabajar solo en este dispositivo, puedes importar tu respaldo en **Tablas → Respaldo**.
4. Comprueba el pedido seleccionado. Después prueba abrir la app en modo avión.

La app está publicada en [proway-pedidos.netlify.app](https://proway-pedidos.netlify.app/). La instalación en un celular requiere HTTPS.

## Probar un pedido nuevo

1. **Inicio → Crear nuevo pedido.** Completa los campos verdes del cliente, prendas, tallas y corte Hombre o Mujer. El botón del formulario del cliente muestra únicamente su pedido.
2. **Cobro.** Elige si el cliente verá el desglose de IVA o solo los precios finales, el anticipo y el saldo. La retención de ISR de personas morales se muestra cuando corresponde. Confirma si pagará una persona física o moral. Fija el precio general o el especial por talla y corte. El precio inicial general es $800 con IVA incluido; puedes seleccionar “más IVA”.
3. Captura el depósito neto y, cuando exista, la retención real por separado. Valida el pago recibido. Los cobros ya validados permanecen en el control fiscal aunque después corrijas la cotización.
4. **Diseño.** Elige un diseño rápido rojo o azul con vista delantera y trasera, reemplázalo desde la galería y guarda otras parejas de imágenes en el catálogo. Aprueba el diseño y valida pedido, cotización y anticipo. Inicia entonces el plazo de 20 días hábiles.
5. Valida la impresión para pasar a **Costura**, valida la costura para pasar a **Empaque**, comprueba piezas y etiquetas, y libera a **Envío**.
6. Captura paquetería, guía, fechas y estado. El historial de envío se actualiza manualmente.

El conteo por producto, talla y corte se calcula desde el mismo listado. Las tarifas de sublimación y short conservadas en el respaldo se usan para el costo interno. Los precios y costos se consultan en sus pestañas; las medidas no aparecen en el costeo. **Tablas → Pago de sublimación y corte** reúne el pago del proveedor por producto, talla y corte. Agrega errores o impresiones extra y marca si también requieren corte. Estos extras no aumentan las prendas del cliente. Puedes elegir sin IVA adicional, más IVA o IVA incluido. Una tarifa faltante se muestra como pendiente; completa la tabla antes de pagar. La hoja Excel permite editar cantidades y tarifas y recalcula los importes.

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

Cuando tengas computadora, abre la misma dirección e instala la app desde Chrome o Edge. En **Equipo**, entra con la misma cuenta del celular. Los pedidos compartidos se descargan al conectar; cada dispositivo conserva una copia para trabajar sin internet.

- Cada colaborador tiene su propia cuenta. Administración ve y edita precios, pagos, tarifas y permisos. Diseño libera la impresión; Costura / armado valida el cosido; Empaque valida el paquete; Envío captura paquetería y guía. Consulta solo revisa los datos de producción.
- El servidor entrega a los departamentos un listado sin precios, anticipos, pagos ni datos fiscales. Las tareas se validan en orden; no se puede saltar una etapa.
- **Equipo → Sincronizar ahora** envía los cambios pendientes. También se sincronizan al recuperar internet y durante el uso de la app. Si dos personas modifican campos diferentes se combinan; si cambian el mismo campo, revisa las copias antes de elegir.
- Al entrar por primera vez, **Equipo → Pedidos que ya tenías en este equipo** permite revisar y compartir tus pedidos locales anteriores. La base local original y su respaldo se conservan. No incorpores un pedido vacío sobre uno que tiene prendas.
- Las invitaciones de colaboradores son de un solo uso y duran siete días. Puedes limitar una invitación a un correo y cambiar o desactivar permisos. La primera invitación del propietario se entrega por separado; no va en el código público.
- Descargar un respaldo completo sigue siendo útil para conservar versiones y archivos. El respaldo automático a Google Drive no está conectado. La sincronización de equipo usa Supabase.
- Cerrar sesión oculta la cuenta anterior y conserva su copia para el siguiente acceso. Sin internet se usa el último permiso autorizado; una revocación se comprueba al volver a conectar.

## Backend de colaboración

`backend/proway-collaboration.sql` define el esquema privado, la validación del proceso y la API con control de roles. Aplica el SQL en un proyecto propio y configura el URL, la clave **publicable** y el identificador del espacio en `www/cloud-config.js`. El esquema evita acceso directo a tablas desde clientes.

`backend/proway-cuentas/index.ts` permite crear cuentas únicamente con una invitación válida. La clave de servicio se usa dentro de la función del servidor; nunca va en `www` ni en el repositorio. Despliega esta función con el nombre `proway-cuentas`. No se cambia la configuración de registro de otras aplicaciones del proyecto.

La creación inicial del espacio de trabajo y la invitación del propietario son una operación administrativa separada. Los datos reales, correos, contraseñas, invitaciones y respaldos quedan fuera de GitHub. La carpeta pública solo contiene código, imágenes de muestra y configuración publicable.

## Publicar desde GitHub

El código de la app se mantiene en [ghexplosion-glitch/Proway](https://github.com/ghexplosion-glitch/Proway). El archivo privado de pedidos iniciales y los respaldos van separados del repositorio y de la carpeta pública `www`.

Para Netlify: en tu cuenta importa el repositorio **Proway** desde GitHub, selecciona la rama **main**, deja vacío el comando de compilación y usa **www** como directorio de publicación. El archivo `netlify.toml` ya conserva esta configuración y permite que el navegador detecte las actualizaciones de la app. La app es estática y ya incluye sus bibliotecas para trabajar sin conexión.

La carpeta local `.netlify` está excluida de Git para mantener separada la configuración de acceso al proyecto. Publicar consume los créditos incluidos en tu plan de Netlify; comprueba el saldo en **Usage & billing**.

Fuentes: [Netlify: configuración](https://docs.netlify.com/build/configure-builds/file-based-configuration/), [instalación PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Ejecutar y comprobar el código

Con Node.js 22 o posterior (24 recomendado):

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
