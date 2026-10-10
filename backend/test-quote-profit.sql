-- Isolated quotation lifecycle checks. Synthetic records are rolled back.
begin;
do $$
declare uid uuid=gen_random_uuid(); w uuid=gen_random_uuid(); op uuid;
  d jsonb; result jsonb; previous jsonb; patch jsonb; expected jsonb; viewdata jsonb; rejected boolean; n integer;
  art text='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
begin
  insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values(uid,'proway-quote-test-'||uid::text||'@example.invalid',now(),false,'{}');
  insert into proway_private.workspaces(id,name,owner_id) values(w,'Transactional quotation test',uid);
  insert into proway_private.members(workspace_id,user_id,role,display_name) values(w,uid,'admin','Test');
  insert into proway_private.settings(workspace_id,data) values(w,'{"basePrice":800,"cutPrice":10,"rates":[],"shortCosts":{},"issuer":{"name":"","rfc":"","cp":"","legalType":"PF","regime":"626"},"calendar":{"saturday":false,"extra":""},"isrControl":{"month":"2026-10","external":{}},"designs":[],"expenses":[]}');
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  d='{"id":"TEST","name":"Synthetic design client","contact":"","phone":"","address":"","orderDate":"","rows":[{"id":1,"product":"Butarga","size":"M","cut":"Hombre","qty":2,"printed":"Test","color":"Azul","design":"Azul","placement":"","special":""}],"images":{"front":null,"back":null},"dataOk":false,"confirmed":false,"designOk":false,"advance":0,"advanceDate":"","advanceIsr":0,"advanceCfdi":false,"advanceSimulated":false,"advanceRecord":null,"payments":[],"payerType":"PF","paymentOk":false,"startDate":"","released":false,"sewn":false,"packed":false,"shipped":false,"delivered":false,"source":"Test","sourceNote":"","vatMode":"included","showVat":false,"supplier":{"mode":"none","extras":[]},"fiscal":{"rfc":"","name":"","cp":"","regime":"","use":"","form":"","method":""},"shipment":{"carrier":"","guide":"","date":"","eta":"","status":"Preparación","events":[]}}';

  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'baseVersion',0,'patch',d,'expected','{}'::jsonb));
  if result->'ok'<>'true'::jsonb or result->'data' ? 'quoteStatus' then raise exception 'Legacy quotation was rewritten'; end if;
  previous=result->'data';
  patch='{"shippingQuote":{"amount":232,"description":"Paquetería a domicilio"},"plannedCosts":{"fabric":200,"sewing":160,"shipping":120,"other":20}}';op=gen_random_uuid();
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',op,'patch',patch,'expected','{"shippingQuote":null,"plannedCosts":null}'::jsonb));
  if result->'ok'<>'true'::jsonb or result->'data'->'shippingQuote'->>'amount'<>'232' or result->'data'->'rows'<>d->'rows' then raise exception 'Shipping or forecast changed garments'; end if;
  if public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',op,'patch',patch,'expected','{"shippingQuote":null,"plannedCosts":null}'::jsonb))<>result then raise exception 'Retry duplicated quotation mutation'; end if;
  for patch in select unnest(array[
    '{"shippingQuote":{"amount":-1,"description":"Test"}}'::jsonb,
    '{"shippingQuote":{"amount":1,"description":12}}'::jsonb,
    '{"shippingQuote":{"amount":1,"description":"Test","secret":9}}'::jsonb,
    '{"shippingQuote":null}'::jsonb,
    '{"plannedCosts":{"fabric":-1,"sewing":0,"shipping":0,"other":0}}'::jsonb,
    '{"plannedCosts":{"fabric":1,"sewing":0,"shipping":0}}'::jsonb,
    '{"plannedCosts":{"fabric":1,"sewing":0,"shipping":0,"other":0,"price":1}}'::jsonb,
    '{"quoteStatus":"deleted"}'::jsonb
  ]) loop
    rejected=false;begin perform proway_private.validate_order(result->'data'||patch);exception when sqlstate 'P0001' then rejected=true;end;
    if not rejected then raise exception 'Invalid quotation fields accepted: %',patch; end if;
  end loop;
  d=result->'data'||jsonb_build_object('images',jsonb_build_object('front',art,'back',null))||'{"dataOk":true,"confirmed":true,"designOk":true,"advance":100,"advanceDate":"2026-10-09","paymentOk":true,"advanceRecord":{"date":"2026-10-09","amount":100,"retention":0,"documented":false,"simulated":false},"startDate":"2026-10-09","released":true,"sewn":true,"packed":true}';
  perform proway_private.validate_order(d);update proway_private.orders set data=d where workspace_id=w and order_id='TEST';
  patch='{"shippingQuote":{"amount":250,"description":"Entrega"}}';
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch',patch,'expected',jsonb_build_object('shippingQuote',d->'shippingQuote')));
  if result->'data'->>'confirmed'<>'false' or result->'data'->>'paymentOk'<>'false' or result->'data'->>'startDate'<>'' or result->'data'->>'sewn'<>'false' or result->'data'->>'packed'<>'false' or result->'data'->'shipment'->>'status'<>'Preparación' then raise exception 'Shipping change did not reset quote approvals and progress'; end if;
  if result->'data'->'advanceRecord'<>d->'advanceRecord' or result->'data'->'images'<>d->'images' then raise exception 'Shipping edit erased cash or artwork'; end if;
  -- A stale caller cannot erase paid records to force an archive.
  rejected=false;begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"quoteStatus":"discarded","advanceRecord":null,"advance":0,"payments":[]}'::jsonb,'expected',jsonb_build_object('quoteStatus',null,'advanceRecord',d->'advanceRecord','advance',100,'payments',d->'payments')));exception when sqlstate 'P0001' then rejected=true;end;
  if not rejected then raise exception 'Paid order was discarded by erasing its advance'; end if;
  d=result->'data'||'{"advance":0,"advanceDate":"","advanceRecord":null,"paymentOk":false,"confirmed":false,"designOk":false}';update proway_private.orders set data=d where workspace_id=w and order_id='TEST';
  patch='{"quoteStatus":"discarded"}';op=gen_random_uuid();
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',op,'patch',patch,'expected','{"quoteStatus":null}'::jsonb));
  if result->'data'->>'quoteStatus'<>'discarded' or result->'data'->'rows'<>d->'rows' or result->'data'->'plannedCosts'<>d->'plannedCosts' or result->'data'->'shippingQuote'<>d->'shippingQuote' then raise exception 'Discard erased quotation contents'; end if;
  if public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',op,'patch',patch,'expected','{"quoteStatus":null}'::jsonb))<>result then raise exception 'Discard retry was not idempotent'; end if;
  viewdata=proway_private.project_order(result->'data','diseno');
  if viewdata->>'quoteStatus'<>'discarded' or viewdata->'shippingQuote'->>'amount'<>'0' or viewdata->'plannedCosts'->>'fabric'<>'0' then raise exception 'Department projection hid state or leaked costs'; end if;
  update proway_private.members set role='diseno' where workspace_id=w and user_id=uid;rejected=false;
  begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"designOk":true}'::jsonb,'expected','{"designOk":false}'::jsonb));exception when insufficient_privilege then rejected=true;end;
  if not rejected then raise exception 'Designer continued a discarded quote'; end if;
  rejected=false;begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"quoteStatus":"active"}'::jsonb,'expected','{"quoteStatus":"discarded"}'::jsonb));exception when insufficient_privilege then rejected=true;end;
  if not rejected then raise exception 'Department restored a quote'; end if;
  update proway_private.members set role='admin' where workspace_id=w and user_id=uid;
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"quoteStatus":"active"}'::jsonb,'expected','{"quoteStatus":"discarded"}'::jsonb));
  if result->'data'->>'quoteStatus'<>'active' or result->'data'->'rows'<>d->'rows' or result->'data'->'images'<>d->'images' then raise exception 'Restore did not retain original quotation'; end if;
  -- New internal costs leave existing production/payment validations untouched.
  previous=result->'data'||'{"confirmed":true,"designOk":true,"advance":100,"advanceDate":"2026-10-09","paymentOk":true,"startDate":"2026-10-09","released":true}';
  update proway_private.orders set data=previous where workspace_id=w and order_id='TEST';
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"plannedCosts":{"fabric":500,"sewing":250,"shipping":120,"other":50}}'::jsonb,'expected',jsonb_build_object('plannedCosts',previous->'plannedCosts')));
  if result->'data'->>'startDate'<>'2026-10-09' or result->'data'->>'paymentOk'<>'true' or result->'data'->>'released'<>'true' then raise exception 'Forecast edit reset production'; end if;
  for n in 1..2 loop
    update proway_private.members set role=case when n=1 then 'diseno' else 'envio' end where workspace_id=w and user_id=uid;rejected=false;
    viewdata=proway_private.project_order(result->'data',case when n=1 then 'diseno' else 'envio' end);
    begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"shippingQuote":{"amount":999,"description":"Forbidden"}}'::jsonb,'expected',jsonb_build_object('shippingQuote',viewdata->'shippingQuote')));exception when insufficient_privilege then rejected=true;end;
    if not rejected then raise exception 'Department changed quotation shipping'; end if;
  end loop;
  update proway_private.members set role='admin' where workspace_id=w and user_id=uid;
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"sewn":true}'::jsonb,'expected','{"sewn":false}'::jsonb,'guards','{"quoteStatus":"discarded"}'::jsonb));
  if result->'conflict'<>'true'::jsonb then raise exception 'Stale quote status guard was ignored'; end if;
  if public.proway_api('sync',w,'{}')->'orders'->0->'data'->'plannedCosts'->>'fabric'<>'500' then raise exception 'Synchronization omitted forecasts'; end if;
  if exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='proway_private' and p.proname in ('project_order','validate_order','save_order_body') and (p.prosecdef or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then raise exception 'Helper privilege boundary changed'; end if;
end $$;
rollback;
select jsonb_build_object('passed',26,'test_workspaces_remaining',(select count(*) from proway_private.workspaces where name='Transactional quotation test')) as quotation_checks;
