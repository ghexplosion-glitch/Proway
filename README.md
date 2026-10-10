# Proway Pedidos 1.7.0

La versión 1.7.0 agrega **Inicio con pendientes**, **Historial → Cerrados**, **Dinero → Cortes** y **Repetir pedido**. Mantiene las etiquetas Carta y el detalle de nombres, colores y diseños de la cotización.

## Cierre, pendientes y repetición (1.7)

- Un pedido aprobado, con prendas, **entrega confirmada y saldo liquidado** se cierra automáticamente. Sale de la selección y de las listas de trabajo activo. Un pedido pagado pendiente de entrega sigue en producción; uno entregado con saldo aparece en **Por cobrar**. Los pagos, gastos, diseños, prendas y documentos se conservan en el mismo registro y siguen incluidos en Dinero.
- **Historial → Cerrados** permite consultar el expediente y su cotización. El cierre es una vista calculada a partir de campos existentes: no mueve ni elimina registros ni requiere una migración de base. Si se modifica el precio general, las prendas cerradas que lo usaban conservan su precio anterior como precio especial.
- **Inicio** muestra abiertos, cotizaciones por aprobar, por cobrar, envíos y alertas. Las alertas identifican únicamente la siguiente etapa responsable: diseño día hábil 5, costura 15, empaque 18 y salida 20. La entrega usa la fecha estimada de la paquetería. El calendario del taller determina días hábiles y festivos.
- **Repetir pedido con folio nuevo** conserva cliente, prendas, nombres, colores y diseños, con identificadores nuevos. Comienza sin pagos, devoluciones, aprobación, validaciones de producción ni guía anterior. Crea primero un respaldo y evita crear dos folios con un doble toque. Revisa precios, prendas y diseño antes de aprobar la nueva cotización.
- Las vistas nuevas usan la base local y la misma sincronización del equipo. Las alertas se consultan dentro de la app; esta versión no envía mensajes ni notificaciones fuera de ella.

## Cortes de dinero (1.7)

**Dinero → Cortes** permite elegir una semana de lunes a domingo, un mes o fechas personalizadas, y seleccionar los pedidos que sumarán. Incluye abiertos y cerrados; los gastos generales son opcionales y se suman una sola vez. Los anticipos capturados sin validar nunca se consideran ingresos recibidos.

El corte separa cobros originales, devoluciones pagadas, egresos, resultado de caja del período, saldo anterior y saldo acumulado de la selección. Los saldos se basan en los movimientos registrados, por lo que deben conciliarse con los comprobantes. La base, el IVA y la retención se muestran según el tratamiento histórico de cada pago, sin cambiar el precio de las prendas.

La utilidad prevista se muestra por pedido completo, con sus costos actuales, para los pedidos con movimientos en el período. No representa una utilidad mensual: los gastos generales aparecen en caja y no se distribuyen entre clientes. **Dinero → Resumen** mantiene la previsión global con sus gastos generales. El corte no modifica el cálculo ni los registros de ISR.

El PDF y las tres hojas Excel del corte usan **Carta horizontal**. Incluyen los movimientos, el desglose por cliente y la utilidad prevista. Los gastos generales tienen una fila separada para conciliar los totales. En Excel se pueden corregir los movimientos y recalcular los totales de efectivo; las tablas de referencia conservan los importes al emitir el documento. El Excel también puede importarse en Google Sheets con conexión.

La versión 1.6.3 muestra **todas las etiquetas seleccionadas** en la app, agrupadas por hoja y con las posiciones usadas indicadas. El PDF de etiquetas usa **Carta (21.59 × 27.94 cm)**, con 24 posiciones por hoja: 4 columnas y 6 filas. La altura de las etiquetas se ajusta a Carta para que la última fila quede dentro del papel. El Excel de etiquetas también queda configurado para impresión en Carta. Se conserva el detalle de colores y nombres de la cotización incorporado en 1.6.2.

La versión 1.6.2 agrega **Prendas para revisar** a la cotización: producto, talla, corte, cantidad, color y nombre impreso de cada fila de Pedido. El detalle aparece en la vista previa, PDF, enlace del cliente y la hoja **Prendas para revisión** del Excel, tanto con IVA como sin desglose. Los precios mantienen su resumen por talla y corte. Los documentos y enlaces emitidos antes de la actualización conservan su versión original; para enviar el nuevo detalle hay que generar una cotización nueva desde el pedido.

