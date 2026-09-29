-- Use the final list of 26 surveillance sites and their target villages
-- (source: "Target area villages - 26 MRCs.xlsx"):
--   * remove MRCs that are not surveillance sites
--   * update names, districts and regions; household target 50 per site
--   * replace the village list with the 86 target villages
--   * drop mrc.short_name and mrc.active; the dashboard now shows mrcname
-- Survey records from other MRCs are kept but never shown (views inner-join mrc).

-- Views depend on the dropped columns; recreated below.
drop view if exists public.v_net;
drop view if exists public.v_household;
drop view if exists public.v_member;

create temporary table final_sites (
  mrccode integer primary key,
  mrcname text not null,
  district text not null,
  regionname text not null,
  target_hh integer
) on commit drop;

insert into final_sites (mrccode, mrcname, district, regionname, target_hh) values
  (12, 'Kyatiri HCIII', 'Masindi', 'Bunyoro', 50),
  (14, 'Diima HCIII', 'Kiryandongo', 'Bunyoro', 50),
  (21, 'Koch Goma HCIV', 'Nwoya', 'Acholi', 50),
  (23, 'Atiak HCIV', 'Amuru', 'Acholi', 50),
  (25, 'Awach HCIV', 'Gulu', 'Acholi', 50),
  (27, 'Lalogi HCIV', 'Omoro', 'Acholi', 50),
  (29, 'Padibe HCIII', 'Lamwo', 'Acholi', 50),
  (31, 'Namokora HCIV', 'Kitgum', 'Acholi', 50),
  (32, 'Kitgum Matidi HCIII', 'Kitgum', 'Acholi', 50),
  (33, 'Patongo HCIII', 'Agago', 'Acholi', 50),
  (36, 'Otwal HCIII', 'Oyam', 'Lango', 50),
  (37, 'Aboke HCIV', 'Kole', 'Lango', 50),
  (38, 'Bala HCIII', 'Kole', 'Lango', 50),
  (40, 'Akokoro HCIII', 'Apac', 'Lango', 50),
  (41, 'Aduku HCIV', 'Kwania', 'Lango', 50),
  (42, 'Apwori HCIII', 'Kwania', 'Lango', 50),
  (43, 'Lokolia HCIV', 'Kaabong', 'Karamoja', 50),
  (47, 'Morungatuny HCIII', 'Amuria', 'Karamoja', 50),
  (56, 'Nawaikoke HCIII', 'Kaliro', 'Busoga', 50),
  (59, 'Budondo HCIV', 'Jinja', 'Busoga', 50),
  (61, 'Buwaiswa HCIV', 'Mayuge', 'Busoga', 50),
  (62, 'Kigandalo HCIV', 'Mayuge', 'Busoga', 50),
  (64, 'Busitema HCIII', 'Busia', 'Bukedi', 50),
  (66, 'Amolatar HCIV', 'Amolatar', 'Lango', 50),
  (69, 'Orum HCIV', 'Otuke', 'Lango', 50),
  (71, 'Nadunget HC III', 'Moroto', 'Karamoja', 50);

-- Fail loudly if a region name doesn't match the region table.
do $$
begin
  if exists (select 1 from final_sites f left join public.region r on r.regionname = f.regionname where r.regioncode is null) then
    raise exception 'final_sites contains a region name that is not in public.region';
  end if;
end $$;

delete from public.village;
delete from public.mrc where mrccode not in (select mrccode from final_sites);

insert into public.mrc (mrccode, mrcname, district, regioncode, target_hh, short_name, active)
select f.mrccode, f.mrcname, f.district, r.regioncode, f.target_hh, f.mrcname, true
from final_sites f
join public.region r on r.regionname = f.regionname
on conflict (mrccode) do update
  set mrcname = excluded.mrcname,
      district = excluded.district,
      regioncode = excluded.regioncode,
      target_hh = excluded.target_hh;

