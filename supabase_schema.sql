-- =====================================================================================
-- HỆ THỐNG QUẢN LÝ ĐIỂM VÀ HỒ SƠ QUÂN NHÂN ĐẠI ĐỘI 460 - TIỂU ĐOÀN 4
-- SUPABASE SQL SCHEMA & MIGRATION (BỔ SUNG CỘT, KHÓA UPSERT VÀ REALTIME)
-- Project Reference : wxiimjbseovuxmvolswh
-- Supabase URL      : https://wxiimjbseovuxmvolswh.supabase.co
-- =====================================================================================

-- Chạy toàn bộ script trong Supabase SQL Editor.
-- Bổ sung schema/khóa nếu thiếu; không xóa hàng, không đổi kiểu cột,
-- không thay GRANT, policy hoặc cấu hình RLS hiện tại.
-- Nếu dữ liệu trùng khóa, transaction dừng để bạn kiểm tra, không tự xóa dữ liệu.
BEGIN;

-- 1. BẢNG HỌC VIÊN / HỒ SƠ QUÂN NHÂN (students)
CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  rank TEXT DEFAULT 'Hạ sĩ',
  class TEXT NOT NULL DEFAULT 'OTQS1',
  position TEXT DEFAULT 'Học viên',
  role TEXT DEFAULT 'Học viên',
  dob TEXT DEFAULT '',
  enlistment_date TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  hometown TEXT DEFAULT '',
  permanent_address TEXT DEFAULT '',
  current_address TEXT DEFAULT '',
  political_status TEXT DEFAULT 'DOAN_VIEN',
  party_joined_date TEXT,
  official_party_date TEXT,
  father_name TEXT DEFAULT '',
  father_birth_date TEXT DEFAULT '',
  father_hometown TEXT DEFAULT '',
  father_job TEXT DEFAULT '',
  mother_name TEXT DEFAULT '',
  mother_birth_date TEXT DEFAULT '',
  mother_hometown TEXT DEFAULT '',
  mother_job TEXT DEFAULT '',
  achievements JSONB DEFAULT '[]'::jsonb,
  current_lang_level TEXT DEFAULT 'A2',
  it_standard TEXT DEFAULT 'Đạt chuẩn CNTT cơ bản',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Đảm bảo tự động bổ sung đầy đủ các cột nếu bảng students đã được tạo từ trước
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS rank TEXT DEFAULT 'Hạ sĩ';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class TEXT DEFAULT 'OTQS1';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS position TEXT DEFAULT 'Học viên';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Học viên';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS dob TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS enlistment_date TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS hometown TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS permanent_address TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS current_address TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS political_status TEXT DEFAULT 'DOAN_VIEN';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS party_joined_date TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS official_party_date TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_name TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_birth_date TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_hometown TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_job TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mother_name TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mother_birth_date TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mother_hometown TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mother_job TEXT DEFAULT '';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS achievements JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS current_lang_level TEXT DEFAULT 'A2';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS it_standard TEXT DEFAULT 'Đạt chuẩn CNTT cơ bản';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_students_code ON public.students (UPPER(code));
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students (class);

-- 2. BẢNG DANH MỤC MÔN HỌC (subjects)
CREATE TABLE IF NOT EXISTS public.subjects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  semester INTEGER NOT NULL DEFAULT 1,
  credits INTEGER NOT NULL DEFAULT 3,
  category TEXT NOT NULL DEFAULT 'common',
  target_classes JSONB DEFAULT '[]'::jsonb,
  target_class TEXT DEFAULT 'all',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS code TEXT DEFAULT '';
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS semester INTEGER DEFAULT 1;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 3;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'common';
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS target_classes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS target_class TEXT DEFAULT 'all';
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_subjects_semester ON public.subjects (semester);
CREATE INDEX IF NOT EXISTS idx_subjects_category ON public.subjects (category);

-- 3. BẢNG ĐIỂM SỐ HỌC VIÊN (grades)
CREATE TABLE IF NOT EXISTS public.grades (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  score NUMERIC(4,2) NOT NULL CHECK (score >= 0.0 AND score <= 10.0),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, subject_id)
);

-- CREATE TABLE IF NOT EXISTS không sửa các bảng đã tồn tại.
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS subject_id TEXT;
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS score NUMERIC(4,2);
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades (student_id);
CREATE INDEX IF NOT EXISTS idx_grades_subject_id ON public.grades (subject_id);

