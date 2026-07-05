-- Phase C: productivity-modifier seed tables. Firm-editable (UI-table convention:
-- RLS + authenticated DML + service_role grant + policies). Plus quote/line columns.

create table mcaa_factors (key text primary key, label_ar text not null, minor_pct int not null, avg_pct int not null, severe_pct int not null);
insert into mcaa_factors values
 ('stacking_of_trades','تداخل المهن',10,20,30),('morale','الروح المعنوية',5,15,30),
 ('reassignment','إعادة توزيع العمالة',5,10,15),('crew_size','حجم الطاقم',10,20,30),
 ('concurrent_ops','عمليات متزامنة',5,15,25),('dilution_supervision','تخفيف الإشراف',10,15,25),
 ('learning_curve','منحنى التعلّم',5,15,30),('errors_omissions','أخطاء وسهو',1,3,6),
 ('beneficial_occupancy','إشغال جزئي',15,25,40),('joint_occupancy','إشغال مشترك',5,12,20),
 ('site_access','الوصول للموقع',5,12,30),('logistics','اللوجستيات',10,25,50),
 ('fatigue','الإرهاق',8,10,12),('ripple','التأثير المتسلسل',10,15,20),
 ('overtime','العمل الإضافي',10,15,20),('season_weather','الموسم/الطقس',10,20,30) on conflict do nothing;

create table neca_conditions (key text primary key, label_ar text not null);
insert into neca_conditions (key, label_ar) values
 ('hours_worked','ساعات العمل'),('shift','الوردية'),('job_documents','وثائق العمل'),('working_conditions','ظروف العمل'),
 ('crew_density','كثافة الطاقم'),('working_height','ارتفاع العمل'),('floors','الطوابق'),('building_sqft','مساحة المبنى'),
 ('project_size','حجم المشروع'),('site_size','حجم الموقع'),('safety','السلامة'),('occupancy','الإشغال'),
 ('cleanliness','النظافة'),('repetition','التكرار'),('systems_complexity','تعقيد الأنظمة'),('access','الوصول'),
 ('tools','الأدوات'),('coordination','التنسيق'),('labor_availability','توفّر العمالة'),('info_flow','تدفق المعلومات'),
 ('decision_making','اتخاذ القرار'),('continuity','الاستمرارية'),('change_orders','أوامر التغيير'),
 ('schedule_compression','ضغط الجدول'),('meetings','الاجتماعات'),('material_handling','مناولة المواد'),
 ('storage','التخزين'),('utilities_temp','المرافق المؤقتة'),('inspection_regime','نظام التفتيش'),('weather_exposure','التعرض للطقس')
 on conflict do nothing;   -- exactly 30 rows

create table overtime_pi (hours_per_week int, week_number int, index_value numeric not null, primary key(hours_per_week, week_number));
insert into overtime_pi values (50,1,0.95),(50,10,0.72),(60,1,0.91),(60,10,0.61) on conflict do nothing;

create table height_bands (min_ft int primary key, max_ft int, uplift_pct int not null);
insert into height_bands values (0,10,0),(10,20,25),(20,null,50) on conflict do nothing;

create table floor_bands (min_floors int primary key, max_floors int not null, uplift_pct int not null);
insert into floor_bands values (1,2,0),(3,6,1),(7,10,4),(11,15,8),(16,19,10),(20,30,13) on conflict do nothing;

create table weather_bands (exposure text primary key, uplift_pct int not null);
insert into weather_bands values ('indoor_controlled',0),('outdoor_temperate',25),('outdoor_hot',50) on conflict do nothing;

create table shift_bands (shift_type text primary key, uplift_pct int not null);
insert into shift_bands values ('day',0),('second_night',13),('third',18) on conflict do nothing;

alter table quotes
  add column condition_mode text check (condition_mode in ('mcaa','neca')) default 'mcaa',
  add column condition_input jsonb;
alter table line_items add column line_conditions jsonb;

-- UI-table convention (roadmap §7.3) — INCLUDING the service_role grant (freshly
-- created tables don't inherit the broad grants earlier migrations gave).
do $$
declare t text;
begin
  foreach t in array array['mcaa_factors','neca_conditions','overtime_pi','height_bands','floor_bands','weather_bands','shift_bands'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant select, insert, update, delete on %I to service_role', t);
    execute format($f$create policy %I on %I for select to authenticated using (true)$f$, t||'_sel', t);
    execute format($f$create policy %I on %I for insert to authenticated with check (true)$f$, t||'_ins', t);
    execute format($f$create policy %I on %I for update to authenticated using (true) with check (true)$f$, t||'_upd', t);
    execute format($f$create policy %I on %I for delete to authenticated using (true)$f$, t||'_del', t);
  end loop;
end $$;
