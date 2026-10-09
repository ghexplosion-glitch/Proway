-- Add optional designs to orders without rewriting existing orders or settings.
-- Existing helper privileges and the checked RPC entry point are preserved.

create or replace function proway_private.project_order(d jsonb, r text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare outdata jsonb; rowsdata jsonb;
begin
  if r='admin' then return d; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x->'id','product',x->'product','size',x->'size','cut',x->'cut',
    'qty',x->'qty','printed',coalesce(x->'printed','""'::jsonb),'color',coalesce(x->'color','""'::jsonb),
    'design',coalesce(x->'design','""'::jsonb),'placement',coalesce(x->'placement','""'::jsonb),'special','')), '[]'::jsonb)
    into rowsdata from jsonb_array_elements(d->'rows') x;
  outdata=jsonb_build_object('id',d->'id','name',d->'name','contact','','phone','','address','',
    'orderDate',d->'orderDate','rows',rowsdata,'images',d->'images','additionalDesigns',coalesce(d->'additionalDesigns','[]'::jsonb),'dataOk',d->'dataOk','confirmed',d->'confirmed',
    'designOk',d->'designOk','paymentOk',d->'paymentOk','startDate',d->'startDate','released',d->'released',
    'sewn',d->'sewn','packed',d->'packed','shipped',d->'shipped','delivered',d->'delivered',
    'advance',0,'advanceDate','','advanceIsr',0,'advanceCfdi',false,'advanceSimulated',false,'advanceRecord',null,
    'payments','[]'::jsonb,'payerType','pending','vatMode','included','source','Pedido compartido','sourceNote','',
    'fiscal',jsonb_build_object('rfc','','name','','cp','','regime','','use','','form','','method',''),
    'shipment',d->'shipment','showVat',false,'supplier',jsonb_build_object('mode','none','extras','[]'::jsonb));
  if r='envio' then outdata=outdata||jsonb_build_object('address',d->'address','contact',d->'contact','phone',d->'phone'); end if;
  return outdata;
end $$;

