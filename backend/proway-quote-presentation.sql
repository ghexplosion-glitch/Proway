-- Optional private business profile for customer quotations; existing permissions remain in effect.
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
      if k<>all(array['basePrice','productPrices','cutPrice','rates','shortCosts','issuer','calendar','isrControl','designs','expenses','quoteBrand']) then raise exception 'Configuración no permitida.'; end if;
      if coalesce(sett.data->k,'null'::jsonb) is distinct from coalesce(expected->k,'null'::jsonb) and sett.data->k is distinct from patch->k then conflict=true; end if;
    end loop;
    if conflict then return jsonb_build_object('conflict',true,'id','settings','version',sett.version,'data',sett.data); end if;
    candidate=sett.data||patch;
    if candidate ? 'quoteBrand' then
      if jsonb_typeof(candidate->'quoteBrand') is distinct from 'object' or (select count(*) from jsonb_object_keys(candidate->'quoteBrand'))<>5 then raise exception 'Datos de Proway inválidos.';end if;
      foreach k in array array['name','rfc','address','phone','website'] loop
        if jsonb_typeof(candidate->'quoteBrand'->k) is distinct from 'string' then raise exception 'Datos de Proway incompletos.';end if;
      end loop;
      if exists(select 1 from jsonb_object_keys(candidate->'quoteBrand') x where x<>all(array['name','rfc','address','phone','website']))
        or length(trim(candidate->'quoteBrand'->>'name')) not between 1 and 200
        or length(candidate->'quoteBrand'->>'rfc')>20
        or (candidate->'quoteBrand'->>'rfc'<>'' and candidate->'quoteBrand'->>'rfc' !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$')
        or length(candidate->'quoteBrand'->>'address')>500 or length(candidate->'quoteBrand'->>'phone')>30
        or length(candidate->'quoteBrand'->>'website')>300
        or (candidate->'quoteBrand'->>'website'<>'' and candidate->'quoteBrand'->>'website' !~* '^https?://[^/@ ]+([/:?#].*)?$')
        then raise exception 'Datos de Proway inválidos.';end if;
    end if;

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
end $function$;
