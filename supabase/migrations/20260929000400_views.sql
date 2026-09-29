-- Derived views: one row per household / member / net with the flags the
-- dashboard counts. All metric definitions live here, so changing a definition
-- means editing one view.
--
-- security_invoker = true: the caller's RLS applies to the underlying tables.
-- Only active MRCs (the 26 surveillance sites) are included.

-- Treat -7 (don't know) / -8 (refused) as missing.
create or replace function public.nz(v integer)
returns integer
language sql
immutable
as $$ select case when v in (-7, -8) then null else v end $$;

-- Comma-separated checkbox answer ("1,2,4") -> text[]
create or replace function public.checkbox(v text)
returns text[]
language sql
immutable
as $$ select string_to_array(replace(coalesce(v, ''), ' ', ''), ',') $$;

create or replace view public.v_member
with (security_invoker = true) as
select
  p.uniqueid,
  p.parent_uniqueid,
  p.hhid,
  p.linenum,
  m.mrccode,
  m.short_name as mrc,
  m.district,
  p.startdate,
  public.nz(p.age) as age,
  public.nz(p.gender) as gender,
  -- Samples
  public.checkbox(p.samples_collected) && array['1', '2', '3', '4'] as any_sample,
  '1' = any (public.checkbox(p.samples_collected)) as sample_bs,
  '2' = any (public.checkbox(p.samples_collected)) as sample_fp,
  -- Malaria / clinical
  public.nz(p.fever) = 1 as fever,
  public.nz(p.feverortemp) = 1 as febrile,
  public.nz(p.rdtdone) = 1 as rdt_done,
  public.nz(p.rdtrslt) in (1, 2, 3) as rdt_pos,
  public.nz(p.rdtrslt) = 1 as rdt_pf,
  public.nz(p.rdtrslt) = 2 as rdt_pan,
  public.nz(p.rdtrslt) = 3 as rdt_mixed,
  public.nz(p.al) = 1 as al_prescribed,
  case when p.hemoglobin between 1 and 20 then p.hemoglobin end as hemoglobin,
  public.nz(p.hm_malaria) = 1 as treated_malaria_6m,
  public.nz(p.hm_malaria_mrc) = 1 as treated_at_mrc,
  -- Nets
  public.nz(p.sleephere) = 1 as slept_here,
  exists (
    select 1 from public.nets n
    where n.parent_uniqueid = p.parent_uniqueid
      and p.linenum::text = any (public.checkbox(n.sleptunder))
  ) as slept_under_net,
  -- Vaccines (asked for children < 3)
  public.nz(p.vx_card) = 1 as vx_card,
  public.nz(p.vx_any) = 1 as r21_any,
  coalesce(public.nz(p.vx_doses_received), 0) as r21_doses,
  public.nz(p.vx_doses_received_ver) = 2 as r21_card_verified,
  public.nz(p.hib_any) = 1 as hib_any,
  coalesce(public.nz(p.hib_doses_received), 0) as hib_doses
from public.hh_members p
join public.mrc m on m.mrccode = p.mrccode and m.active;

create or replace view public.v_household
with (security_invoker = true) as
select
  h.uniqueid,
  h.hhid,
  m.mrccode,
  m.short_name as mrc,
  m.district,
  h.villagecode,
  h.startdate,
  h.synced_at,
  public.nz(h.enrolled) as enrolled,
  public.nz(h.exclreason) as exclreason,
  public.nz(h.nmembers) as nmembers_reported,
  -- Surveys table flags
  coalesce(public.nz(h.exclreason), 0) not in (1, 2) as approached,
  coalesce(public.nz(h.enrolled) = 1, false) as is_enrolled,
  coalesce(public.nz(h.enrolled) = 0, false) as is_excluded,
  coalesce(public.nz(h.exclreason) = 3 and coalesce(public.nz(h.totvisit), 0) < 3, false)
    or public.nz(h.enrolled) is null as not_closed_out,
  coalesce(mem.n_recorded, 0) as members_recorded,
  coalesce(mem.n_child_2_10, 0) > 0 as has_child_2_10,
  coalesce(mem.n_any_sample, 0) > 0 as has_samples,
  coalesce(mem.n_bs, 0) as samples_bs,
  coalesce(mem.n_fp, 0) as samples_fp,
  coalesce(public.nz(h.enrolled) = 1
    and coalesce(mem.n_recorded, 0) < coalesce(public.nz(h.nmembers), 0), false) as pending_clinical,
  -- Net indicators
  public.nz(h.havenets) = 1 as has_net,
  public.nz(h.receivenet) = 1 as received_ucc,
  coalesce(public.nz(h.nnets), 0) as nnets,
  coalesce(public.nz(h.manynet), 0) as ucc_nets_received
from public.hh_info h
join public.mrc m on m.mrccode = h.mrccode and m.active
left join lateral (
  select
    count(*) as n_recorded,
    count(*) filter (where vm.age between 2 and 10) as n_child_2_10,
    count(*) filter (where vm.any_sample) as n_any_sample,
    count(*) filter (where vm.sample_bs) as n_bs,
    count(*) filter (where vm.sample_fp) as n_fp
  from (
    select
      public.nz(p.age) as age,
      public.checkbox(p.samples_collected) && array['1', '2', '3', '4'] as any_sample,
      '1' = any (public.checkbox(p.samples_collected)) as sample_bs,
      '2' = any (public.checkbox(p.samples_collected)) as sample_fp
    from public.hh_members p
    where p.parent_uniqueid = h.uniqueid
  ) vm
) mem on true;

create or replace view public.v_net
with (security_invoker = true) as
select
  n.uniqueid,
  n.parent_uniqueid,
  m.mrccode,
  m.short_name as mrc,
  m.district,
  n.startdate,
  public.nz(n.brandnet) as brandnet,
  public.nz(n.obs) = 1 as observed,
  public.nz(n.nethung) = 1 as hanging,
  public.nz(n.uccnet) = 1 as ucc_net,
  public.nz(n.slpnet) = 1 as used_last_night
from public.nets n
join public.mrc m on m.mrccode = n.mrccode and m.active;