create or replace function proway_private.validate_order(d jsonb) returns void
language plpgsql set search_path = '' as $$
declare x jsonb; k text; n numeric; totalrows integer;
begin
  if jsonb_typeof(d)<>'object' or octet_length(d::text)>7000000 then raise exception 'Pedido demasiado grande o inválido.'; end if;
  if coalesce(d->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$' or jsonb_typeof(d->'name') is distinct from 'string' or length(d->>'name') not between 1 and 200 then raise exception 'Identificación inválida.'; end if;
  for k in select jsonb_object_keys(d) loop
    if k<>all(array['id','name','contact','phone','address','orderDate','rows','images','additionalDesigns','dataOk','confirmed','designOk','advance','advanceDate','advanceIsr','advanceCfdi','advanceSimulated','advanceRecord','payments','payerType','paymentOk','startDate','released','sewn','packed','shipped','delivered','source','sourceNote','vatMode','fiscal','shipment','showVat','supplier']) then raise exception 'Campo de pedido no permitido: %',k; end if;
  end loop;
  foreach k in array array['contact','phone','address','orderDate','advanceDate','startDate','source','sourceNote'] loop
    if jsonb_typeof(d->k) is distinct from 'string' or length(d->>k)>4000 then raise exception 'Dato de pedido inválido: %',k; end if;
  end loop;
  foreach k in array array['dataOk','confirmed','designOk','paymentOk','released','sewn','packed','shipped','delivered','advanceCfdi','advanceSimulated'] loop
    if jsonb_typeof(d->k) is distinct from 'boolean' then raise exception 'Validación inválida: %',k; end if;
  end loop;
  foreach k in array array['orderDate','advanceDate','startDate'] loop
    if d->>k<>'' then
      if (d->>k)!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha inválida.'; end if;
      perform (d->>k)::date;
    end if;
  end loop;
  foreach k in array array['advance','advanceIsr'] loop
    if jsonb_typeof(d->k) is distinct from 'number' or (d->>k)::numeric not between 0 and 1000000000 then raise exception 'Importe inválido.'; end if;
  end loop;
  if coalesce(d->>'payerType','')<>all(array['pending','PF','PM']) or coalesce(d->>'vatMode','')<>all(array['included','added']) then raise exception 'Tipo fiscal inválido.'; end if;
  if jsonb_typeof(d->'rows') is distinct from 'array' or jsonb_array_length(d->'rows')>10000 then raise exception 'Listado inválido.'; end if;
  for x in select value from jsonb_array_elements(d->'rows') loop
    if jsonb_typeof(x->'id') is distinct from 'number' or (x->>'id')::numeric not between 1 and 9007199254740991 or trunc((x->>'id')::numeric)<>(x->>'id')::numeric then raise exception 'Identificador de prenda inválido.'; end if;
    if coalesce(x->>'product','')<>all(array['Butarga','Playera','Short']) or coalesce(x->>'cut','')<>all(array['Hombre','Mujer']) or coalesce(x->>'size','')='' or length(x->>'size')>30 then raise exception 'Prenda, talla o corte inválido.'; end if;
    if jsonb_typeof(x->'qty') is distinct from 'number' or (x->>'qty')::numeric not between 1 and 10000 or trunc((x->>'qty')::numeric)<>(x->>'qty')::numeric then raise exception 'Cantidad inválida.'; end if;
    if x->>'special'<>'' and (jsonb_typeof(x->'special') is distinct from 'number' or (x->>'special')::numeric not between 0 and 1000000000) then raise exception 'Precio inválido.'; end if;
    foreach k in array array['printed','color','design','placement'] loop
      if jsonb_typeof(coalesce(x->k,'""'::jsonb))<>'string' or length(coalesce(x->>k,''))>500 then raise exception 'Datos de prenda inválidos.'; end if;
    end loop;
  end loop;
  if (select count(*) from jsonb_array_elements(d->'rows'))<>(select count(distinct row_data->>'id') from jsonb_array_elements(d->'rows') row_data) then raise exception 'Prendas con identificador repetido.'; end if;
  if jsonb_typeof(d->'images') is distinct from 'object' then raise exception 'Diseño inválido.'; end if;
  foreach k in array array['front','back'] loop
    if d->'images'->k is distinct from 'null'::jsonb then
      if length(d->'images'->>k)>3000000 or coalesce(d->'images'->>k,'')!~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'Imagen inválida.'; end if;
    end if;
  end loop;
  if d ? 'additionalDesigns' then
    if jsonb_typeof(d->'additionalDesigns') is distinct from 'array' or jsonb_array_length(d->'additionalDesigns')>8 then raise exception 'Puedes agregar hasta 8 diseños adicionales.'; end if;
    for x in select value from jsonb_array_elements(d->'additionalDesigns') loop
      if jsonb_typeof(x) is distinct from 'object' or coalesce(x->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$' or jsonb_typeof(x->'name') is distinct from 'string' or length(trim(x->>'name')) not between 1 and 100 or jsonb_typeof(x->'images') is distinct from 'object' then raise exception 'Diseño adicional inválido.'; end if;
      for k in select jsonb_object_keys(x) loop
        if k<>all(array['id','name','images']) then raise exception 'Campo de diseño no permitido.'; end if;
      end loop;
      foreach k in array array['front','back'] loop
        if x->'images'->k is distinct from 'null'::jsonb then
          if jsonb_typeof(x->'images'->k) is distinct from 'string' or length(x->'images'->>k)>3000000 or coalesce(x->'images'->>k,'')!~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'Imagen adicional inválida.'; end if;
        end if;
      end loop;
      if (d->>'designOk')::boolean and x->'images'->>'front' is null and x->'images'->>'back' is null then raise exception 'Agrega las imágenes de todos los diseños antes de aprobar.'; end if;
    end loop;
    if (select count(*) from jsonb_array_elements(d->'additionalDesigns'))<>(select count(distinct item->>'id') from jsonb_array_elements(d->'additionalDesigns') item) then raise exception 'Identificador de diseño repetido.'; end if;
  end if;
  if jsonb_typeof(d->'fiscal') is distinct from 'object' or jsonb_typeof(d->'shipment') is distinct from 'object' or jsonb_typeof(d->'payments') is distinct from 'array' or jsonb_array_length(d->'payments')>1000 then raise exception 'Datos fiscales, pagos o envío inválidos.'; end if;
  foreach k in array array['rfc','name','cp','regime','use','form','method'] loop
    if jsonb_typeof(d->'fiscal'->k) is distinct from 'string' or length(d->'fiscal'->>k)>1000 then raise exception 'Datos fiscales inválidos.'; end if;
  end loop;
  foreach k in array array['carrier','guide','date','eta','status'] loop
    if jsonb_typeof(d->'shipment'->k) is distinct from 'string' or length(d->'shipment'->>k)>500 then raise exception 'Datos de envío inválidos.'; end if;
  end loop;
  if coalesce(d->'shipment'->>'status','')<>all(array['Preparación','Enviado','En tránsito','Incidencia','Entregado']) or jsonb_typeof(d->'shipment'->'events') is distinct from 'array' or jsonb_array_length(d->'shipment'->'events')>1000 then raise exception 'Seguimiento inválido.'; end if;
  foreach k in array array['date','eta'] loop
    if d->'shipment'->>k<>'' then
      if (d->'shipment'->>k)!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha de envío inválida.'; end if;
      perform (d->'shipment'->>k)::date;
    end if;
  end loop;
  for x in select value from jsonb_array_elements(d->'payments') loop
    if jsonb_typeof(x->'amount') is distinct from 'number' or (x->>'amount')::numeric not between 0 and 1000000000 or jsonb_typeof(x->'retention') is distinct from 'number' or (x->>'retention')::numeric not between 0 and 1000000000 or (x->>'date')!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Registro de pago inválido.'; end if;
    perform (x->>'date')::date;
  end loop;
  if d ? 'showVat' and jsonb_typeof(d->'showVat')<>'boolean' then raise exception 'Desglose inválido.'; end if;
  if d ? 'supplier' then
    if jsonb_typeof(d->'supplier')<>'object' or coalesce(d->'supplier'->>'mode','')<>all(array['none','added','included']) or jsonb_typeof(d->'supplier'->'extras')<>'array' or jsonb_array_length(d->'supplier'->'extras')>500 then raise exception 'Costos extra inválidos.'; end if;
    for x in select value from jsonb_array_elements(d->'supplier'->'extras') loop
      if coalesce(x->>'type','')<>all(array['Error','Impresión extra']) or coalesce(x->>'product','')<>all(array['Butarga','Playera','Short']) or coalesce(x->>'cut','')<>all(array['Hombre','Mujer']) or coalesce(x->>'size','')='' or length(x->>'size')>30 or jsonb_typeof(x->'qty')<>'number' or (x->>'qty')::numeric not between 1 and 10000 or trunc((x->>'qty')::numeric)<>(x->>'qty')::numeric or jsonb_typeof(x->'cutting')<>'boolean' or length(coalesce(x->>'note',''))>500 then raise exception 'Error o impresión extra inválidos.'; end if;
    end loop;
  end if;
  if (d->>'dataOk')::boolean and jsonb_array_length(d->'rows')=0 then raise exception 'El pedido debe tener prendas.'; end if;
  if (d->>'confirmed')::boolean and (not (d->>'dataOk')::boolean or d->>'payerType'='pending') then raise exception 'Revisa el pedido y confirma el tipo de cliente antes de confirmar la cotización.'; end if;
  if (d->>'designOk')::boolean and (jsonb_array_length(d->'rows')=0 or (d->'images'->>'front' is null and d->'images'->>'back' is null)) then raise exception 'Agrega el diseño antes de aprobarlo.'; end if;
  if (d->>'paymentOk')::boolean and ((d->>'advance')::numeric<=0 or d->>'advanceDate'='' or (d->>'advanceSimulated')::boolean) then raise exception 'Valida un anticipo real antes de iniciar.'; end if;
  if d->>'startDate'<>'' and not ((d->>'dataOk')::boolean and (d->>'confirmed')::boolean and (d->>'designOk')::boolean and (d->>'paymentOk')::boolean) then raise exception 'Faltan las validaciones de pedido, cotización, diseño o anticipo.'; end if;
  if (d->>'released')::boolean and d->>'startDate'='' then raise exception 'Valida el inicio antes de pasar a costura.'; end if;
  if (d->>'sewn')::boolean and not (d->>'released')::boolean then raise exception 'Diseño debe liberar el pedido a costura.'; end if;
  if (d->>'packed')::boolean and not (d->>'sewn')::boolean then raise exception 'Costura debe validar antes de empacar.'; end if;
  if (d->>'shipped')::boolean and (not (d->>'packed')::boolean or trim(d->>'address')='' or trim(d->'shipment'->>'carrier')='' or trim(d->'shipment'->>'guide')='' or d->'shipment'->>'date'='') then raise exception 'Completa empaque, dirección, paquetería, guía y fecha antes del envío.'; end if;
  if (d->>'delivered')::boolean and (not (d->>'shipped')::boolean or d->'shipment'->>'status'<>'Entregado') then raise exception 'Registra primero el envío y después la entrega.'; end if;
end $$;

create or replace function proway_private.save_order_body(w uuid,r text,p jsonb,uid uuid,actor text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare stored proway_private.orders%rowtype; sett proway_private.settings%rowtype; patch jsonb=p->'patch'; expected jsonb=p->'expected'; guards jsonb=coalesce(p->'guards','{}'::jsonb); result jsonb; candidate jsonb; projected jsonb; k text; oid text; conflict boolean=false; resetting boolean=false;
begin
    oid=p->>'orderId'; if coalesce(oid,'')!~ '^[A-Za-z0-9_-]{1,64}$' or patch ? 'id' and patch->>'id'<>oid then raise exception 'Pedido inválido.'; end if;
    select * into stored from proway_private.orders where workspace_id=w and order_id=oid for update;
    if not found then
      if r<>'admin' then raise exception 'Solo administración puede crear pedidos.' using errcode='42501'; end if;
      if coalesce(p->>'baseVersion','0')::bigint<>0 then return jsonb_build_object('conflict',true,'id',oid,'version',0,'data',null); end if;
      if (select count(*) from proway_private.orders where workspace_id=w)>=1000 then raise exception 'Límite de pedidos alcanzado. Archiva y descarga un respaldo.'; end if;
      candidate=patch||jsonb_build_object('id',oid); perform proway_private.validate_order(candidate);
      insert into proway_private.orders(workspace_id,order_id,data,updated_by) values(w,oid,candidate,uid) returning * into stored;
    else
      projected=proway_private.project_order(stored.data,r);
      resetting=r='diseno' and (patch ? 'images' or patch ? 'additionalDesigns' or patch->'designOk'='false'::jsonb);
      for k in select jsonb_object_keys(patch) loop
        if r='consulta' or r='diseno' and k<>all(array['images','additionalDesigns','designOk','released']) and not (resetting and k=any(array['startDate','sewn','packed','shipped','delivered']) and patch->>k=any(array['','false'])) or r='costura' and k<>'sewn' or r='empaque' and k<>'packed' or r='envio' and k<>all(array['shipment','shipped','delivered']) then raise exception 'Tu departamento no puede modificar este campo: %',k using errcode='42501'; end if;
        if coalesce(projected->k,'null'::jsonb) is distinct from coalesce(expected->k,'null'::jsonb) and projected->k is distinct from patch->k then conflict=true; end if;
      end loop;
      for k in select jsonb_object_keys(guards) loop
        if coalesce(projected->k,'null'::jsonb) is distinct from coalesce(guards->k,'null'::jsonb) then conflict=true; end if;
      end loop;
      if conflict then return jsonb_build_object('conflict',true,'id',oid,'version',stored.version,'data',projected); end if;
      candidate=stored.data||patch;
      if (patch ? 'images' and patch->'images' is distinct from stored.data->'images') or (patch ? 'additionalDesigns' and patch->'additionalDesigns' is distinct from coalesce(stored.data->'additionalDesigns','[]'::jsonb)) then
        candidate=candidate||jsonb_build_object('designOk',false,'startDate','','released',false,'sewn',false,'packed',false,'shipped',false,'delivered',false);
      end if;
      if resetting or (patch ? 'images' and patch->'images' is distinct from stored.data->'images') or (patch ? 'additionalDesigns' and patch->'additionalDesigns' is distinct from coalesce(stored.data->'additionalDesigns','[]'::jsonb)) then candidate=jsonb_set(candidate,'{shipment,status}','"Preparación"'::jsonb); end if;
      if r='diseno' and resetting then candidate=candidate||jsonb_build_object('startDate','','released',false,'sewn',false,'packed',false,'shipped',false,'delivered',false); end if;
      -- Only the server appends shipment events; client event arrays cannot rewrite history.
      if patch ? 'shipment' then
        candidate=jsonb_set(candidate,'{shipment,events}',stored.data->'shipment'->'events');
        if candidate->'shipment'->>'status' is distinct from stored.data->'shipment'->>'status' then
          candidate=jsonb_set(candidate,'{shipment,events}',(stored.data->'shipment'->'events')||jsonb_build_array(jsonb_build_object('status',candidate->'shipment'->>'status','date',coalesce(nullif(candidate->'shipment'->>'date',''),(now() at time zone 'America/Mexico_City')::date::text))));
        end if;
      end if;
      perform proway_private.validate_order(candidate);
      update proway_private.orders set data=candidate,version=version+1,updated_by=uid,updated_at=now() where workspace_id=w and order_id=oid returning * into stored;
    end if;
    insert into proway_private.events(workspace_id,order_id,actor_id,actor,role,action) values(w,oid,uid,actor,r,case r when 'diseno' then 'Diseño actualizó el pedido' when 'costura' then 'Costura validó el pedido' when 'empaque' then 'Empaque validó el pedido' when 'envio' then 'Envío actualizó el seguimiento' else 'Administración actualizó el pedido' end);
    result=jsonb_build_object('ok',true,'id',oid,'version',stored.version,'data',proway_private.project_order(stored.data,r));
  return result;
end $$;