insert into public.village (mrccode, villagecode, villagename) values
  (12, 1, 'KYATIRI CENTRE'),
  (12, 5, 'KYAMBOGO'),
  (12, 6, 'KYABAKAMI'),
  (14, 1, 'PII-AKEYO'),
  (14, 2, 'DIIMA A'),
  (14, 3, 'DIIMA B'),
  (14, 4, 'ALENGO'),
  (21, 1, 'Kal ''B'''),
  (21, 2, 'Kal ''A1'''),
  (21, 3, 'Kal ''A2'''),
  (23, 1, 'Kal East'),
  (25, 1, 'Payuta'),
  (27, 2, 'OPWAC'),
  (29, 1, 'ATWOL A'),
  (29, 2, 'ATWOL B'),
  (29, 3, 'LOTIBOL'),
  (29, 4, 'MISSION'),
  (29, 5, 'ANYIBI'),
  (31, 1, 'MISSION'),
  (31, 2, 'ORYANG CENTRAL'),
  (31, 3, 'PAGER'),
  (31, 4, 'PUNU AKURU'),
  (31, 5, 'TWONU OKON'),
  (32, 1, 'BOBI CENTRAL'),
  (32, 2, 'PAGWA AWERE'),
  (33, 1, 'COUNTY HQTRS'),
  (33, 2, 'OPOROT NORTH'),
  (33, 3, 'BARDEGE'),
  (33, 4, 'OPOROT CENTRAL'),
  (36, 1, 'TE - YAO'),
  (36, 2, 'ALEGE'),
  (36, 3, 'OGUK'),
  (36, 4, 'OTWAL TRADING CENTRE ''A'''),
  (37, 1, 'ARAO'),
  (37, 2, 'ACUNGU LYEC ''A'''),
  (37, 3, 'ATEK'),
  (38, 1, 'TECAMBIA MAIN'),
  (38, 2, 'OLIL'),
  (38, 3, 'OLAI'),
  (40, 1, 'TETUGO'),
  (40, 2, 'KAYEI'),
  (40, 3, 'WANGCENYE'),
  (40, 4, 'AKOKORO T/C'),
  (40, 5, 'ABYEIBUTI'),
  (41, 1, 'Akaidebe'),
  (41, 2, 'Olami ''B'''),
  (41, 3, 'Olami ''A'''),
  (42, 1, 'APWORI'),
  (42, 2, 'OYIKOWANGE'),
  (42, 3, 'WI GWENG A'),
  (42, 4, 'WI GWENG B'),
  (42, 5, 'AYAT'),
  (42, 6, 'OMULE'),
  (43, 1, 'LOKOLIA CENTRE'),
  (43, 2, 'KALODEKE'),
  (43, 3, 'NAPETABUL'),
  (47, 1, 'AKUYA'),
  (47, 2, 'OJINGAI'),
  (47, 3, 'OMUNYIR'),
  (47, 4, 'ATEUSO'),
  (56, 1, 'NAWAIKOKE'),
  (56, 2, 'KAJUBU'),
  (56, 3, 'LUKUMI'),
  (56, 4, 'BUKUNYA'),
  (59, 2, 'NAMIZI CENTRAL'),
  (61, 1, 'BUWAISWA'),
  (61, 2, 'NAMADHI'),
  (61, 3, 'NAKATE'),
  (62, 1, 'KIGANDALO A'),
  (62, 2, 'KIGANDALO B'),
  (62, 3, 'BUGONDO'),
  (64, 1, 'SYANYONJA'),
  (64, 2, 'NAMUKOMBE'),
  (64, 3, 'NAMBEWO'),
  (66, 2, 'AMOLATAR HEADQUARTERS ''B'''),
  (66, 5, 'ORIMAI'),
  (69, 1, 'BARODUGU'),
  (69, 2, 'ADWONG IBUTO'),
  (69, 3, 'ADWIRPIDA'),
  (69, 4, 'TEBOKE'),
  (69, 5, 'AKAIDEBE'),
  (71, 1, 'Nakapelimen Cell'),
  (71, 2, 'Lolain Cell'),
  (71, 3, 'Lokilala'),
  (71, 4, 'Lokorirot Cell'),
  (71, 5, 'Nachuka Cell');

alter table public.mrc drop column short_name;
alter table public.mrc drop column active;
alter table public.mrc alter column district set not null;

-- Access control: names in allowed_users.mrcs match mrcname with or without the
-- facility level, e.g. 'Bala HCIII' or 'Bala'.
create or replace function public.user_mrc_codes()
returns integer[]
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select u.mrcs
    from public.allowed_users u
    where u.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  ),
  tokens as (
    select lower(trim(t)) as tok
    from me, unnest(string_to_array(me.mrcs, ',')) as t
    where trim(t) <> ''
  )
  select coalesce(array_agg(distinct m.mrccode), '{}')
  from public.mrc m
  where exists (
    select 1 from tokens
    where tok = 'all'
       or tok = m.mrccode::text
       or tok = lower(m.mrcname)
       or tok = lower(regexp_replace(m.mrcname, '\s*HC\s*I{1,3}V?$', '', 'i'))
  );
$$;

-- Views (same definitions as before, showing mrcname) ---------------------------

create or replace view public.v_member
with (security_invoker = true) as
select
  p.uniqueid,
  p.parent_uniqueid,
  p.hhid,
  p.linenum,
  m.mrccode,
  m.mrcname as mrc,
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
join public.mrc m on m.mrccode = p.mrccode;

