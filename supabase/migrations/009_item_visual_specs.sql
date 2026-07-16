-- Read-only visual descriptions for assessment items. Answer specifications
-- remain server-only; this column only carries the geometry necessary to draw
-- a question such as a labelled point on a number line.
alter table public.items
  add column if not exists visual_spec jsonb;

alter table public.items
  drop constraint if exists items_visual_spec_shape_check;

alter table public.items
  add constraint items_visual_spec_shape_check
  check (
    visual_spec is null
    or (
      jsonb_typeof(visual_spec) = 'object'
      and visual_spec ->> 'kind' = 'number_line'
      and (visual_spec ->> 'denominator') ~ '^(?:[2-9]|1[0-9]|20)$'
      and (visual_spec ->> 'markedNumerator') ~ '^[1-9][0-9]*$'
      and (visual_spec ->> 'pointLabel') ~ '^[A-Za-z][A-Za-z0-9 _-]{0,31}$'
      and (visual_spec ->> 'markedNumerator')::integer < (visual_spec ->> 'denominator')::integer
    )
  ) not valid;

-- The existing generated-practice finalizer already writes each item's
-- parametric_spec. A trigger derives the safe visual from that trusted source
-- so installations that applied migration 006 before this feature gain visual
-- persistence without a risky replacement of its large atomic finalizer.
create or replace function public.attach_generated_number_line_visual()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parametric_spec ->> 'kind' = 'number_line' then
    update public.items
      set visual_spec = jsonb_build_object(
        'kind', 'number_line',
        'denominator', (new.parametric_spec ->> 'denominator')::integer,
        'markedNumerator', (new.parametric_spec ->> 'numerator')::integer,
        'pointLabel', 'C'
      )
      where id = new.item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists generated_practice_item_visual_spec on public.generated_practice_items;
create trigger generated_practice_item_visual_spec
  after insert or update of parametric_spec on public.generated_practice_items
  for each row execute function public.attach_generated_number_line_visual();

-- Backfill any generated plans that existed before the trigger.
update public.items item
  set visual_spec = jsonb_build_object(
    'kind', 'number_line',
    'denominator', (generated.parametric_spec ->> 'denominator')::integer,
    'markedNumerator', (generated.parametric_spec ->> 'numerator')::integer,
    'pointLabel', 'C'
  )
  from public.generated_practice_items generated
  where generated.item_id = item.id
    and generated.parametric_spec ->> 'kind' = 'number_line'
    and item.visual_spec is null;

-- The finalizer is service-only and the trigger is only invoked by its
-- generated_practice_items insert. Browser roles receive no mutation surface.
revoke all on function public.attach_generated_number_line_visual() from public;