-- 4. BẢNG CHỨNG CHỈ NGOẠI NGỮ & CHUẨN CNTT (languages)
CREATE TABLE IF NOT EXISTS public.languages (
  student_id TEXT PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  lang TEXT DEFAULT 'Tiếng Nga',
  current_level TEXT DEFAULT 'A2',
  it_standard TEXT DEFAULT 'Đạt chuẩn CNTT cơ bản',
  a1 TEXT DEFAULT 'Đ',
  a21 TEXT DEFAULT 'Đ',
  a22 TEXT DEFAULT 'Đ',
  b11 TEXT DEFAULT 'CT',
  b12 TEXT DEFAULT 'CT',
  extra_cert TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'Tiếng Nga';
ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS current_level TEXT DEFAULT 'A2';
ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS it_standard TEXT DEFAULT 'Đạt chuẩn CNTT cơ bản';
ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS a1 TEXT DEFAULT 'Đ';
ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS a21 TEXT DEFAULT 'Đ';
ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS a22 TEXT DEFAULT 'Đ';
ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS b11 TEXT DEFAULT 'CT';
ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS b12 TEXT DEFAULT 'CT';
ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS extra_cert TEXT DEFAULT '';
ALTER TABLE public.languages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 5. BẢNG CẤU HÌNH ĐƠN VỊ, KHÓA SỔ ĐIỂM & NHẬT KÝ HỆ THỐNG (unit_settings)
CREATE TABLE IF NOT EXISTS public.unit_settings (
  unit_id TEXT PRIMARY KEY DEFAULT 'daidoi460',
  required_lang_standard TEXT DEFAULT 'A2',
  locks JSONB DEFAULT '{}'::jsonb,
  audit_logs JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.unit_settings ADD COLUMN IF NOT EXISTS required_lang_standard TEXT DEFAULT 'A2';
ALTER TABLE public.unit_settings ADD COLUMN IF NOT EXISTS locks JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.unit_settings ADD COLUMN IF NOT EXISTS audit_logs JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.unit_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- PostgREST on_conflict cần UNIQUE/PRIMARY KEY đúng các cột bên dưới.
-- Tái sử dụng khóa có sẵn, không tạo chỉ mục UNIQUE trùng chức năng.
DO $migration$
DECLARE
  requirement RECORD;
  required_keys SMALLINT[];
  quoted_columns TEXT;
BEGIN
  FOR requirement IN
    SELECT * FROM (VALUES
      ('students', 'uq_students_code_import', ARRAY['code']),
      ('grades', 'uq_grades_student_subject_import', ARRAY['student_id', 'subject_id']),
      ('languages', 'uq_languages_student_import', ARRAY['student_id']),
      ('unit_settings', 'uq_unit_settings_unit_import', ARRAY['unit_id'])
    ) AS requirements(table_name, index_name, column_names)
  LOOP
    SELECT array_agg(a.attnum ORDER BY a.attnum)
      INTO required_keys
      FROM pg_attribute AS a
      WHERE a.attrelid = format('public.%I', requirement.table_name)::regclass
        AND a.attname = ANY(requirement.column_names) AND NOT a.attisdropped;

    IF cardinality(required_keys) IS DISTINCT FROM cardinality(requirement.column_names) THEN
      RAISE EXCEPTION 'Bảng % thiếu cột khóa bắt buộc; kiểm tra schema trước khi tiếp tục.', requirement.table_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_index AS i
      WHERE i.indrelid = format('public.%I', requirement.table_name)::regclass
        AND i.indisunique AND i.indisvalid AND i.indimmediate
        AND i.indpred IS NULL AND i.indexprs IS NULL
        AND ARRAY(
          SELECT k.attnum FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, position)
          WHERE k.position <= i.indnkeyatts ORDER BY k.attnum
        ) = required_keys
    ) THEN
      SELECT string_agg(quote_ident(c), ', ') INTO quoted_columns
        FROM unnest(requirement.column_names) AS columns(c);
      EXECUTE format('CREATE UNIQUE INDEX %I ON public.%I (%s)',
        requirement.index_name, requirement.table_name, quoted_columns);
    END IF;
  END LOOP;
END
$migration$;

INSERT INTO public.unit_settings (unit_id, required_lang_standard, locks, audit_logs)
VALUES ('daidoi460', 'A2', '{}'::jsonb, '[]'::jsonb)
ON CONFLICT (unit_id) DO NOTHING;

-- Thêm bảng vào publication sẵn có để các phiên khác nhận được cập nhật.
-- Không tự tạo publication nếu môi trường không có Supabase Realtime.
DO $realtime$
DECLARE
  target_table TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND NOT puballtables) THEN
    FOREACH target_table IN ARRAY ARRAY['students', 'subjects', 'grades', 'languages', 'unit_settings']
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = target_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
      END IF;
    END LOOP;
  END IF;
END
$realtime$;

NOTIFY pgrst, 'reload schema';
COMMIT;