create or replace view public.v_household
with (security_invoker = true) as
select
  h.uniqueid,
  h.hhid,
  m.mrccode,
  m.mrcname as mrc,
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
join public.mrc m on m.mrccode = h.mrccode
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
  m.mrcname as mrc,
  m.district,
  n.startdate,
  public.nz(n.brandnet) as brandnet,
  public.nz(n.obs) = 1 as observed,
  public.nz(n.nethung) = 1 as hanging,
  public.nz(n.uccnet) = 1 as ucc_net,
  public.nz(n.slpnet) = 1 as used_last_night
from public.nets n
join public.mrc m on m.mrccode = n.mrccode;

grant select on public.v_household, public.v_member, public.v_net to authenticated;

-- Dashboard functions that referenced short_name / active ------------------------

create or replace function public.filtered_mrcs(p_mrcs integer[], p_districts text[])
returns setof public.mrc
language sql
stable
as $$
  select * from public.mrc m
  where public.f_match(m.mrccode, m.district, null, p_mrcs, p_districts, null, null)
$$;

create or replace function public.survey_summary(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (
  mrccode integer, mrc text, district text, target_hh integer,
  enumerated bigint, approached bigint, enrolled bigint,
  residents bigint, residents_reported bigint,
  hh_with_child bigint, hh_without_child bigint,
  excluded bigint, excl_1 bigint, excl_2 bigint, excl_3 bigint,
  excl_4 bigint, excl_5 bigint, excl_6 bigint,
  not_closed_out bigint, hh_with_samples bigint, hh_pending_clinical bigint,
  samples_bs bigint, samples_fp bigint
)
language sql
stable
as $$
  select
    m.mrccode, m.mrcname, m.district, m.target_hh,
    count(h.uniqueid),
    count(*) filter (where h.approached),
    count(*) filter (where h.is_enrolled),
    coalesce(sum(h.members_recorded) filter (where h.is_enrolled), 0),
    coalesce(sum(h.nmembers_reported) filter (where h.is_enrolled), 0),
    count(*) filter (where h.is_enrolled and h.has_child_2_10),
    count(*) filter (where h.is_enrolled and not h.has_child_2_10),
    count(*) filter (where h.is_excluded),
    count(*) filter (where h.is_excluded and h.exclreason = 1),
    count(*) filter (where h.is_excluded and h.exclreason = 2),
    count(*) filter (where h.is_excluded and h.exclreason = 3),
    count(*) filter (where h.is_excluded and h.exclreason = 4),
    count(*) filter (where h.is_excluded and h.exclreason = 5),
    count(*) filter (where h.is_excluded and h.exclreason = 6),
    count(*) filter (where h.not_closed_out),
    count(*) filter (where h.is_enrolled and h.has_samples),
    count(*) filter (where h.pending_clinical),
    coalesce(sum(h.samples_bs), 0),
    coalesce(sum(h.samples_fp), 0)
  from public.filtered_mrcs(p_mrcs, p_districts) m
  left join public.v_household h
    on h.mrccode = m.mrccode
   and (p_from is null or h.startdate >= p_from)
   and (p_to is null or h.startdate <= p_to)
  group by m.mrccode, m.mrcname, m.district, m.target_hh
  order by m.district, m.mrcname
$$;

create or replace function public.malaria_summary(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (
  mrccode integer, mrc text, district text,
  members bigint, febrile bigint, rdt_done bigint, rdt_pos bigint,
  rdt_pf bigint, rdt_pan bigint, rdt_mixed bigint,
  febrile_al bigint, rdt_pos_al bigint,
  u5_hb_tested bigint, u5_hb_mean numeric, u5_anaemic bigint,
  treated_6m bigint, treated_at_mrc bigint
)
language sql
stable
as $$
  select
    m.mrccode, m.mrcname, m.district,
    count(p.uniqueid),
    count(*) filter (where p.febrile),
    count(*) filter (where p.rdt_done),
    count(*) filter (where p.rdt_done and p.rdt_pos),
    count(*) filter (where p.rdt_done and p.rdt_pf),
    count(*) filter (where p.rdt_done and p.rdt_pan),
    count(*) filter (where p.rdt_done and p.rdt_mixed),
    count(*) filter (where p.febrile and p.al_prescribed),
    count(*) filter (where p.rdt_pos and p.al_prescribed),
    count(p.hemoglobin) filter (where p.age < 5),
    round(avg(p.hemoglobin) filter (where p.age < 5), 1),
    count(*) filter (where p.age < 5 and p.hemoglobin < 11),
    count(*) filter (where p.treated_malaria_6m),
    count(*) filter (where p.treated_malaria_6m and p.treated_at_mrc)
  from public.filtered_mrcs(p_mrcs, p_districts) m
  left join public.v_member p
    on p.mrccode = m.mrccode
   and (p_from is null or p.startdate >= p_from)
   and (p_to is null or p.startdate <= p_to)
  group by m.mrccode, m.mrcname, m.district
  order by m.district, m.mrcname
$$;

create or replace function public.net_summary(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (
  mrccode integer, mrc text, district text,
  hh_enrolled bigint, hh_with_net bigint, hh_received_ucc bigint,
  hh_universal_coverage bigint, nets_reported bigint,
  residents bigint, slept_under_net bigint,
  nets_recorded bigint, nets_observed bigint, nets_hanging bigint,
  nets_ucc bigint, nets_used bigint
)
language sql
stable
as $$
  with hh as (
    select h.mrccode,
      count(*) filter (where h.is_enrolled) as hh_enrolled,
      count(*) filter (where h.is_enrolled and h.has_net) as hh_with_net,
      count(*) filter (where h.is_enrolled and h.received_ucc) as hh_received_ucc,
      -- Universal coverage: at least 1 net per 2 residents
      count(*) filter (where h.is_enrolled and h.nnets > 0
                         and h.nnets * 2 >= coalesce(h.nmembers_reported, h.members_recorded)) as hh_uc,
      coalesce(sum(h.nnets) filter (where h.is_enrolled), 0) as nets_reported
    from public.v_household h
    where public.f_match(h.mrccode, h.district, h.startdate, p_mrcs, p_districts, p_from, p_to)
    group by h.mrccode
  ),
  mem as (
    select p.mrccode,
      count(*) as residents,
      count(*) filter (where p.slept_under_net) as slept_under_net
    from public.v_member p
    where public.f_match(p.mrccode, p.district, p.startdate, p_mrcs, p_districts, p_from, p_to)
    group by p.mrccode
  ),
  nt as (
    select n.mrccode,
      count(*) as nets_recorded,
      count(*) filter (where n.observed) as nets_observed,
      count(*) filter (where n.observed and n.hanging) as nets_hanging,
      count(*) filter (where n.ucc_net) as nets_ucc,
      count(*) filter (where n.used_last_night) as nets_used
    from public.v_net n
    where public.f_match(n.mrccode, n.district, n.startdate, p_mrcs, p_districts, p_from, p_to)
    group by n.mrccode
  )
  select
    m.mrccode, m.mrcname, m.district,
    coalesce(hh.hh_enrolled, 0), coalesce(hh.hh_with_net, 0), coalesce(hh.hh_received_ucc, 0),
    coalesce(hh.hh_uc, 0), coalesce(hh.nets_reported, 0),
    coalesce(mem.residents, 0), coalesce(mem.slept_under_net, 0),
    coalesce(nt.nets_recorded, 0), coalesce(nt.nets_observed, 0), coalesce(nt.nets_hanging, 0),
    coalesce(nt.nets_ucc, 0), coalesce(nt.nets_used, 0)
  from public.filtered_mrcs(p_mrcs, p_districts) m
  left join hh on hh.mrccode = m.mrccode
  left join mem on mem.mrccode = m.mrccode
  left join nt on nt.mrccode = m.mrccode
  order by m.district, m.mrcname
$$;

create or replace function public.vaccine_summary(
  p_mrcs integer[] default null, p_districts text[] default null,
  p_from date default null, p_to date default null
)
returns table (
  mrccode integer, mrc text, district text,
  children_u3 bigint, with_card bigint, r21_any bigint,
  r21_1 bigint, r21_2 bigint, r21_3 bigint, r21_4 bigint,
  r21_card_verified bigint, hib_any bigint, hib_3 bigint
)
language sql
stable
as $$
  select
    m.mrccode, m.mrcname, m.district,
    count(p.uniqueid),
    count(*) filter (where p.vx_card),
    count(*) filter (where p.r21_any),
    count(*) filter (where p.r21_doses >= 1),
    count(*) filter (where p.r21_doses >= 2),
    count(*) filter (where p.r21_doses >= 3),
    count(*) filter (where p.r21_doses >= 4),
    count(*) filter (where p.r21_any and p.r21_card_verified),
    count(*) filter (where p.hib_any),
    count(*) filter (where p.hib_doses >= 3)
  from public.filtered_mrcs(p_mrcs, p_districts) m
  left join public.v_member p
    on p.mrccode = m.mrccode
   and p.age between 0 and 2
   and (p_from is null or p.startdate >= p_from)
   and (p_to is null or p.startdate <= p_to)
  group by m.mrccode, m.mrcname, m.district
  order by m.district, m.mrcname
$$;
