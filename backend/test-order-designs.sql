-- Validate synthetic orders only. Never insert or change a customer record.
begin;
do $test$
declare d jsonb; good jsonb; bad jsonb; rejected boolean;
begin
  d='{"id":"TEST","name":"Synthetic design client","contact":"","phone":"","address":"","orderDate":"","rows":[{"id":1,"product":"Butarga","size":"M","cut":"Hombre","qty":2,"printed":"Test","color":"Azul","design":"Azul","placement":"","special":""}],"images":{"front":null,"back":null},"dataOk":false,"confirmed":false,"designOk":false,"advance":0,"advanceDate":"","advanceIsr":0,"advanceCfdi":false,"advanceSimulated":false,"advanceRecord":null,"payments":[],"payerType":"PF","paymentOk":false,"startDate":"","released":false,"sewn":false,"packed":false,"shipped":false,"delivered":false,"source":"Test","sourceNote":"","vatMode":"included","showVat":false,"supplier":{"mode":"none","extras":[]},"fiscal":{"rfc":"","name":"","cp":"","regime":"","use":"","form":"","method":""},"shipment":{"carrier":"","guide":"","date":"","eta":"","status":"Preparación","events":[]}}'::jsonb;
  d=jsonb_set(d,'{rows,0,design}','"ASIS-SEC"');
  d=d||'{"designOk":true,"additionalDesigns":[{"id":"D-test","name":"ASIS-SEC","images":{"front":"data:image/png;base64,aGVsbG8=","back":null}}]}'::jsonb;
  perform proway_private.validate_order(d);good=d;
  bad=jsonb_set(d,'{rows,0,design}','"ASIS-PREPA"');
  rejected=false;begin perform proway_private.validate_order(bad);exception when others then rejected=true;end;
  if not rejected then raise exception 'Unassigned image was approved';end if;
  bad=jsonb_set(d,'{rows,0,design}','""');
  rejected=false;begin perform proway_private.validate_order(bad);exception when others then rejected=true;end;
  if not rejected then raise exception 'A garment without its own or primary image was approved';end if;
  bad=jsonb_set(d,'{additionalDesigns,0,images,front}','null');
  rejected=false;begin perform proway_private.validate_order(bad);exception when others then rejected=true;end;
  if not rejected then raise exception 'Empty named artwork was approved';end if;
  bad=jsonb_set(d,'{additionalDesigns,0,images,front}','"https://example.invalid/image.png"');
  rejected=false;begin perform proway_private.validate_order(bad);exception when others then rejected=true;end;
  if not rejected then raise exception 'Remote image bypassed embedded-image validation';end if;
  d=jsonb_set(d,'{rows,0,design}','" asis-sec "');perform proway_private.validate_order(d);
  d=jsonb_set(good,'{images,front}','"data:image/png;base64,aGVsbG8="');
  d=jsonb_set(d,'{rows,0,design}','"Legacy free text"');perform proway_private.validate_order(d);
  d=d||'{"designOk":false,"additionalDesigns":[],"quoteStatus":"discarded"}'::jsonb;perform proway_private.validate_order(d);
  bad=d||'{"advanceRecord":{"amount":100,"retention":0,"simulated":false}}'::jsonb;
  rejected=false;begin perform proway_private.validate_order(bad);exception when others then rejected=true;end;
  if not rejected then raise exception 'Paid order was allowed to be discarded';end if;
  bad=jsonb_set(good,'{rows}','[]');
  rejected=false;begin perform proway_private.validate_order(bad);exception when others then rejected=true;end;
  if not rejected then raise exception 'Empty order was approved';end if;
end $test$;
select '10 named-design and deletion validations passed' as result;
rollback;
