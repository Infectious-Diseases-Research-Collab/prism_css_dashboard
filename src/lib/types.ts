export type Mrc = { mrccode: number; mrcname: string; district: string; target_hh: number | null };

type Site = { mrccode: number; mrc: string; district: string };

export type SurveyRow = Site & {
  target_hh: number | null;
  enumerated: number; approached: number; enrolled: number;
  residents: number; residents_reported: number;
  hh_with_child: number; hh_without_child: number;
  excluded: number; excl_1: number; excl_2: number; excl_3: number;
  excl_4: number; excl_5: number; excl_6: number;
  not_closed_out: number; hh_with_samples: number; hh_pending_clinical: number;
  samples_bs: number; samples_fp: number;
};
export type SurveyPoint = {
  period: string; enumerated: number; enrolled: number; hh_with_child: number; excluded: number; not_closed_out: number;
  residents: number; hh_with_samples: number; samples_bs: number; samples_fp: number;
};

export type MalariaRow = Site & {
  members: number; febrile: number; rdt_done: number; rdt_pos: number;
  rdt_pf: number; rdt_pan: number; rdt_mixed: number; febrile_al: number; rdt_pos_al: number;
  u5_hb_tested: number; u5_hb_mean: number | null; u5_anaemic: number;
  treated_6m: number; treated_at_mrc: number;
};
export type MalariaPoint = { period: string; members: number; febrile: number; rdt_done: number; rdt_pos: number };

export type NetRow = Site & {
  hh_enrolled: number; hh_with_net: number; hh_received_ucc: number; hh_universal_coverage: number;
  nets_reported: number; residents: number; slept_under_net: number;
  nets_recorded: number; nets_observed: number; nets_hanging: number; nets_ucc: number; nets_used: number;
};
export type NetPoint = { period: string; hh_enrolled: number; hh_with_net: number; residents: number; slept_under_net: number };
export type NetBrand = { brandnet: number | null; nets: number };

export type VaccineRow = Site & {
  children_u3: number; with_card: number; r21_any: number;
  r21_1: number; r21_2: number; r21_3: number; r21_4: number;
  r21_card_verified: number; hib_any: number; hib_3: number;
};
export type VaccinePoint = { period: string; children_u3: number; r21_any: number; hib_any: number };

// Daily tracker: interviewers' own daily counts (daily_tracker table).
export type TrackerRow = Site & {
  days_reported: number; reports: number; approached: number; enrolled: number; last_report: string | null;
};
export type TrackerDay = Site & { report_date: string; reports: number; approached: number; enrolled: number };
export type TrackerPoint = { period: string; approached: number; enrolled: number };
