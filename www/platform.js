/* Proway Pedidos: durable offline snapshots and atomic collaboration outbox. */
(() => {
  'use strict';
  let DB_NAME = 'proway-pedidos'; const DB_VERSION = 1;
  let db, revision = 0, getter, timer, saving = Promise.resolve();
  let syncHooks=null;
  let installPrompt, registration;
  const status = message => { const el = document.getElementById('pia-storage-status'); if (el) el.textContent = message; };
  const request = r => new Promise((resolve,reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const completion = tx => new Promise((resolve,reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('No se guardaron los cambios.')); });
  async function open() {
    if (db) return db;
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => r.result.createObjectStore('snapshots');
    db = await request(r);
    db.onversionchange = () => { db.close(); status('Otra versión abrió la base. Recarga la app.'); };
    return db;
  }
  async function load() {
    const database = await open();
    const saved = await request(database.transaction('snapshots').objectStore('snapshots').get('current'));
    revision = saved?.revision || 0;
    status(saved ? 'Datos recuperados de este equipo' : 'Base local lista');
    return saved?.state || null;
  }
  async function write(state) {
    const database = await open();
    const tx = database.transaction('snapshots','readwrite'), done = completion(tx), store = tx.objectStore('snapshots');
    const r = store.get('current'); let collaboration;
    r.onsuccess = () => {
      const current = r.result;
      if ((current?.revision || 0) !== revision) { tx.abort(); status('Hay cambios en otra ventana. Descarga un respaldo de tus cambios y recarga.'); return; }
      if (current) store.put(current,'previous');
      if(syncHooks){collaboration=syncHooks.prepare(state);store.put(collaboration,'collaboration');}
      store.put({revision:revision+1,savedAt:new Date().toISOString(),state},'current');
    };
    await done;
    revision += 1;
    if(syncHooks&&collaboration)syncHooks.committed(collaboration);
    status('Guardado en este equipo · '+new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}));
  }
  function bindState(fn) { getter = fn; }
  async function switchScope(name){await flush();clearTimeout(timer);await saving.catch(()=>{});getter=null;syncHooks=null;if(db)db.close();db=null;revision=0;DB_NAME=name;return load();}
  async function readAux(key='collaboration'){const database=await open();return request(database.transaction('snapshots').objectStore('snapshots').get(key));}
  function setSyncHooks(hooks){syncHooks=hooks;}
  function flush() {
    clearTimeout(timer);
    if (!getter) return Promise.resolve();
    const snapshot = structuredClone(getter());
    saving = saving.catch(() => {}).then(() => write(snapshot));
    return saving.catch(error => { status('No se pudo guardar: '+error.message+' Descarga un respaldo.'); throw error; });
  }
  function changed() { clearTimeout(timer); timer = setTimeout(() => { flush().catch(() => {}); },180); }
  function download(blob,name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url),30000);
  }
  function backup(state) {
    download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'Proway-respaldo-'+new Date().toISOString().slice(0,10)+'.json');
  }
  const number = (x,max=1000000000) => typeof x==='number' && Number.isFinite(x) && x>=0 && x<=max;
  const text = (x,max=4000) => typeof x==='string' && x.length<=max;
  const identifier = x => text(x,64) && /^[A-Za-z0-9_-]+$/.test(x);
  const image = x => x===null || (text(x,3000000) && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(x));
  function validDesigns(value){
    if(value===undefined)return true;
    if(!Array.isArray(value)||value.length>8)return false;const ids=new Set();
    return value.every(d=>{if(!d||!identifier(d.id)||ids.has(d.id)||!text(d.name,100)||!d.name.trim()||!d.images||!image(d.images.front)||!image(d.images.back))return false;ids.add(d.id);return true;});
  }
  function validShipping(s){return s===undefined||!!s&&typeof s==='object'&&!Array.isArray(s)&&number(s.amount)&&text(s.description,200)&&Object.keys(s).every(k=>['amount','description'].includes(k));}
  function validPlans(s){return s===undefined||!!s&&typeof s==='object'&&!Array.isArray(s)&&['fabric','sewing','shipping','other'].every(k=>number(s[k]))&&Object.keys(s).every(k=>['fabric','sewing','shipping','other'].includes(k));}
  function validQuote(q) {
    return !!q && identifier(q.id) && text(q.name,200) && text(q.contact||'',200) &&
      ['pending','PF','PM'].includes(q.payerType) && number(q.advance) && number(q.balance) &&
      Array.isArray(q.rows) && q.rows.length<=10000 && q.tax && q.issuer && q.fiscal && q.images &&
      image(q.images.front) && image(q.images.back) && validDesigns(q.additionalDesigns) && validShipping(q.shippingQuote) &&
      q.rows.every(r=>['Butarga','Playera','Short'].includes(r.product)&&['Hombre','Mujer'].includes(r.cut)&&text(r.size,30)&&number(r.price)&&number(r.amount)&&Number.isInteger(r.qty)&&r.qty>=1&&r.qty<=10000) &&
      ['subtotal','iva','total','retention','net'].every(k=>number(q.tax[k])) &&
      ['pending','PF','PM'].includes(q.tax.payerType) && ['included','added'].includes(q.tax.mode) &&
      Object.values(q.issuer).every(v=>text(v,1000)) && Object.values(q.fiscal).every(v=>text(v,1000)) &&
      (!q.issuedAt||(text(q.issuedAt,40)&&Number.isFinite(Date.parse(q.issuedAt)))) &&
      (!q.documentVersion||(Number.isInteger(q.documentVersion)&&q.documentVersion>0));
  }
  function validDocument(d) {
    const cell=v=>typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v));
    return d && Array.isArray(d.heads)&&d.heads.length<=30&&d.heads.every(v=>text(v,200)) &&
      Array.isArray(d.rows)&&d.rows.length<=10000&&d.rows.every(r=>Array.isArray(r)&&r.length<=30&&r.every(cell)) &&
      Array.isArray(d.money)&&d.money.every(v=>Number.isInteger(v)&&v>=0&&v<30) &&
      (!d.summary||(Array.isArray(d.summary)&&d.summary.length<=50&&d.summary.every(r=>Array.isArray(r)&&r.every(cell)))) &&
      (!d.extraTables||(Array.isArray(d.extraTables)&&d.extraTables.length<=5&&d.extraTables.every(t=>text(t.title,100)&&!t.extraTables&&validDocument(t)))) &&
      (d.labelOffset===undefined||(Number.isInteger(d.labelOffset)&&d.labelOffset>=0&&d.labelOffset<24));
  }
  function validateState(value) {
    if (!value || value.schemaVersion!==1 || !Array.isArray(value.orders) || !value.orders.length || value.orders.length>1000) throw Error('No es un respaldo compatible de Proway.');
    const seen = new Set(); let rowCount = 0;
    for (const order of value.orders) {
      if (!identifier(order.id) || seen.has(order.id) || !text(order.name,200) || !Array.isArray(order.rows)) throw Error('Identificación de pedido inválida.');
      seen.add(order.id); rowCount += order.rows.length;
      for(const key of ['contact','phone','address','orderDate','advanceDate','source','sourceNote'])if(!text(order[key],4000))throw Error('Datos del cliente inválidos.');
      for(const key of ['dataOk','confirmed','designOk','paymentOk','released','sewn','packed','shipped','delivered'])if(typeof order[key]!=='boolean')throw Error('Validación de producción inválida.');
      if(!order.fiscal||!order.shipment||!Array.isArray(order.shipment.events))throw Error('Datos fiscales o envío inválidos.');
      for(const key of ['rfc','name','cp','regime','use','form','method'])if(!text(order.fiscal[key],1000))throw Error('Datos fiscales del receptor inválidos.');
      if (rowCount>10000 || !number(order.advance) || !number(order.advanceIsr||0) || !['pending','PF','PM'].includes(order.payerType)) throw Error('Importes o tipo fiscal inválidos.');
      if(order.advanceRecord&&(!number(order.advanceRecord.amount)||!number(order.advanceRecord.retention)||!/^\d{4}-\d{2}-\d{2}$/.test(order.advanceRecord.date)))throw Error('Anticipo validado inválido.');
      if (!['included','added'].includes(order.vatMode) || !order.images || !image(order.images.front) || !image(order.images.back)) throw Error('IVA o imágenes inválidos.');
      if(order.quoteStatus!==undefined&&!['active','discarded'].includes(order.quoteStatus))throw Error('Estado de cotización inválido.');
      if(!validShipping(order.shippingQuote)||!validPlans(order.plannedCosts))throw Error('Envío o costos previstos inválidos.');
      if(!validDesigns(order.additionalDesigns))throw Error('Diseños adicionales inválidos.');
      if (!Array.isArray(order.payments) || order.payments.some(p=>!text(p.id,64)||!number(p.amount)||!number(p.retention)||!/^\d{4}-\d{2}-\d{2}$/.test(p.date))) throw Error('Registro de pagos inválido.');
      if(order.showVat!==undefined&&typeof order.showVat!=='boolean')throw Error('Desglose de IVA inválido.');
      if(order.supplier&&(!['none','added','included'].includes(order.supplier.mode)||!Array.isArray(order.supplier.extras)||order.supplier.extras.length>500||order.supplier.extras.some(x=>!identifier(x.id)||!['Error','Impresión extra'].includes(x.type)||!['Butarga','Playera','Short'].includes(x.product)||!['Hombre','Mujer'].includes(x.cut)||!text(x.size,30)||!Number.isInteger(x.qty)||x.qty<1||x.qty>10000||typeof x.cutting!=='boolean'||!text(x.note,500))))throw Error('Costos extra inválidos.');
      for (const r of order.rows) {
        if (!Number.isInteger(r.id)||r.id<1||!['Butarga','Playera','Short'].includes(r.product) || !['Hombre','Mujer'].includes(r.cut) || !text(r.size,30) || !Number.isInteger(r.qty) || r.qty<1 || r.qty>10000 || (r.special!==''&&!number(r.special))) throw Error('Prenda, talla, corte o precio inválido.');
        for (const key of ['printed','color','design']) if (!text(r[key]||'',500)) throw Error('Datos de prenda inválidos.');
      }
    }
    if (!number(value.basePrice) || !number(value.cutPrice) || !Array.isArray(value.rates) || value.rates.length>500) throw Error('Tarifas inválidas.');
    for (const r of value.rates) if (!['Butarga','Playera'].includes(r.product)||!['Hombre','Mujer','*'].includes(r.cut)||!text(r.size,30)||!number(r.cost)) throw Error('Tarifa de sublimación inválida.');
    if (!value.issuer || value.issuer.legalType!=='PF' || !String(value.issuer.regime).startsWith('626')) throw Error('Este respaldo debe corresponder a RESICO persona física.');
    for (const key of ['name','rfc','cp','regime']) if (!text(value.issuer[key],300)) throw Error('Datos del emisor inválidos.');
    if (!value.calendar || typeof value.calendar.saturday!=='boolean' || !text(value.calendar.extra,10000)) throw Error('Calendario inválido.');
    if (!value.shortCosts || Object.entries(value.shortCosts).some(([k,a])=>!['1','2','4','6','8','10','12','14','16','18','CH','M','G','XG','XXG','XXXG','4XG','A medida'].includes(k)||!Array.isArray(a)||a.length!==2||a.some(n=>!number(n)))) throw Error('Tarifas de short inválidas.');
    if (!value.isrControl || !/^\d{4}-\d{2}$/.test(value.isrControl.month) || !value.isrControl.external || Object.entries(value.isrControl.external).some(([m,a])=>!/^\d{4}-\d{2}$/.test(m)||!number(a.income)||!number(a.retention))) throw Error('Control mensual ISR inválido.');
    for (const k of ['revisions','jobs','exportsMade','activity']) if (!Array.isArray(value[k]) || value[k].length>10000) throw Error('Historial inválido.');
    for(const r of value.revisions)if(!identifier(r.id)||!identifier(r.client)||!text(r.name,200)||!Number.isInteger(r.version)||r.version<1||!text(r.time,100)||!validDocument(r.data)||(r.quote&&!validQuote(r.quote))||(r.images&&(!image(r.images.front)||!image(r.images.back)))||!validDesigns(r.additionalDesigns))throw Error('Versión de documento inválida.');
    for(const a of value.activity)if(!identifier(a.client)||!text(a.time,100)||!text(a.action,4000))throw Error('Movimiento de historial inválido.');
    for(const j of value.jobs)if(!Number.isInteger(j.version)||j.version<1||!text(j.label,1000))throw Error('Enlace del historial inválido.');
    if (!value.profile || !text(value.profile.id,100) || !text(value.profile.name,200)) throw Error('Perfil local inválido.');
    if(value.designs&&(!Array.isArray(value.designs)||value.designs.length>20||value.designs.some(d=>!identifier(d.id)||!text(d.name,100)||!d.images||!image(d.images.front)||!image(d.images.back))))throw Error('Catálogo de diseños inválido.');
    if(value.expenses!==undefined){
      const ids=new Set(),categories=['Hilos','Tela','Reparación de máquina','Costura','Sublimación y corte','Envío','Otro'];
      if(!Array.isArray(value.expenses)||value.expenses.length>10000)throw Error('Registro de egresos inválido.');
      for(const e of value.expenses){if(!identifier(e.id)||ids.has(e.id)||!number(e.amount)||e.amount<=0||!categories.includes(e.category)||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||new Date(e.date+'T12:00:00Z').toISOString().slice(0,10)!==e.date||!(e.client===''||identifier(e.client))||!text(e.note,500))throw Error('Egreso inválido.');ids.add(e.id);}
    }
    return value;
  }
  async function readBackup(file) {
    if (!file || file.size>100000000) throw Error('Selecciona un respaldo de hasta 100 MB.');
    return validateState(JSON.parse(await file.text()));
  }
  async function optimizeImage(data,max=1200,quality=.85) {
    const img = new Image(); img.src = data; await img.decode();
    const scale = Math.min(1,max/Math.max(img.width,img.height)), canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(img.width*scale)); canvas.height = Math.max(1,Math.round(img.height*scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',quality);
  }
  function clean(value) { return String(value??'').replace(/[–—−]/g,'-').replace(/✓/g,'OK').replace(/→/g,'>'); }
  const money = x => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(x);
  function logoData(){const img=document.getElementById('pia-proway-logo');if(!img?.naturalWidth)throw Error('El logo aún no está disponible. Reintenta la descarga.');const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);return canvas.toDataURL('image/png');}
  function pdf(rev,logo,title) {
    const quote = rev.source==='cotizacion', labels = ['etiquetas','etiquetas_lote'].includes(rev.source);
    const doc = new jspdf.jsPDF({orientation:!quote&&!labels&&(rev.data.heads.length>6||(rev.data.extraTables||[]).some(t=>t.heads.length>6))?'landscape':'portrait',unit:'mm',format:'a4'});
    const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 13;
    if(!labels){doc.addImage(logoData(),'PNG',margin,11,58,18.5);
    doc.setDrawColor(23,105,64);doc.setLineWidth(.8);doc.line(margin,34,width-margin,34);
    doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text(clean(title),margin,40);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text(clean(rev.client+' · '+rev.name+' · v'+rev.version),margin,47);
    doc.text(new Date(rev.issuedAt||Date.now()).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City'}),width-margin,18,{align:'right'});}
    let y = 54;
    const line = (label,value,bold=false) => {
      if (y>height-23) { doc.addPage(); y=20; }
      doc.setFont('helvetica',bold?'bold':'normal'); doc.setFontSize(bold?12:10);
      doc.text(clean(label),margin,y); doc.text(clean(typeof value==='number'?money(value):value),width-margin,y,{align:'right'}); y += bold?9:7;
    };
    function paragraphs(message) {
      const lines = doc.splitTextToSize(clean(message),width-2*margin);
      doc.setFont('helvetica','normal'); doc.setFontSize(9);
      for (const l of lines) { if(y>height-20){doc.addPage();y=20;}doc.text(l,margin,y);y+=4.5; }
      y+=4;
    }
    if (quote) {
      const q = rev.quote, t = q.tax;
      doc.setTextColor(128,73,9); doc.text('Cotización / proforma - Sin timbrar. No es CFDI.',margin,y); y+=8; doc.setTextColor(30,40,50);
      const shipping=q.shippingQuote||{amount:0,description:''},sourceRows=[...q.rows,...(shipping.amount>0||shipping.description?[{product:'Envío',size:shipping.description,cut:'',qty:1,price:shipping.amount,amount:shipping.amount}]:[])];
      const show=q.showVat!==false,rows=sourceRows.map(r=>({...r,price:!show&&t.mode==='added'?Math.round(r.price*116)/100:r.price,amount:!show&&t.mode==='added'?Math.round(r.amount*116)/100:r.amount}));
      if(!show&&rows.length)rows.at(-1).amount=Math.round((rows.at(-1).amount+t.total-rows.reduce((s,r)=>s+r.amount,0))*100)/100;
      paragraphs('Cliente: '+q.name+(q.contact?' / '+q.contact:'')+'\nPrendas: '+q.rows.reduce((s,r)=>s+r.qty,0)+(show?'\nPrecios '+(t.mode==='included'?'con IVA incluido':'antes de IVA')+' en MXN.':'\nPrecios finales en MXN.'));
      doc.autoTable({startY:y,margin:{left:margin,right:margin},head:[['Producto / talla / corte','Cantidad','P. unitario','Importe']],body:rows.map(r=>[clean(r.product+(r.size?' / '+r.size:'')+(r.cut?' / '+r.cut:'')),r.qty,money(r.price),money(r.amount)]),styles:{font:'helvetica',fontSize:9,cellPadding:3},headStyles:{fillColor:[23,105,64]},columnStyles:{1:{halign:'right'},2:{halign:'right'},3:{halign:'right'}}});
      y=doc.lastAutoTable.finalY+10;
      if(show){line('Subtotal sin IVA',t.subtotal);line('IVA 16%',t.iva);line('Total antes de retenciones',t.total,true);if(t.payerType==='PM'){line('Menos retención ISR 1.25%',-t.retention);line('Neto a pagar',t.net,true);}else if(t.payerType==='pending')paragraphs('Tipo fiscal del cliente pendiente de confirmar.');}
      else {line('Total de la cotización',t.total,true);if(t.payerType==='PM'){line('Menos retención ISR 1.25%',-t.retention);line('Neto a pagar',t.net,true);}}
      line('Anticipo y pagos recibidos',q.advance);line('Saldo a pagar',q.balance,true);
      if(show)paragraphs('Emisor: '+(q.issuer.name||'Nombre fiscal pendiente')+' | RFC: '+(q.issuer.rfc||'Pendiente')+' | C. P.: '+(q.issuer.cp||'Pendiente')+'\nRégimen: '+q.issuer.regime+' · Persona física\nReceptor: '+(q.fiscal.name||q.name)+' | RFC: '+(q.fiscal.rfc||'Pendiente')+' | C. P.: '+(q.fiscal.cp||'Pendiente')+'\nRégimen receptor: '+(q.fiscal.regime||'Pendiente')+' | Uso CFDI: '+(q.fiscal.use||'Pendiente')+'\nForma de pago: '+(q.fiscal.form||'Pendiente')+' | Método: '+(q.fiscal.method||'Pendiente'));
      paragraphs('Plazo aproximado: 20 días hábiles desde el inicio validado, después de aprobar pedido, cotización, diseño y anticipo. Tiempo de paquetería por confirmar.');
      if(q.due)paragraphs('Entrega de producción estimada: '+new Date(q.due+'T12:00:00Z').toLocaleDateString('es-MX',{timeZone:'UTC'}));
    } else if(labels) {
      const rows=rev.data.rows, cols=4, gap=3, cellW=(width-2*margin-3*gap)/4, cellH=42,offset=rev.data.labelOffset||0;
      rows.forEach((r,i)=>{
        const position=(i+offset)%24;
        if(i>0&&position===0)doc.addPage();
        const x=margin+(position%cols)*(cellW+gap), top=13+Math.floor(position/cols)*(cellH+gap);
        doc.setDrawColor(160);doc.rect(x,top,cellW,cellH);
        const lines=[r[4],r[1]+' / '+r[2]+' / '+r[3],r[5]||'Sin nombre',r[6]||'Color pendiente','Diseño: '+(r[7]||'Pendiente')];
        doc.setFontSize(8);doc.setFont('helvetica','normal');
        let labelY=top+4;
        for(const [n,text] of lines.entries()){const wrapped=doc.splitTextToSize(clean(text),cellW-5).slice(0,n<3?2:1);doc.text(wrapped,x+2.5,labelY);labelY+=3.3*wrapped.length+.7;}
        doc.setFont('helvetica','bold');doc.text(clean((r[8]||rev.client)+' · '+r[0]+' de '+(r[9]??rows.length)),x+2.5,top+38);
      });
    } else {
      doc.autoTable({startY:y,margin:{left:margin,right:margin},head:[rev.data.heads.map(clean)],body:rev.data.rows.map(r=>r.map((v,i)=>rev.data.money.includes(i)&&typeof v==='number'?money(v):clean(v))),styles:{font:'helvetica',fontSize:8,cellPadding:2.4},headStyles:{fillColor:[23,42,61]}});
      y=(doc.lastAutoTable?.finalY||y)+9;
      for(const row of rev.data.summary||[])line(row[0],row[1]);
      for(const table of rev.data.extraTables||[]){
        doc.addPage();y=22;doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(clean(table.title+' · '+rev.name),margin,y);y+=8;
        doc.autoTable({startY:y,margin:{left:margin,right:margin},head:[table.heads.map(clean)],body:table.rows.map(r=>r.map((v,i)=>table.money.includes(i)&&typeof v==='number'?money(v):clean(v))),styles:{font:'helvetica',fontSize:8,cellPadding:2.4},headStyles:{fillColor:[23,105,64]}});y=(doc.lastAutoTable?.finalY||y)+9;
      }
    }
    const artwork=rev.quote||rev,sets=[{name:'Diseño principal',images:artwork.images},...(artwork.additionalDesigns||[])].filter(d=>d.images&&Object.values(d.images).some(Boolean));
    if(sets.length){
      if(!quote){doc.addPage();y=22;}
      for(const design of sets){
        const imageHeight=quote?72:95;if(y>height-imageHeight-42){doc.addPage();y=22;}
        doc.setTextColor(30,40,50);doc.setFont('helvetica','bold');doc.setFontSize(12);
        const title=doc.splitTextToSize(clean(design.name),width-2*margin);doc.text(title,margin,y);y+=title.length*5+3;
        const cellW=(width-2*margin-12)/2;
        for(const [index,side] of ['front','back'].entries()){
          const data=design.images[side],x=margin+index*(cellW+12);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(side==='front'?'Delantero':'Trasero',x,y);
          if(!data)continue;const props=doc.getImageProperties(data),scale=Math.min(cellW/props.width,imageHeight/props.height),w=props.width*scale,h=props.height*scale;
          doc.addImage(data,props.fileType,x+(cellW-w)/2,y+4,w,h);
        }
        y+=imageHeight+16;
      }
    }
    for(let p=1;p<=doc.getNumberOfPages();p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(110);doc.text('Proway · '+(quote?'Cotización sin timbrar':'Documento de trabajo'),margin,height-8);doc.text(p+' / '+doc.getNumberOfPages(),width-margin,height-8,{align:'right'});}
    return doc.output('blob');
  }
  async function excel(rev,title) {
    const wb=new ExcelJS.Workbook();wb.creator='Proway';wb.created=new Date();
    const sheet=wb.addWorksheet('Documento'), d=rev.data;
    sheet.addRow(['','',title]);sheet.addRow(['','',rev.client+' · '+rev.name]);sheet.addRow(['','','Versión '+rev.version]);
    sheet.mergeCells('A1:B3');
    const mark=wb.addImage({base64:logoData(),extension:'png'});sheet.addImage(mark,{tl:{col:0,row:0},ext:{width:170,height:54}});
    if(rev.source==='cotizacion')sheet.addRow(['Cotización / proforma - sin timbrar. No es CFDI.']);
    sheet.addRow([]);const header=sheet.addRow(d.heads);
    header.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF172A3D'}};cell.font={bold:true,color:{argb:'FFFFFFFF'},size:12};});
    const firstRow=header.number+1;
    for(const values of d.rows){const row=sheet.addRow(values);row.eachCell((cell,i)=>{cell.font={name:'Arial',size:11};if(d.money.includes(i-1))cell.numFmt='"$"#,##0.00';});if(rev.source==='cotizacion'){row.getCell(6).value={formula:'ROUND(D'+row.number+'*E'+row.number+',2)',result:values[5]};for(const i of [4,5])row.getCell(i).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE2F3E8'}};}}
    const lastRow=sheet.lastRow.number;sheet.addRow([]);const summaries=new Map();
    for(const values of d.summary||[]){const row=sheet.addRow(values);summaries.set(values[0],row.number);if(typeof values[1]==='number')row.getCell(2).numFmt='"$"#,##0.00';}
    if(['proveedor','proveedor_lote'].includes(rev.source)&&d.rows.length){
      for(let n=firstRow;n<=lastRow;n++){
        const r=sheet.getRow(n);r.getCell(8).value={formula:'IF(ISNUMBER(F'+n+'),ROUND(E'+n+'*F'+n+',2),"Tarifa pendiente")',result:d.rows[n-firstRow][7]};
        r.getCell(9).value={formula:'ROUND(E'+n+'*G'+n+',2)',result:d.rows[n-firstRow][8]};
        for(const c of [5,6,7])r.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE2F3E8'}};
      }
      const at=label=>'B'+summaries.get(label),mode=at('IVA del proveedor');
      const formula=(label,f)=>{const c=sheet.getCell(at(label));c.value={formula:f,result:c.value};};
      const total='('+at('Sublimación')+'+'+at('Corte')+')';
      formula('Sublimación','IF(COUNT(F'+firstRow+':F'+lastRow+')<ROWS(F'+firstRow+':F'+lastRow+'),"Tarifa pendiente",SUM(H'+firstRow+':H'+lastRow+'))');
      formula('Corte','SUM(I'+firstRow+':I'+lastRow+')');
      formula('Subtotal','IF(ISNUMBER('+at('Sublimación')+'),IF('+mode+'="IVA incluido",ROUND('+total+'/1.16,2),'+total+'),"Pendiente")');
      formula('Total a pagar','IF(ISNUMBER('+at('Sublimación')+'),IF('+mode+'="Precios más IVA",ROUND('+total+'*1.16,2),'+total+'),"Tarifa pendiente")');
      formula('IVA','IF(ISNUMBER('+at('Subtotal')+'),'+at('Total a pagar')+'-'+at('Subtotal')+',"Pendiente")');
      sheet.getCell(mode).dataValidation={type:'list',allowBlank:false,formulae:['"Sin IVA adicional,Precios más IVA,IVA incluido"']};sheet.getCell(mode).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE2F3E8'}};wb.calcProperties.fullCalcOnLoad=true;
      sheet.addRow(['Editar celdas verdes: cantidad, tarifa y corte. Los totales se recalculan en Excel o Google Sheets.']);
    }
    if(rev.source==='finanzas'){
      const at=label=>'B'+summaries.get(label),set=(label,formula)=>{const c=sheet.getCell(at(label));c.value={formula,result:c.value};};
      set('Cobrado y validado',d.rows.length?'SUM(E'+firstRow+':E'+lastRow+')':'0');
      set('Egresos registrados',d.rows.length?'SUM(F'+firstRow+':F'+lastRow+')':'0');
      set('Disponible de cobros',at('Cobrado y validado')+'-'+at('Egresos registrados'));wb.calcProperties.fullCalcOnLoad=true;
      sheet.addRow(['Control a la fecha de exportación. Al editar ingresos o egresos se recalculan los totales de efectivo.']);
    }
    if(rev.source==='cotizacion'&&d.rows.length&&rev.quote?.showVat===false){
      const at=label=>'B'+summaries.get(label),sum='SUM(F'+firstRow+':F'+lastRow+')';
      const formula=(label,f)=>{const cell=sheet.getCell(at(label));cell.value={formula:f,result:cell.value};};
      // The final line absorbs invoice rounding; precise final unit prices stay editable.
      const last=sheet.getRow(lastRow),previous=lastRow>firstRow?'SUM(F'+firstRow+':F'+(lastRow-1)+')':'0';
      last.getCell(6).value={formula:'ROUND(SUMPRODUCT(D'+firstRow+':D'+lastRow+',E'+firstRow+':E'+lastRow+'),2)-'+previous,result:d.rows.at(-1)[5]};
      formula('Total de la cotización',sum);if(rev.quote.tax.payerType==='PM'){formula('Retención ISR 1.25%','ROUND('+at('Total de la cotización')+'/1.16*0.0125,2)');formula('Neto a pagar',at('Total de la cotización')+'-'+at('Retención ISR 1.25%'));}formula('Saldo a pagar','MAX(0,'+at(rev.quote.tax.payerType==='PM'?'Neto a pagar':'Total de la cotización')+'-'+at('Anticipo y pagos recibidos')+')');wb.calcProperties.fullCalcOnLoad=true;
    }else if(rev.source==='cotizacion'&&d.rows.length){
      const at=label=>'B'+summaries.get(label),sum='SUM(F'+firstRow+':F'+lastRow+')';
      const formula=(label,f)=>{const cell=sheet.getCell(at(label));cell.value={formula:f,result:cell.value};};
      const mode=at('Precios'),kind=at('Tipo de cliente');
      sheet.getCell(mode).dataValidation={type:'list',allowBlank:false,formulae:['"IVA incluido,Más IVA"']};sheet.getCell(kind).dataValidation={type:'list',allowBlank:false,formulae:['"Persona física,Persona moral,Pendiente de confirmar"']};
      for(const cell of [mode,kind])sheet.getCell(cell).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE2F3E8'}};
      formula('Subtotal','IF('+mode+'="IVA incluido",ROUND('+sum+'/1.16,2),'+sum+')');
      formula('Total antes de retenciones','IF('+mode+'="IVA incluido",'+sum+',ROUND('+sum+'*1.16,2))');
      formula('IVA 16%',at('Total antes de retenciones')+'-'+at('Subtotal'));
      formula('Retención ISR 1.25%','IF('+kind+'="Persona moral",ROUND('+at('Subtotal')+'*0.0125,2),0)');
      formula('Neto estimado',at('Total antes de retenciones')+'-'+at('Retención ISR 1.25%'));
      formula('Saldo neto estimado','MAX(0,'+at('Neto estimado')+'-'+at('Depósitos')+')');
      wb.calcProperties.fullCalcOnLoad=true;
    }
    if(rev.quote&&rev.quote.showVat!==false){const q=rev.quote;sheet.addRow([]);for(const row of [['Emisor',q.issuer.name],['RFC emisor',q.issuer.rfc],['C. P. emisor',q.issuer.cp],['Régimen emisor',q.issuer.regime],['RFC receptor',q.fiscal.rfc],['Nombre fiscal receptor',q.fiscal.name],['C. P. receptor',q.fiscal.cp],['Régimen receptor',q.fiscal.regime],['Uso CFDI',q.fiscal.use],['Forma de pago',q.fiscal.form],['Método de pago',q.fiscal.method]])sheet.addRow(row);}
    sheet.columns.forEach((col,i)=>{col.width=Math.min(42,Math.max(15, String(d.heads[i]||'').length+4));col.alignment={vertical:'top',wrapText:true};});
    sheet.views=[{state:'frozen',ySplit:header.number}];sheet.pageSetup={paperSize:9,orientation:d.heads.length>6?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0};
    if(rev.source==='pedido'){
      const template=wb.addWorksheet('Pedido cliente');template.addRow(['Producto','Talla','Corte','Cantidad','Nombre','Color','Diseño']);
      for(let i=2;i<=102;i++)for(let j=1;j<=7;j++){const c=template.getCell(i,j);c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE2F3E8'}};c.font={name:'Arial',size:12};}
      template.columns.forEach(c=>c.width=20);template.getRow(1).font={bold:true};template.views=[{state:'frozen',ySplit:1}];
      const instructions=wb.addWorksheet('Instrucciones');instructions.addRow(['Completa solo la pestaña Pedido cliente.']);instructions.addRow(['Producto: Butarga, Playera o Short. Corte: Hombre o Mujer. Cantidad: entero positivo.']);instructions.addRow(['Guarda el archivo y vuelve a importarlo en la app. El precio final se fija en la cotización de Proway.']);instructions.getColumn(1).width=100;
    }
    if(rev.source==='diseño'){
      const names=wb.addWorksheet('Nombres para diseño');names.addRow(['Cliente',rev.name]);names.addRow(['Nombre','Cantidad','Producto','Talla','Corte','Color','Diseño','Indicaciones']);
      for(const r of d.rows)names.addRow([r[4],r[3],r[0],r[1],r[2],r[5],r[6],r[7]||'']);
      names.columns.forEach((c,i)=>{c.width=i===0?30:19;c.font={name:'Arial',size:12};});names.getRow(2).font={name:'Arial',bold:true,size:12};names.views=[{state:'frozen',ySplit:2}];names.autoFilter={from:'A2',to:'H'+Math.max(2,names.rowCount)};
    }
    for(const table of d.extraTables||[]){
      const extra=wb.addWorksheet(table.title.slice(0,31));extra.addRow(['Proway',rev.name]);extra.addRow(table.heads);
      for(const values of table.rows){const row=extra.addRow(values);row.eachCell((c,i)=>{c.font={name:'Arial',size:11};if(table.money.includes(i-1))c.numFmt='"$"#,##0.00';});}
      extra.columns.forEach(c=>{c.width=22;c.alignment={vertical:'top',wrapText:true};});extra.getRow(2).font={bold:true};extra.views=[{state:'frozen',ySplit:2}];
    }
    const artwork=rev.quote||rev,sets=[{name:'Diseño principal',images:artwork.images},...(artwork.additionalDesigns||[])].filter(d=>d.images&&Object.values(d.images).some(Boolean));
    if(sets.length){
      const designs=wb.addWorksheet('Diseño');designs.getColumn(1).width=60;let row=1;
      for(const design of sets){
        designs.getCell(row++,1).value=design.name;designs.getRow(row-1).font={name:'Arial',bold:true,size:14};
        for(const side of ['front','back']){
          let data=design.images[side];if(!data)continue;if(data.startsWith('data:image/webp'))data=await optimizeImage(data);
          designs.getCell(row,1).value=side==='front'?'Frente':'Espalda';const img=new Image();img.src=data;await img.decode();const scale=Math.min(400/img.width,400/img.height),mark=wb.addImage({base64:data,extension:data.startsWith('data:image/png')?'png':'jpeg'});
          designs.addImage(mark,{tl:{col:0,row},ext:{width:img.width*scale,height:img.height*scale}});row+=25;
        }
      }
      designs.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0};
    }
    const buffer=await wb.xlsx.writeBuffer();return new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  async function blankCustomerTemplate(){
    const wb=new ExcelJS.Workbook();wb.creator='Proway';const sheet=wb.addWorksheet('Pedido cliente');
    for(const label of ['Cliente','Contacto','Teléfono','Dirección']){const row=sheet.addRow([label,'']);sheet.mergeCells(row.number,2,row.number,7);row.getCell(1).font={name:'Arial',bold:true,size:12};row.getCell(2).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE2F3E8'}};row.height=30;}
    sheet.addRow(['Llena las celdas verdes. Una fila por nombre, talla y corte.']);sheet.mergeCells('A5:G5');sheet.getRow(5).font={name:'Arial',size:11};
    sheet.addRow([]);sheet.addRow(['Producto','Talla','Corte','Cantidad','Nombre','Color','Diseño']);
    sheet.getRow(7).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176940'}};c.font={name:'Arial',bold:true,size:12,color:{argb:'FFFFFFFF'}};});
    for(let n=8;n<=107;n++)for(let j=1;j<=7;j++){const c=sheet.getCell(n,j);c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE2F3E8'}};c.font={name:'Arial',size:12};if(j===1)c.dataValidation={type:'list',allowBlank:true,formulae:['"Butarga,Playera,Short"']};if(j===3)c.dataValidation={type:'list',allowBlank:true,formulae:['"Hombre,Mujer"']};if(j===4)c.dataValidation={type:'whole',operator:'between',allowBlank:true,formulae:[1,10000],showErrorMessage:true,error:'Escribe una cantidad entera de 1 a 10000.'};}
    sheet.columns.forEach((c,i)=>c.width=i===4?30:19);sheet.views=[{state:'frozen',ySplit:7}];
    const instructions=wb.addWorksheet('Cómo llenar');for(const text of ['Completa los datos del cliente y las celdas verdes de Pedido cliente.','Producto: Butarga, Playera o Short. Corte: Hombre o Mujer.','Tallas: 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, CH, M, G, XG, XXG, XXXG, 4XG o A medida.','Cantidad: entero positivo. Nombre: texto exacto que se imprimirá.','Diseño: nombre o código acordado. Las imágenes se agregan en la app.','Guarda este Excel y envíalo a Proway para confirmar tu pedido.'])instructions.addRow([text]);instructions.getColumn(1).width=95;instructions.getColumn(1).font={name:'Arial',size:12};instructions.getColumn(1).alignment={wrapText:true};
    return new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function cellValue(value) { if(value&&typeof value==='object')return value.result??value.text??(value.richText?value.richText.map(x=>x.text).join(''):'');return value??''; }
  async function readExcel(file) {
    if(file.size>5000000)throw Error('Usa un Excel de hasta 5 MB.');
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
    return wb.worksheets.map(sheet=>{const rows=[];sheet.eachRow({includeEmpty:false},row=>rows.push(row.values.slice(1).map(cellValue)));return {name:sheet.name,rows};});
  }
  async function quoteLink(q,version=1,issuedAt=new Date().toISOString()) {
    if(!/^https:/.test(location.protocol))throw Error('El enlace al cliente estará disponible cuando la app tenga una dirección HTTPS publicada. Puedes compartir el PDF.');
    const quote=structuredClone(q);quote.documentVersion=version;quote.issuedAt=issuedAt;
    // Preserve every design in the client snapshot, reducing thumbnails together if needed.
    const original=[q.images,...(q.additionalDesigns||[]).map(d=>d.images)],target=[quote.images,...(quote.additionalDesigns||[]).map(d=>d.images)];
    for(const [max,quality] of [[180,.48],[120,.42],[80,.32],[60,.28]]){
      for(let i=0;i<original.length;i++)for(const side of ['front','back'])if(original[i][side])target[i][side]=await optimizeImage(original[i][side],max,quality);
      const bytes=new TextEncoder().encode(JSON.stringify(quote)),stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
      const compressed=new Uint8Array(await new Response(stream).arrayBuffer());let binary='';for(const b of compressed)binary+=String.fromCharCode(b);
      const encoded=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      if(encoded.length<=20000)return location.origin+location.pathname+'#cot='+encoded;
    }
    throw Error('Los diseños ocupan demasiado para un enlace. Comparte el PDF con todas las imágenes.');
  }

  async function readQuote() {
    const match=location.hash.match(/^#cot=([A-Za-z0-9_-]+)$/);if(!match)return null;
    if(match[1].length>22000)throw Error('Enlace de cotización demasiado grande.');
    const binary=atob(match[1].replace(/-/g,'+').replace(/_/g,'/')),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),reader=stream.getReader();let text='',size=0;
    const decoder=new TextDecoder();for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>200000){await reader.cancel();throw Error('Cotización inválida.');}text+=decoder.decode(value,{stream:true});}
    const q=JSON.parse(text+decoder.decode());
    if(!validQuote(q)||q.rows.length>300)throw Error('Enlace de cotización inválido.');
    return q;
  }
  async function shareFile(blob,name) { const file=new File([blob],name,{type:blob.type});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Cotización Proway'});else download(blob,name); }
  async function install() {
    const el=document.getElementById('pia-install'),update=document.getElementById('pia-update');
    window.addEventListener('hashchange',event=>{
      if(![event.oldURL,event.newURL].some(url=>new URL(url).hash.startsWith('#cot=')))return;
      flush().then(()=>location.reload()).catch(()=>status('No se pudo guardar antes de abrir la cotización. Descarga un respaldo y vuelve a intentarlo.'));
    });
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;el.hidden=false;});
    el?.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;el.hidden=true;});
    if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)) {
      registration=await navigator.serviceWorker.register('sw.js');
      const waiting=()=>{if(registration.waiting&&navigator.serviceWorker.controller)update.hidden=false;};waiting();
      registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',waiting));
      let updateRequested=false,refreshing=false;
      update?.addEventListener('click',async()=>{await flush();if(registration.waiting){updateRequested=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});}});
      navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updateRequested&&!refreshing){refreshing=true;location.reload();}});
    }
    window.addEventListener('online',()=>status('Con conexión · guardado local activo'));
    window.addEventListener('offline',()=>status('Sin conexión · pedidos guardados en este equipo'));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flush().catch(()=>{});});
    if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  }
  window.ProwayPlatform={load,bindState,changed,flush,switchScope,readAux,setSyncHooks,backup,readBackup,validateState,download,pdf,excel,blankCustomerTemplate,readExcel,optimizeImage,quoteLink,readQuote,shareFile,install,status};
})();