La versión 1.6.1 elimina el resumen contable duplicado de **Taller sublimación → Precios**, que incluía cotizaciones descartadas en el total. Esa pantalla conserva precio general y datos fiscales, con un acceso a **Dinero** para consultar y exportar los totales de la selección. Las cotizaciones descartadas permanecen en Historial y los pedidos, cobros y gastos guardados se conservan.

## Vista de prueba 1.5.1

`/prueba/` contiene una vista funcional independiente para revisar la siguiente actualización en celular y computadora. Se inicia con cinco pedidos ficticios, usa `proway-prueba-v15` en IndexedDB y no tiene acceso a la cuenta ni al espacio de colaboración real. Solo acepta sus propios respaldos. La app principal 1.6 incorpora estas funciones, mantiene la base anterior y conecta con el equipo real.

- Control de dinero tiene pestaña propia, selección de pedidos y apartados separados para aprobados y cotizaciones pendientes. Exportar mantiene la misma selección. Los gastos generales son opcionales y se descuentan una sola vez.
- Los precios capturados son base: la casilla Agregar IVA suma 16% sin descontarlo del precio ni del costo de sublimación/corte. La cotización muestra el desglose únicamente al agregarlo. La utilidad operativa es venta base menos costos base, antes de ISR; el IVA se muestra aparte para conciliación, sin acreditar impuestos automáticamente.
- Aprobar no registra efectivo. Los anticipos solo cuentan tras validarse y los pagos guardan el tratamiento fiscal vigente cuando se registraron. Corregir precios invalida aprobación/producción y conserva los cobros reales. Descartar una cotización sin pagos conserva filas, imágenes y versiones.
- Pedido permite aplicar un color a filas seleccionadas, a todas las prendas o a las que comparten un color actual. Las cantidades y los precios se conservan.
- Cotización, PDF, Excel y enlace incluyen proway.com.mx y WhatsApp 33 1007 9695. El icono de prueba tiene fondo blanco y el emblema Proway ampliado.
- Ejecuta `npm run test:preview` para comprobar captura, aprobación, efectivo, IVA, selección, colores, imágenes, documentos, departamentos, envío, almacenamiento aislado y apertura sin conexión. La colaboración real se sigue comprobando con las pruebas de la aplicación principal.

Para probar: abre la vista de prueba, elige Pedido nuevo de prueba, agrega prendas en Pedido, revisa los datos, continúa a Cobro, selecciona tipo de cliente, activa IVA si corresponde y pulsa Aprobar cotización. Registra y valida un anticipo ficticio para continuar por Taller. Los datos de prueba permanecen únicamente en ese dispositivo.

Para actualizar el servidor de producción se aplica backend/proway-operations.sql. La carpeta de prueba sigue usando su propia base sin acceso al equipo real.

App instalable para trabajar primero en el celular y, más adelante, en la computadora. Pedidos, imágenes, cobros, versiones y avances se guardan en una base local del dispositivo. La colaboración sincroniza los pedidos con el equipo cuando hay conexión.

## Instalar en el celular

1. Abre la dirección HTTPS publicada de la app con conexión. Espera a que aparezca **Guardado en este equipo** y a que termine la carga.
2. En Android usa Chrome → menú → **Instalar app** o **Agregar a pantalla principal**. En iPhone usa Safari → Compartir → **Agregar a pantalla de inicio**.
3. Abre la app desde su icono. Para colaboración, el propietario usa su invitación privada de primer acceso y crea su cuenta. Los demás entran mediante invitaciones creadas por el propietario en **Equipo**. Para trabajar solo en este dispositivo, puedes importar tu respaldo en **Dinero → Respaldo**.
4. Comprueba el pedido seleccionado. Después prueba abrir la app en modo avión.

