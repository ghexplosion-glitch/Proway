-- Isolated product-price checks. Synthetic workspace and user are rolled back.
begin;
do $$
declare uid uuid=gen_random_uuid(); w uuid=gen_random_uuid(); d jsonb; result jsonb; previous jsonb; patch jsonb; candidate jsonb; projected jsonb; rejected boolean; checks integer=0;
begin
  insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values(uid,'proway-prices-test-'||uid::text||'@example.invalid',now(),false,'{}');
  insert into proway_private.workspaces(id,name,owner_id) values(w,'Transactional product prices test',uid);
  insert into proway_private.members(workspace_id,user_id,role,display_name) values(w,uid,'admin','Synthetic prices test');
  insert into proway_private.settings(workspace_id,data) values(w,'{"basePrice":800,"cutPrice":10,"rates":[],"shortCosts":{},"issuer":{"name":"","rfc":"","cp":"","legalType":"PF","regime":"626"},"calendar":{"saturday":false,"extra":""},"isrControl":{"month":"2026-10","external":{}},"designs":[],"expenses":[]}');
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  d='{"id":"TEST","name":"Synthetic design client","contact":"","phone":"","address":"","orderDate":"","rows":[{"id":1,"product":"Butarga","size":"M","cut":"Hombre","qty":2,"printed":"Test","color":"Azul","design":"Azul","placement":"","special":""}],"images":{"front":null,"back":null},"dataOk":false,"confirmed":false,"designOk":false,"advance":0,"advanceDate":"","advanceIsr":0,"advanceCfdi":false,"advanceSimulated":false,"advanceRecord":null,"payments":[],"payerType":"PF","paymentOk":false,"startDate":"","released":false,"sewn":false,"packed":false,"shipped":false,"delivered":false,"source":"Test","sourceNote":"","vatMode":"included","showVat":false,"supplier":{"mode":"none","extras":[]},"fiscal":{"rfc":"","name":"","cp":"","regime":"","use":"","form":"","method":""},"shipment":{"carrier":"","guide":"","date":"","eta":"","status":"Preparación","events":[]}}';
  perform proway_private.validate_order(d);checks=checks+1;
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'baseVersion',0,'patch',d,'expected','{}'::jsonb));
  if result->'ok'<>'true'::jsonb or result->'data'->'rows'<>d->'rows' then raise exception 'Legacy order changed';end if;checks=checks+1;
  previous=result->'data';
  patch='{"productPrices":{"Butarga":800,"Playera":300,"Short":200}}';
  result=public.proway_api('save_settings',w,jsonb_build_object('operationId',gen_random_uuid(),'patch',patch,'expected','{"productPrices":null}'::jsonb));
  if result->'ok'<>'true'::jsonb or result->'data'->'productPrices'<>patch->'productPrices' then raise exception 'Catalog failed to save';end if;checks=checks+1;
  if (select data from proway_private.orders where workspace_id=w and order_id='TEST')<>previous then raise exception 'Catalog repriced the existing order';end if;checks=checks+1;
  if public.proway_api('sync',w,'{}')->'settings'->'productPrices'<>patch->'productPrices' then raise exception 'Catalog failed to synchronize';end if;checks=checks+1;
  for candidate in select unnest(array[
    'null'::jsonb,'[]'::jsonb,'{}'::jsonb,
    '{"Butarga":800,"Playera":300}'::jsonb,
    '{"Butarga":800,"Playera":300,"Short":200,"Other":10}'::jsonb,
    '{"Butarga":800,"Playera":-1,"Short":200}'::jsonb,
    '{"Butarga":800,"Playera":"300","Short":200}'::jsonb,
    '{"Butarga":800,"Playera":300,"Short":1000000001}'::jsonb
  ]) loop
    rejected=false;
    begin perform public.proway_api('save_settings',w,jsonb_build_object('operationId',gen_random_uuid(),'patch',jsonb_build_object('productPrices',candidate),'expected',patch));exception when others then rejected=true;end;
    if not rejected then raise exception 'Invalid catalog accepted: %',candidate;end if;checks=checks+1;
  end loop;
  result=public.proway_api('save_settings',w,jsonb_build_object('operationId',gen_random_uuid(),'patch','{"basePrice":850}'::jsonb,'expected','{"basePrice":800}'::jsonb));
  if result->'ok'<>'true'::jsonb or result->'data'->'productPrices'<>patch->'productPrices' then raise exception 'Older clients overwrite catalog';end if;checks=checks+1;
  result=public.proway_api('save_settings',w,jsonb_build_object('operationId',gen_random_uuid(),'patch','{"productPrices":{"Butarga":800,"Playera":0,"Short":null}}'::jsonb,'expected',patch));
  if result->'ok'<>'true'::jsonb then raise exception 'Explicit zero and missing product price rejected';end if;checks=checks+1;
  candidate=jsonb_set(d,'{rows,0}',(d->'rows'->0)||'{"product":"Playera","special":300,"priceMode":"auto"}'::jsonb);
  perform proway_private.validate_order(candidate);checks=checks+1;
  projected=proway_private.project_order(candidate,'diseno');
  if (projected->'rows'->0) ? 'priceMode' or (projected->'rows'->0)->>'special'<>'' then raise exception 'Department received financial price';end if;checks=checks+1;
  perform proway_private.validate_order(jsonb_set(candidate,'{rows,0}',(candidate->'rows'->0)||'{"special":0,"priceMode":"manual"}'::jsonb));checks=checks+1;
  candidate=jsonb_set(candidate,'{rows,0}',(candidate->'rows'->0)||'{"special":0,"priceMode":"pending"}'::jsonb);
  perform proway_private.validate_order(candidate);checks=checks+1;
  rejected=false;begin perform proway_private.validate_order(jsonb_set(candidate,'{confirmed}','true'::jsonb));exception when others then rejected=true;end;
  if not rejected then raise exception 'Pending price order approved';end if;checks=checks+1;
  for patch in select unnest(array['{"special":12,"priceMode":"pending"}'::jsonb,'{"special":300,"priceMode":"invalid"}'::jsonb,'{"special":"300","priceMode":"auto"}'::jsonb,'{"special":-1,"priceMode":"manual"}'::jsonb]) loop
    rejected=false;begin perform proway_private.validate_order(jsonb_set(candidate,'{rows,0}',(candidate->'rows'->0)||patch));exception when others then rejected=true;end;
    if not rejected then raise exception 'Invalid captured price accepted';end if;checks=checks+1;
  end loop;
  update proway_private.members set role='diseno' where workspace_id=w and user_id=uid;
  rejected=false;begin perform public.proway_api('save_settings',w,jsonb_build_object('operationId',gen_random_uuid(),'patch','{"productPrices":{"Butarga":1,"Playera":1,"Short":1}}'::jsonb,'expected','{}'::jsonb));exception when insufficient_privilege then rejected=true;end;
  if not rejected then raise exception 'Department changed prices';end if;checks=checks+1;
  if public.proway_api('sync',w,'{}')->'settings' ? 'productPrices' then raise exception 'Department received private catalog';end if;checks=checks+1;
  if exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='proway_private' and p.proname in ('validate_order','save_settings_body') and (p.prosecdef or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then raise exception 'Helper privilege boundary changed';end if;checks=checks+1;
  if checks<>27 then raise exception 'Expected 27 checks, got %',checks;end if;
end $$;
rollback;
select jsonb_build_object('passed',27,'test_workspaces_remaining',(select count(*) from proway_private.workspaces where name='Transactional product prices test')) as product_price_checks;
