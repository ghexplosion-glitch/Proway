-- Proway 1.9: optional product prices and captured garment price state.
-- Preserves all orders, settings values, role checks and public API permissions.
CREATE OR REPLACE FUNCTION proway_private.save_settings_body(w uuid, r text, p jsonb, uid uuid, actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare stored proway_private.orders%rowtype; sett proway_private.settings%rowtype; patch jsonb=p->'patch'; expected jsonb=p->'expected'; guards jsonb=coalesce(p->'guards','{}'::jsonb); result jsonb; candidate jsonb; projected jsonb; k text; oid text; conflict boolean=false; resetting boolean=false; e jsonb;
begin
    if r<>'admin' then raise exception 'Solo administración puede modificar precios y datos fiscales.' using errcode='42501'; end if;
    select * into sett from proway_private.settings where workspace_id=w for update;
    foreach k in array array(select jsonb_object_keys(patch)) loop
      if k<>all(array['basePrice','productPrices','cutPrice','rates','shortCosts','issuer','calendar','isrControl','designs','expenses']) then raise exception 'Configuración no permitida.'; end if;
      if coalesce(sett.data->k,'null'::jsonb) is distinct from coalesce(expected->k,'null'::jsonb) and sett.data->k is distinct from patch->k then conflict=true; end if;
    end loop;
    if conflict then return jsonb_build_object('conflict',true,'id','settings','version',sett.version,'data',sett.data); end if;
    candidate=sett.data||patch;
    if (candidate->>'basePrice')::numeric not between 0 and 1000000000 or (candidate->>'cutPrice')::numeric not between 0 and 1000000000 or jsonb_typeof(candidate->'rates') is distinct from 'array' or jsonb_array_length(candidate->'rates')>500 or candidate->'issuer'->>'legalType'<>'PF' or coalesce(candidate->'issuer'->>'regime','') not like '626%' or jsonb_typeof(candidate->'calendar'->'saturday') is distinct from 'boolean' or length(candidate->'calendar'->>'extra')>10000 or octet_length(candidate::text)>15000000 then raise exception 'Configuración inválida.'; end if;
    if candidate ? 'productPrices' then
      if jsonb_typeof(candidate->'productPrices') is distinct from 'object'
        or (select count(*) from jsonb_object_keys(candidate->'productPrices'))<>3 then raise exception 'Precios por producto inválidos.';end if;
      foreach k in array array['Butarga','Playera','Short'] loop
        if not (candidate->'productPrices' ? k) or
          (candidate->'productPrices'->k <> 'null'::jsonb and
           (jsonb_typeof(candidate->'productPrices'->k) is distinct from 'number' or (candidate->'productPrices'->>k)::numeric not between 0 and 1000000000)) then raise exception 'Precio de venta inválido: %',k;end if;
      end loop;
    end if;
    if candidate ? 'expenses' then
      if jsonb_typeof(candidate->'expenses') is distinct from 'array' or jsonb_array_length(candidate->'expenses')>10000 then raise exception 'Registro de egresos inválido.'; end if;
      for e in select value from jsonb_array_elements(candidate->'expenses') loop
        if jsonb_typeof(e) is distinct from 'object' or coalesce(e->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$'
          or jsonb_typeof(e->'amount') is distinct from 'number' or (e->>'amount')::numeric not between 0.01 and 1000000000
          or coalesce(e->>'category','') <> all(array['Hilos','Tela','Reparación de máquina','Costura','Sublimación y corte','Envío','Otro'])
          or coalesce(e->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((e->>'date')::date,'YYYY-MM-DD') <> e->>'date'
          or jsonb_typeof(e->'note') is distinct from 'string' or length(e->>'note')>500
          or jsonb_typeof(e->'client') is distinct from 'string' or (e->>'client'<>'' and e->>'client' !~ '^[A-Za-z0-9_-]{1,64}$') then raise exception 'Egreso inválido.'; end if;
      end loop;
      for e in select value from jsonb_array_elements(candidate->'expenses') loop
        if e ? 'baseAmount' or e ? 'iva' then
          if jsonb_typeof(e->'baseAmount') is distinct from 'number' or (e->>'baseAmount')::numeric not between 0 and 1000000000 or jsonb_typeof(e->'iva') is distinct from 'number' or (e->>'iva')::numeric not between 0 and 1000000000 or abs((e->>'amount')::numeric-(e->>'baseAmount')::numeric-(e->>'iva')::numeric)>0.011 then raise exception 'Base, IVA y total del egreso no coinciden.';end if;
        end if;
      end loop;
      if exists(select 1 from jsonb_array_elements(candidate->'expenses') a group by a->>'id' having count(*)>1) then raise exception 'Egreso duplicado.'; end if;
    end if;
    update proway_private.settings set data=candidate,version=version+1,updated_at=now() where workspace_id=w returning version into sett.version;
    insert into proway_private.events(workspace_id,actor_id,actor,role,action) values(w,uid,actor,r,'Administración actualizó la configuración');
    result=jsonb_build_object('ok',true,'id','settings','version',sett.version,'data',candidate);
  return result;
end $function$
;

CREATE OR REPLACE FUNCTION proway_private.validate_order(d jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare x jsonb; k text; n numeric; totalrows integer;
begin
  if jsonb_typeof(d)<>'object' or octet_length(d::text)>7000000 then raise exception 'Pedido demasiado grande o inválido.'; end if;
  if coalesce(d->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$' or jsonb_typeof(d->'name') is distinct from 'string' or length(d->>'name') not between 1 and 200 then raise exception 'Identificación inválida.'; end if;
  for k in select jsonb_object_keys(d) loop
    if k<>all(array['id','name','contact','phone','address','orderDate','rows','images','additionalDesigns','dataOk','confirmed','designOk','advance','advanceDate','advanceIsr','advanceCfdi','advanceSimulated','advanceRecord','payments','payerType','paymentOk','startDate','released','sewn','packed','shipped','delivered','source','sourceNote','vatMode','fiscal','shipment','showVat','supplier','quoteStatus','shippingQuote','plannedCosts','quality','refunds','cancellation','milestones']) then raise exception 'Campo de pedido no permitido: %',k; end if;
  end loop;
  if d ? 'quoteStatus' and (jsonb_typeof(d->'quoteStatus') is distinct from 'string' or coalesce(d->>'quoteStatus','')<>all(array['active','discarded','cancelled'])) then raise exception 'Estado de cotización inválido.'; end if;
  if d ? 'shippingQuote' then
    if jsonb_typeof(d->'shippingQuote') is distinct from 'object' or jsonb_typeof(d->'shippingQuote'->'amount') is distinct from 'number' or (d->'shippingQuote'->>'amount')::numeric not between 0 and 1000000000 or jsonb_typeof(d->'shippingQuote'->'description') is distinct from 'string' or length(d->'shippingQuote'->>'description')>200 then raise exception 'Envío de cotización inválido.'; end if;
    for k in select jsonb_object_keys(d->'shippingQuote') loop if k<>all(array['amount','description']) then raise exception 'Campo de envío cotizado no permitido.'; end if; end loop;
  end if;
  if d ? 'plannedCosts' then
    if jsonb_typeof(d->'plannedCosts') is distinct from 'object' then raise exception 'Costos previstos inválidos.'; end if;
    foreach k in array array['fabric','sewing','shipping','other'] loop
      if jsonb_typeof(d->'plannedCosts'->k) is distinct from 'number' or (d->'plannedCosts'->>k)::numeric not between 0 and 1000000000 then raise exception 'Costo previsto inválido.'; end if;
    end loop;
    for k in select jsonb_object_keys(d->'plannedCosts') loop if k<>all(array['fabric','sewing','shipping','other']) then raise exception 'Campo de costo no permitido.'; end if; end loop;
  end if;
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
  if coalesce(d->>'payerType','')<>all(array['pending','PF','PM']) or coalesce(d->>'vatMode','')<>all(array['none','included','added']) then raise exception 'Tipo fiscal inválido.'; end if;
  if jsonb_typeof(d->'rows') is distinct from 'array' or jsonb_array_length(d->'rows')>10000 then raise exception 'Listado inválido.'; end if;
  for x in select value from jsonb_array_elements(d->'rows') loop
    if x ? 'priceMode' then
      if jsonb_typeof(x->'priceMode') is distinct from 'string' or x->>'priceMode'<>all(array['auto','manual','pending'])
        or jsonb_typeof(x->'special') is distinct from 'number'
        or (x->>'priceMode'='pending' and (x->>'special')::numeric<>0) then raise exception 'Precio automático inválido.';end if;
      if (d->>'confirmed')::boolean and x->>'priceMode'='pending' then raise exception 'Completa los precios de venta antes de aprobar la cotización.';end if;
    end if;
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
  -- Optional fields preserve the compatibility of saved 1.4 orders.
  if d ? 'cancellation' then
    if jsonb_typeof(d->'cancellation') is distinct from 'object' or jsonb_typeof(d->'cancellation'->'date') is distinct from 'string' or jsonb_typeof(d->'cancellation'->'reason') is distinct from 'string' or length(d->'cancellation'->>'reason')>500 then raise exception 'Cancelación inválida.'; end if;
    if d->'cancellation'->>'date'<>'' then if d->'cancellation'->>'date'!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha inválida.'; end if;perform (d->'cancellation'->>'date')::date;end if;
    for k in select jsonb_object_keys(d->'cancellation') loop if k<>all(array['date','reason']) then raise exception 'Campo de cancelación inválido.';end if;end loop;
  end if;
  if d->>'quoteStatus'='cancelled' and (not(d ? 'cancellation') or coalesce(d->'cancellation'->>'date','')='' or trim(coalesce(d->'cancellation'->>'reason',''))='') then raise exception 'Indica fecha y motivo de cancelación.';end if;
  if d ? 'refunds' then
    if jsonb_typeof(d->'refunds') is distinct from 'array' or jsonb_array_length(d->'refunds')>1000 then raise exception 'Devoluciones inválidas.';end if;
    for x in select value from jsonb_array_elements(d->'refunds') loop
      if coalesce(x->>'id','')!~ '^[A-Za-z0-9_-]{1,64}$' or jsonb_typeof(x->'amount') is distinct from 'number' or (x->>'amount')::numeric not between 0.01 and 1000000000 or coalesce(x->>'date','')!~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(x->'note') is distinct from 'string' or length(x->>'note')>500 then raise exception 'Devolución inválida.';end if;
      perform (x->>'date')::date;
      for k in select jsonb_object_keys(x) loop if k<>all(array['id','date','amount','note']) then raise exception 'Campo de devolución inválido.';end if;end loop;
    end loop;
    if exists(select 1 from jsonb_array_elements(d->'refunds') refund_item group by refund_item->>'id' having count(*)>1) then raise exception 'Devolución duplicada.';end if;
    select coalesce(sum((refund_item->>'amount')::numeric),0) into n from jsonb_array_elements(d->'refunds') refund_item;
    if n>(case when d->'advanceRecord' is not null and d->'advanceRecord'<>'null'::jsonb and not coalesce((d->'advanceRecord'->>'simulated')::boolean,false) then coalesce((d->'advanceRecord'->>'amount')::numeric,0) else 0 end)+(select coalesce(sum((p->>'amount')::numeric),0) from jsonb_array_elements(d->'payments') p where not coalesce((p->>'simulated')::boolean,false)) then raise exception 'No puedes devolver más dinero del recibido.';end if;
  end if;
  if d ? 'quality' then
    if jsonb_typeof(d->'quality') is distinct from 'object' or jsonb_typeof(d->'quality'->'counts') is distinct from 'object' or jsonb_typeof(d->'quality'->'names') is distinct from 'boolean' or jsonb_typeof(d->'quality'->'design') is distinct from 'boolean' or jsonb_typeof(d->'quality'->'notes') is distinct from 'string' or length(d->'quality'->>'notes')>1000 or jsonb_typeof(d->'quality'->'checkedAt') is distinct from 'string' then raise exception 'Calidad inválida.';end if;
    for k in select jsonb_object_keys(d->'quality') loop if k<>all(array['counts','names','design','notes','checkedAt']) then raise exception 'Campo de calidad inválido.';end if;end loop;
    for k in select jsonb_object_keys(d->'quality'->'counts') loop
      if jsonb_typeof(d->'quality'->'counts'->k) is distinct from 'number' or (d->'quality'->'counts'->>k)::numeric not between 0 and 10000 or trunc((d->'quality'->'counts'->>k)::numeric)<>(d->'quality'->'counts'->>k)::numeric or not exists(select 1 from jsonb_array_elements(d->'rows') quality_row where quality_row->>'id'=k) then raise exception 'Conteo de calidad inválido.';end if;
    end loop;
    if d->'quality'->>'checkedAt'<>'' then
      if d->'quality'->>'checkedAt'!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha de calidad inválida.';end if;perform (d->'quality'->>'checkedAt')::date;
      if not coalesce((d->>'sewn')::boolean,false) or not coalesce((d->'quality'->>'names')::boolean,false) or not coalesce((d->'quality'->>'design')::boolean,false) or jsonb_array_length(d->'rows')=0 or exists(select 1 from jsonb_array_elements(d->'rows') quality_row where (d->'quality'->'counts'->>(quality_row->>'id'))::numeric is distinct from (quality_row->>'qty')::numeric) then raise exception 'Revisa conteo, nombres y diseño antes de validar calidad.';end if;
    end if;
  end if;
  if d ? 'milestones' then
    if jsonb_typeof(d->'milestones') is distinct from 'object' then raise exception 'Fechas de departamento inválidas.';end if;
    foreach k in array array['design','sewing','packing','shipping'] loop
      if jsonb_typeof(d->'milestones'->k) is distinct from 'string' then raise exception 'Fecha de departamento inválida.';end if;
      if d->'milestones'->>k<>'' then if d->'milestones'->>k!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha inválida.';end if;perform (d->'milestones'->>k)::date;end if;
    end loop;
    for k in select jsonb_object_keys(d->'milestones') loop if k<>all(array['design','sewing','packing','shipping']) then raise exception 'Campo de fecha inválido.';end if;end loop;
  end if;
  if d->'advanceRecord' ? 'vatMode' and coalesce(d->'advanceRecord'->>'vatMode','')<>all(array['none','added','included']) then raise exception 'IVA del anticipo inválido.';end if;
  for x in select value from jsonb_array_elements(d->'payments') loop if x ? 'vatMode' and coalesce(x->>'vatMode','')<>all(array['none','added','included']) then raise exception 'IVA histórico de pago inválido.';end if;end loop;
  if d->>'quoteStatus'='discarded' and (d->>'startDate'<>'' or (d->>'confirmed')::boolean or (d->>'designOk')::boolean or (d->>'paymentOk')::boolean or (d->>'released')::boolean or (d->>'sewn')::boolean or (d->>'packed')::boolean or (d->>'shipped')::boolean or (d->>'delivered')::boolean or (d->'advanceRecord' is not null and d->'advanceRecord'<>'null'::jsonb and not coalesce((d->'advanceRecord'->>'simulated')::boolean,false) and (coalesce((d->'advanceRecord'->>'amount')::numeric,0)>0 or coalesce((d->'advanceRecord'->>'retention')::numeric,0)>0)) or exists(select 1 from jsonb_array_elements(d->'payments') p where not coalesce((p->>'simulated')::boolean,false) and ((p->>'amount')::numeric>0 or (p->>'retention')::numeric>0))) then raise exception 'Recupera la cotización antes de validarla; los pedidos con cobros o producción iniciada deben conservarse.'; end if;
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
end $function$
;