La app está publicada en [proway-pedidos.netlify.app](https://proway-pedidos.netlify.app/). La instalación en un celular requiere HTTPS.

## Probar un pedido nuevo

1. **Inicio → Crear nuevo pedido.** Completa los campos verdes del cliente, prendas, tallas y corte Hombre o Mujer. El botón del formulario del cliente muestra únicamente su pedido.
2. **Cobro.** Elige si el cliente verá el desglose de IVA o solo los precios finales, el anticipo y el saldo. La retención de ISR de personas morales se muestra cuando corresponde. Confirma si pagará una persona física o moral. Fija el precio general o el especial por talla y corte. El precio general inicial es $800 base: no se descuenta IVA. **Agregar IVA** suma 16% y muestra el desglose; sin marcarlo se envía el precio, anticipo y saldo. Usa **Aprobar cotización** después de revisar el pedido.
3. Captura el depósito neto y, cuando exista, la retención real por separado. Valida el pago recibido. Los cobros ya validados permanecen en el control fiscal aunque después corrijas la cotización.
4. **Diseño.** Elige las imágenes originales Proway rojo o azul con vista delantera y trasera. Desde Pedido, Cobro o Diseño puedes agregar hasta ocho diseños adicionales a la misma cotización, nombrarlos y cargar sus imágenes desde la galería. Escribe el nombre o código en la columna Diseño de las prendas correspondientes. Aprueba el diseño y valida pedido, cotización y anticipo. Inicia entonces el plazo de 20 días hábiles.
5. Valida la impresión para pasar a **Costura**, valida la costura para pasar a **Empaque**, confirma conteo físico, nombres/tallas y diseño/colores, valida Calidad y libera a **Envío**.
6. Captura paquetería, guía, fechas y estado. El historial de envío se actualiza manualmente.

El conteo por producto, talla y corte se calcula desde el mismo listado. Las tarifas de sublimación y short conservadas en el respaldo se usan para el costo interno. Los precios y costos se consultan en sus pestañas; las medidas no aparecen en el costeo. **Taller sublimación → Pago de sublimación y corte** reúne el pago del proveedor por producto, talla y corte. Agrega errores o impresiones extra y marca si también requieren corte. Estos extras no aumentan las prendas del cliente. Puedes elegir sin IVA adicional o más IVA. Los importes capturados siempre son base. Una tarifa faltante se muestra como pendiente; completa la tabla antes de pagar. La hoja Excel permite editar cantidades y tarifas y recalcula los importes.

## Pagos conjuntos y control de dinero

En **Taller sublimación → Pago de trabajos**, selecciona varios pedidos para sumarlos en un solo pago al proveedor. Elige el IVA del lote y descarga el PDF o Excel; ambos identifican los clientes y el Excel incluye sus totales separados. Descargar no registra un pago.

En **Dinero → Resumen** se ven los totales cotizados con y sin IVA, sublimación y corte previstos, lo cobrado y validado, saldos y egresos. Registra pagos reales de hilos, tela, reparaciones, costura, sublimación, envío u otros gastos; puedes asociarlos a un pedido. **Disponible de cobros = cobros originales − devoluciones pagadas − egresos registrados**. Los costos previstos no se descuentan otra vez. El restante cotizado después del taller no es una utilidad fiscal. Los egresos no alteran el ISR RESICO.

Los egresos se guardan y sincronizan con la cuenta de administración. Los departamentos no reciben estos datos. El PDF y el Excel del control de dinero incluyen movimientos y una tabla de totales por cliente.

## Documentos y cliente

- **Pedido → Descargar plantilla vacía para cliente** genera un Excel limpio, con celdas verdes e instrucciones. Al importarlo, también se recuperan cliente, contacto, teléfono y dirección. No incluye precios ni datos del taller.
- Los submenús de departamentos, taller, historial, formatos de exportación y acceso al equipo quedan a la izquierda. **Diseño → Excel para nombres de diseño** descarga una hoja con el nombre en la primera columna para copiarlo fácilmente.
- Los nombres de los archivos PDF y Excel incluyen el cliente, folio, sección y versión.
- Cada sección ofrece **Vista previa** y **Exportar** en PDF y Excel. El PDF incluye los registros completos y las imágenes cargadas. Las etiquetas se distribuyen en cuatro columnas y seis filas, con 24 posiciones por hoja Carta.
- El Excel de cotización permite corregir cantidad y precio en las celdas verdes. Sus importes, IVA, retención y saldo estimado se recalculan con fórmulas.
- La exportación para Google Sheets descarga un Excel. Con conexión, impórtalo en Sheets para crear una hoja editable.
- **Compartir cotización** prepara un enlace de consulta cuando la app está publicada en HTTPS. Incluye solo cotización y miniaturas de diseño, y conserva la versión enviada. Quien reciba el enlace puede verlo. El PDF conserva el diseño con mayor resolución.
- Puedes compartir el PDF mediante el menú del celular o descargarlo. La app abre el menú; tú eliges destinatario y confirmas el envío.
- La importación acepta `.xlsx`, CSV y TSV. Revisa la hoja y el tratamiento del precio antes de confirmar. Para archivos `.xls` antiguos, guarda primero como `.xlsx`. Una hoja de Google Sheets compartida para lectura puede importarse con conexión; para hojas privadas, descarga el Excel.
- Al importar un listado en un pedido existente, se conservan sus datos de contacto. Las filas idénticas se omiten al agregar; el código de diseño forma parte de la comparación.

## Etiquetas de varios pedidos

En **Taller → Etiquetas**, marca los pedidos que quieres imprimir juntos. **Seleccionar todos** incluye únicamente pedidos con prendas. La pantalla suma etiquetas y hojas necesarias; descarga un solo PDF o Excel. Cada etiqueta conserva cliente, folio y número de pieza dentro de su propio pedido. Los clientes se acomodan seguidos para aprovechar la hoja.

**Primera etiqueta libre de la hoja** permite comenzar en una posición posterior cuando ya usaste parte de la hoja. Imprime el PDF en Carta a **100 % / tamaño real**. La vista previa muestra todas las etiquetas y las posiciones utilizadas, agrupadas por hoja. Se admiten hasta 10,000 etiquetas por descarga.

Los diseños adicionales se guardan en el mismo pedido y aparecen en su cotización, enlace del cliente, PDF, Excel y vistas de los departamentos. Agregar una imagen no duplica prendas ni modifica el precio. Un cambio de diseño requiere volver a aprobarlo y validar la producción.

## RESICO persona física

Proway está configurado como emisor persona física, régimen 626. Completa el nombre fiscal, RFC y código postal reales en **Taller sublimación → Precios**.

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

Para actualizar una instalación que ya usa el backend de la versión 1.1, aplica `backend/proway-expenses.sql`. Solo amplía la validación de configuración para egresos; conserva pedidos y permisos. `backend/test-expenses.sql` verifica el cambio en una transacción aislada que termina en rollback. Para actualizar de 1.2 a 1.3, aplica `backend/proway-multiple-designs.sql`: amplía los diseños por pedido y su proyección por departamento, conservando los pedidos existentes y permisos. `backend/test-multiple-designs.sql` comprueba compatibilidad, validación, sincronización, permisos y protección ante cambios simultáneos en una transacción aislada.

`backend/proway-cuentas/index.ts` permite crear cuentas únicamente con una invitación válida. La clave de servicio se usa dentro de la función del servidor; nunca va en `www` ni en el repositorio. Despliega esta función con el nombre `proway-cuentas`. No se cambia la configuración de registro de otras aplicaciones del proyecto.

La creación inicial del espacio de trabajo y la invitación del propietario son una operación administrativa separada. Los datos reales, correos, contraseñas, invitaciones y respaldos quedan fuera de GitHub. La carpeta pública solo contiene código, las imágenes Proway aprobadas para el catálogo y configuración publicable.

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

La versión 1.3 añade impresión de etiquetas de varios pedidos, diseños adicionales por cotización y los cuatro archivos originales Proway rojo y azul. Los submenús quedan a la izquierda. Conserva la corrección de recargas por JSONB, la carga de imágenes durante cambios remotos y los iconos con fondo blanco. La actualización no modifica los registros existentes para inicializar diseños vacíos. Los respaldos admiten archivos de hasta 100 MB. El sistema del celular puede tardar en renovar el icono instalado; la actualización conserva la base y no requiere desinstalar.

Incrementa la versión del caché en `www/sw.js` en cada publicación. Cuando el dispositivo tenga conexión, detectará la nueva versión y mostrará **Actualizar app**. Ese botón guarda los cambios antes de cargar la actualización; la base local se conserva.

Las bibliotecas están incluidas en `www/vendor` con sus licencias. La app no necesita CDNs ni instalar paquetes para su uso normal.

## Cotizaciones, envío y utilidad prevista (1.4)

- En **Cobro → Cotización no aprobada → Descartar cotización**, archiva una cotización sin cobros validados ni producción iniciada. Las prendas, imágenes y versiones se conservan. Se excluye de los pedidos activos, de los lotes de etiquetas y de la previsión financiera. **Historial → Descartadas → Recuperar** permite reutilizarla. Documentos y enlaces emitidos conservan su versión; el archivo no revoca copias enviadas.
- **Cobro → Envío cobrado al cliente** agrega el envío como concepto de la cotización, PDF, Excel y enlace. Aplica el mismo modo de IVA que las prendas. El importe y detalle se pueden editar; se vuelve a validar cotización/anticipo, conservando los cobros ya registrados. El costo real o previsto para Proway se captura internamente.
- **Cobro → Costos y utilidad prevista** permite presupuestar tela adicional, costura, envío y otros costos de cada pedido. Sublimación, corte, errores y tela de short se calculan de sus tablas. **Dinero → Resumen** muestra la utilidad total aunque los pedidos tengan saldo pendiente: venta cotizada sin IVA menos costos totales previstos/pagados y gastos generales, antes de ISR. Suma pedidos aprobados seleccionados; las propuestas por aprobar se consultan aparte y las descartadas se excluyen. La utilidad se calcula con ventas y costos base, sin descontar IVA del precio ni acreditar impuestos automáticamente.
- Para evitar doble conteo, cada categoría de egreso vinculada al mismo pedido sustituye su presupuesto cuando el gasto pagado es mayor. Se usa el mayor de presupuesto y pagos por categoría (taller, tela, costura, envío u otros). Los gastos generales y los egresos de cotizaciones descartadas se descuentan una sola vez del total. Sin una tarifa necesaria la utilidad queda **pendiente**; los costos todavía no capturados permanecen en cero y deben completarse para afinar la estimación. La previsión no altera el efectivo ni el cálculo mensual de ISR basado en cobros.
- La actualización conserva IndexedDB versión 1 y schemaVersion 1. Para un backend 1.3, aplica **backend/proway-quote-profit.sql**; reemplaza solo tres validadores/helpers privados y conserva registros y permisos. **backend/test-quote-profit.sql** verifica el cambio en una transacción aislada con rollback.

## Actualización integrada 1.6

- **Dinero** reúne selección de pedidos, efectivo validado, devoluciones, egresos, saldos, utilidad operativa, pendientes, ISR RESICO y respaldos. Aprobar una cotización nunca registra efectivo. Los pagos históricos conservan su modo fiscal y las cotizaciones emitidas mantienen sus importes originales.
- Los precios de prendas, envío, sublimación y corte son base. **Agregar IVA** suma 16%; nunca extrae IVA de esos importes. Los egresos con IVA separan base, impuesto y total. ISR y facturación conservan sus controles separados.
- **Cobro → Cancelar pedido y conservar pagos** muestra cliente, cobros, gastos y motivo antes de confirmar. No borra prendas, diseños ni recibos. Los pedidos cancelados dejan de avanzar y no suman ventas previstas; sus gastos pagados permanecen. Registra una devolución únicamente cuando realmente se pagó y hasta el efectivo recibido. No se ajusta automáticamente ISR histórico; concilia las devoluciones con el contador y los comprobantes fiscales.
- **Empaque → Revisión de calidad** reutiliza nombres, tallas y diseño del listado. La liberación requiere cantidad física exacta, revisión de nombres/tallas y diseño/colores, y validación fechada. Cambiar prendas o diseño reinicia la revisión. Los empaques ya validados antes de actualizar se conservan. Calidad y fechas tienen PDF/Excel con el cliente.
- Desde el inicio aprobado, las metas son diseño día hábil 5, costura 15, calidad/empaque 18 y salida 20. Se respeta el calendario del taller. Cada departamento guarda su propia fecha de validación; atrasos y vencimientos se muestran automáticamente. La entrega de la paquetería se sigue aparte.
- Se crean respaldos locales antes de actualizar, importar, recuperar, cancelar o resolver conflictos, y con el primer guardado de un nuevo día. Hasta ocho copias y un objetivo de 64 MB; si una sola copia supera ese tamaño se conserva esa copia. **Dinero → Respaldo** permite revisar cantidades, descargar y recuperar. Recuperar datos compartidos mantiene la revisión de conflictos; no borra el historial del servidor. Descarga una copia para tener respaldo fuera del dispositivo.
- Usa la misma cuenta y equipo en celular y computadora. Los cambios sin internet quedan en la cola local; se comparten al reconectar. Las ediciones incompatibles requieren elegir una copia y conservar primero un respaldo. La app intercambia cambios cada 20 segundos cuando está visible. La cuenta y el dispositivo mantienen sus bases separadas.
- El icono de producción tiene fondo blanco, emblema ampliado y rutas nuevas para facilitar su renovación en Android. El sistema puede tardar en actualizar el icono instalado; conserva la instalación y los datos.

Aplica **backend/proway-operations.sql** a una base 1.4 antes de publicar www 1.6. Reemplaza solo validadores/helpers privados, sin reescribir pedidos ni cambiar tablas o permisos. Los clientes anteriores mantienen compatibilidad de lectura; una nueva liberación de empaque requiere actualizar para completar Calidad. **backend/test-operations.sql** y **backend/test-quote-profit.sql** comprueban servidor, permisos y conservación en transacciones sintéticas que terminan en rollback.

**npm test** comprueba actualización de IndexedDB, cotizaciones, documentos, costos, efectivo, colores, diseños, etiquetas, cancelación/devolución, calidad, fechas, respaldos y dos dispositivos con el SDK real de Supabase contra un servidor HTTP simulado. Ninguna prueba usa cuentas ni pedidos reales.
