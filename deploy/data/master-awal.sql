-- Data master awal produksi: perusahaan asuransi (kantor pusat), paket "Comprehensive", bengkel rekanan Bandung.
-- Sumber (dikumpulkan 11 Okt 2026): situs resmi masing-masing asuransi; daftar bengkel rekanan
-- Chubb General Insurance (Apr 2026) dan Tokio Marine (via cermati.com).
-- Aman diulang: baris yang sudah ada (kode asuransi / nama paket / nama bengkel) dilewati.
-- Jalankan: sudo -u postgres psql -d insurance_prod -v ON_ERROR_STOP=1 -f master-awal.sql

begin;

create temporary table _asuransi (kode text, nama text, alamat text) on commit drop;
insert into _asuransi values
  ('SINARMAS',    'PT Asuransi Sinar Mas',                  'Plaza Simas, Jl. KH Fachrudin No. 18, Tanah Abang, Jakarta 10250'),
  ('ASTRA',       'PT Asuransi Astra Buana (Garda Oto)',    'Arumaya Financial Center Lt. 22-27, Jl. R.A. Kartini Kav. 15, Lebak Bulus, Jakarta Selatan 12440'),
  ('ACA',         'PT Asuransi Central Asia (ACA)',         'Wisma Asia Lt. 10, 12-15, Jl. Letjen S. Parman Kav. 79, Jakarta 11420'),
  ('ZURICH',      'PT Zurich Asuransi Indonesia Tbk',       'Graha Zurich, Jl. MT Haryono Kav. 42, Jakarta Selatan 12780'),
  ('MNC',         'PT MNC Asuransi Indonesia',              'MNC Bank Tower Lt. 11, Jl. Kebon Sirih No. 21-27, Jakarta Pusat 10340'),
  ('TOKIOMARINE', 'PT Asuransi Tokio Marine Indonesia',     'Sentral Senayan I Lt. 3, Jl. Asia Afrika No. 8, Jakarta 10270'),
  ('ALLIANZ',     'PT Asuransi Allianz Utama Indonesia',    'World Trade Centre 3 & 6, Jl. Jend. Sudirman Kav. 29-31, Jakarta Selatan 12920'),
  ('BCAINS',      'PT Asuransi Umum BCA (BCA Insurance)',   'Sahid Sudirman Center Lt. 10 Unit F, Jl. Jend. Sudirman No. 86, Jakarta 10220'),
  ('MSIG',        'PT Asuransi MSIG Indonesia',             'Summitmas II Lt. 15, Jl. Jend. Sudirman Kav. 61-62, Jakarta 12190'),
  ('RAKSA',       'PT Asuransi Raksa Pratikara',            'Wisma BSG Lt. 3, Jl. Abdul Muis No. 40, Petojo Selatan, Jakarta Pusat'),
  ('JASINDO',     'PT Asuransi Jasa Indonesia (Jasindo)',   'Graha Jasindo, Jl. Menteng Raya No. 21, Jakarta Pusat 10340'),
  ('TUGU',        'PT Asuransi Tugu Pratama Indonesia Tbk', 'Wisma Tugu I, Jl. H.R. Rasuna Said Kav. C8-9, Jakarta 12920'),
  ('CHUBB',       'PT Chubb General Insurance Indonesia',   'Chubb Square Lt. 6, Jl. M.H. Thamrin No. 10, Jakarta 10230'),
  ('WAHANATATA',  'PT Asuransi Wahana Tata (Aswata)',       'Gedung Asuransi Wahana Tata, Jl. H.R. Rasuna Said Kav. C-4, Jakarta 12920');

insert into perusahaan_asuransi (id, kode, nama, alamat)
select substr(md5(random()::text || clock_timestamp()::text || a.kode), 1, 20), a.kode, a.nama, a.alamat
from _asuransi a
where not exists (select 1 from perusahaan_asuransi p where p.kode = a.kode);

-- Paket "Comprehensive" (all risk) untuk setiap asuransi yang belum punya paket itu
insert into kategori_polis (id, perusahaan_id, nama, cakupan, urutan)
select substr(md5(random()::text || clock_timestamp()::text || p.id), 1, 20), p.id, 'Comprehensive',
  array[
    'Kerugian sebagian akibat tabrakan, benturan, terbalik, tergelincir, atau terperosok',
    'Kerugian total (kerusakan ≥ 75% harga kendaraan)',
    'Pencurian kendaraan',
    'Kebakaran, termasuk akibat petir dan ledakan',
    'Perbuatan jahat orang lain'
  ]::text[], 1
from perusahaan_asuransi p
where p.kode in (select kode from _asuransi)
  and not exists (select 1 from kategori_polis k where k.perusahaan_id = p.id and lower(k.nama) = 'comprehensive');

create temporary table _bengkel (nama text, no_telp text) on commit drop;
insert into _bengkel values
  -- Daftar bengkel rekanan Chubb General Insurance Indonesia, April 2026
  ('PT Harta Adhi Pratama (New Emerald) — Jl. Soekarno-Hatta No. 535', '022-7812309'),
  ('PT Halim Oto Mandiri — Jl. Terusan Pasir Koja No. 240',            '022-6047215'),
  ('LCC Motor (CV Lestari Cahaya Cemerlang) — Jl. Jend. Ahmad Yani No. 889', '022-7206400'),
  ('Sapphire Body & Paint — Jl. Moh. Toha No. 341B',                   '022-5205605'),
  ('Auto Cemerlang — Jl. Soekarno Hatta No. 390',                      '022-5221918'),
  -- Daftar bengkel rekanan Tokio Marine (cermati.com)
  ('Megah Jaya — Jl. BKR No. 28',                                      '022-7312766'),
  ('Neo Megah Jaya — Jl. Laswi No. 59',                                '022-7331011'),
  ('Nusantara Jaya Sentosa — Jl. Soekarno Hatta No. 289',              '022-5204645'),
  ('Auto Color — Jl. PETA No. 115',                                    '022-61088868'),
  ('Otto Cemerlang — Jl. Supadio No. 30, Jatayu',                      '022-6075838'),
  ('Pitstop — Jl. Holis No. 246-248',                                  '022-6021621'),
  ('Srikandi Diamond Motor — Jl. Soekarno Hatta No. 342',              '022-5403000'),
  ('Virtue Autocare — Jl. Wastu Kencana No. 39-41',                    '022-4234524');

insert into bengkel (id, nama, kota, no_telp)
select substr(md5(random()::text || clock_timestamp()::text || b.nama), 1, 20), b.nama, 'Bandung', b.no_telp
from _bengkel b
where not exists (select 1 from bengkel x where split_part(x.nama, ' — ', 1) = split_part(b.nama, ' — ', 1));

select 'asuransi' as data, count(*) from perusahaan_asuransi
union all select 'paket comprehensive', count(*) from kategori_polis where nama = 'Comprehensive'
union all select 'bengkel', count(*) from bengkel;

commit;
