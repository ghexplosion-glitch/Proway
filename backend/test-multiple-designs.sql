-- Isolated RPC checks. The generated user and workspace disappear at ROLLBACK.
begin;
do $$
declare uid uuid=gen_random_uuid(); w uuid=gen_random_uuid(); op uuid=gen_random_uuid();
  d jsonb; patch jsonb; expected jsonb; result jsonb; previous jsonb; extra jsonb;
  art text='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  rejected boolean; n integer; v bigint;
begin
  insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
    values(uid,'proway-design-test-'||uid::text||'@example.invalid',now(),false,'{}');
  insert into proway_private.workspaces(id,name,owner_id) values(w,'Transactional design test',uid);
  insert into proway_private.members(workspace_id,user_id,role,display_name) values(w,uid,'admin','Test');
  insert into proway_private.settings(workspace_id,data) values(w,'{"basePrice":800,"cutPrice":10,"rates":[],"shortCosts":{},"issuer":{"name":"","rfc":"","cp":"","legalType":"PF","regime":"626"},"calendar":{"saturday":false,"extra":""},"isrControl":{"month":"2026-10","external":{}},"designs":[],"expenses":[]}');
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  d='{"id":"TEST","name":"Synthetic design client","contact":"","phone":"","address":"","orderDate":"","rows":[{"id":1,"product":"Butarga","size":"M","cut":"Hombre","qty":2,"printed":"Test","color":"Azul","design":"Azul","placement":"","special":""}],"images":{"front":null,"back":null},"dataOk":false,"confirmed":false,"designOk":false,"advance":0,"advanceDate":"","advanceIsr":0,"advanceCfdi":false,"advanceSimulated":false,"advanceRecord":null,"payments":[],"payerType":"PF","paymentOk":false,"startDate":"","released":false,"sewn":false,"packed":false,"shipped":false,"delivered":false,"source":"Test","sourceNote":"","vatMode":"included","showVat":false,"supplier":{"mode":"none","extras":[]},"fiscal":{"rfc":"","name":"","cp":"","regime":"","use":"","form":"","method":""},"shipment":{"carrier":"","guide":"","date":"","eta":"","status":"Preparación","events":[]}}';
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',op,'baseVersion',0,'patch',d,'expected','{}'::jsonb));
  if result->'ok'<>'true'::jsonb or result->'data' ? 'additionalDesigns' then raise exception 'Legacy order compatibility failed'; end if;
  if proway_private.project_order(result->'data','diseno')->'additionalDesigns'<>'[]'::jsonb then raise exception 'Legacy department projection failed'; end if;
  extra=jsonb_build_object('id','D-blue','name','Azul','images',jsonb_build_object('front',art,'back',art));
  patch=jsonb_build_object('additionalDesigns',jsonb_build_array(extra),'images',jsonb_build_object('front',art,'back',art));op=gen_random_uuid();
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',op,'patch',patch,'expected',jsonb_build_object('additionalDesigns',null,'images',d->'images'),'guards','{}'::jsonb));
  if result->'ok'<>'true'::jsonb or result->'data'->'additionalDesigns'->0->>'name'<>'Azul' or result->'data'->'rows'<>d->'rows' then raise exception 'Additional artwork changed the garments'; end if;
  v=(result->>'version')::bigint;
  if public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',op,'patch',patch,'expected',jsonb_build_object('additionalDesigns',null,'images',d->'images'),'guards','{}'::jsonb))<>result or (select version from proway_private.orders where workspace_id=w)<>v then raise exception 'Retry duplicated artwork'; end if;
  d=result->'data';
  foreach patch in array array[
    jsonb_build_object('additionalDesigns',jsonb_build_array(extra,extra)),
    jsonb_build_object('additionalDesigns',jsonb_build_array(jsonb_set(extra,'{images,front}','"https://invalid.test/image.png"'::jsonb))),
    jsonb_build_object('additionalDesigns',jsonb_build_array(extra||'{"price":500}'::jsonb)),
    jsonb_build_object('additionalDesigns',jsonb_build_array(extra||'{"name":""}'::jsonb))
  ] loop
    rejected=false;
    begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch',patch,'expected',jsonb_build_object('additionalDesigns',d->'additionalDesigns'),'guards','{}'::jsonb));
    exception when sqlstate 'P0001' then rejected=true; end;
    if not rejected then raise exception 'Invalid additional design accepted'; end if;
  end loop;
  patch='[]'::jsonb;for n in 1..9 loop patch=patch||jsonb_build_array(extra||jsonb_build_object('id','D-'||n)); end loop;rejected=false;
  begin perform proway_private.validate_order(d||jsonb_build_object('additionalDesigns',patch));exception when sqlstate 'P0001' then rejected=true;end;
  if not rejected then raise exception 'Ninth additional design accepted'; end if;
  rejected=false;
  begin perform proway_private.validate_order(d||jsonb_build_object('designOk',true,'additionalDesigns',jsonb_build_array(extra||'{"images":{"front":null,"back":null}}'::jsonb)));exception when sqlstate 'P0001' then rejected=true;end;
  if not rejected then raise exception 'Incomplete artwork could be approved'; end if;
  -- The synthetic order enters production before the designer revises its artwork.
  d=d||'{"dataOk":true,"confirmed":true,"designOk":true,"advance":100,"advanceDate":"2026-10-09","paymentOk":true,"startDate":"2026-10-09","released":true,"sewn":true,"packed":true}';
  perform proway_private.validate_order(d);update proway_private.orders set data=d where workspace_id=w and order_id='TEST';
  update proway_private.members set role='diseno' where workspace_id=w and user_id=uid;
  previous=proway_private.project_order(d,'diseno');
  if previous->'additionalDesigns'<>d->'additionalDesigns' or previous->>'advance'<>'0' or previous->'rows'->0->>'special'<>'' then raise exception 'Department projection leaked finances or omitted artwork'; end if;
  patch=jsonb_build_object('additionalDesigns',jsonb_build_array(extra||'{"name":"Azul revisado"}'));
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch',patch,'expected',jsonb_build_object('additionalDesigns',previous->'additionalDesigns'),'guards',jsonb_build_object('sewn',true)));
  if result->'ok'<>'true'::jsonb or result->'data'->'additionalDesigns'->0->>'name'<>'Azul revisado' then raise exception 'Design department could not revise artwork'; end if;
  if result->'data'->>'startDate'<>'' or result->'data'->>'designOk'<>'false' or result->'data'->>'released'<>'false' or result->'data'->>'sewn'<>'false' or result->'data'->>'packed'<>'false' then raise exception 'Artwork revision did not reset approval and production'; end if;
  if result->'data'->'shipment'->>'status'<>'Preparación' or (select data->'advance' from proway_private.orders where workspace_id=w)<>d->'advance' then raise exception 'Revision changed the advance or failed to reset shipping'; end if;
  rejected=false;
  begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"advance":200}'::jsonb,'expected','{"advance":0}'::jsonb));exception when insufficient_privilege then rejected=true;end;
  if not rejected then raise exception 'Design department could change prices'; end if;
  update proway_private.members set role='costura' where workspace_id=w and user_id=uid;rejected=false;
  begin perform public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch',patch,'expected',jsonb_build_object('additionalDesigns',result->'data'->'additionalDesigns')));exception when insufficient_privilege then rejected=true;end;
  if not rejected then raise exception 'Costura could modify artwork'; end if;
  result=public.proway_api('save_order',w,jsonb_build_object('orderId','TEST','operationId',gen_random_uuid(),'patch','{"sewn":true}'::jsonb,'expected','{"sewn":false}'::jsonb,'guards',jsonb_build_object('additionalDesigns',previous->'additionalDesigns')));
  if result->'conflict'<>'true'::jsonb then raise exception 'Old production approval ignored changed artwork'; end if;
  if (public.proway_api('sync',w,'{}')->'orders'->0->'data'->'additionalDesigns'->0->>'name')<>'Azul revisado' then raise exception 'Synchronization omitted the revised design'; end if;
end $$;
rollback;
select jsonb_build_object('passed',18,'test_workspaces_remaining',(select count(*) from proway_private.workspaces where name='Transactional design test')) as design_checks;
