-- Proway 1.13: an unused primary image is optional when every garment has
-- a named design with an image. Preserve the existing validator and permissions.
-- Fail closed if the installed validator differs from the inspected version.
do $migration$
declare definition text; old_condition text; new_condition text;
begin
  definition=pg_get_functiondef('proway_private.validate_order(jsonb)'::regprocedure);
  old_condition=$old$if (d->>'designOk')::boolean and (jsonb_array_length(d->'rows')=0 or (d->'images'->>'front' is null and d->'images'->>'back' is null)) then raise exception 'Agrega el diseño antes de aprobarlo.'; end if;$old$;
  new_condition=$new$if (d->>'designOk')::boolean and (jsonb_array_length(d->'rows')=0 or
    (d->'images'->>'front' is null and d->'images'->>'back' is null and
      exists(select 1 from jsonb_array_elements(d->'rows') garment where not exists(
        select 1 from jsonb_array_elements(coalesce(d->'additionalDesigns','[]'::jsonb)) artwork
        where lower(trim(artwork->>'name'))=lower(trim(garment->>'design'))
          and (artwork->'images'->>'front' is not null or artwork->'images'->>'back' is not null)))))
    then raise exception 'Agrega las imágenes del diseño asignado a cada prenda antes de aprobar.'; end if;$new$;
  if strpos(definition,new_condition)>0 then return; end if;
  if strpos(definition,old_condition)=0 then raise exception 'Revisa la versión instalada de validate_order antes de actualizar.'; end if;
  execute replace(definition,old_condition,new_condition);
end $migration$;
