-- Run supabase_schema.sql first. Review docs/security-rollout.md before running this migration.
-- Replaces legacy permissive policies; never deletes application records during migration.
BEGIN;
CREATE SEQUENCE IF NOT EXISTS public.dd460_revision_seq;
CREATE TABLE IF NOT EXISTS public.account_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  role text NOT NULL CHECK(role IN ('admin','company_officer','class_account','student')),
  class_code text CHECK(class_code IN ('OTQS1','OTQS2','TTG1','TTG2','XMCB')),
  student_id text,
  display_name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  CHECK(role <> 'class_account' OR class_code IS NOT NULL),
  CHECK(role <> 'student' OR student_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid, actor_name text NOT NULL, event_time timestamptz NOT NULL DEFAULT now(),
  table_name text NOT NULL, operation text NOT NULL, record_id text, class_code text,
  student_id text, subject_id text, before_data jsonb, after_data jsonb
);
CREATE INDEX IF NOT EXISTS audit_events_time_idx ON public.audit_events(event_time DESC,id DESC);
CREATE INDEX IF NOT EXISTS audit_events_class_idx ON public.audit_events(class_code,event_time DESC);
CREATE TABLE IF NOT EXISTS public.write_receipts (
  actor_id uuid NOT NULL, operation_id uuid NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,operation_id)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['students','subjects','grades','languages','unit_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT nextval(''public.dd460_revision_seq'')',t);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.dd460_actor() RETURNS public.account_profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT p FROM public.account_profiles p WHERE p.id=auth.uid() AND p.active;
$$;
CREATE OR REPLACE FUNCTION public.dd460_can_read_student(sid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.students s, public.dd460_actor() a
  WHERE s.id=sid AND (a.role IN ('admin','company_officer') OR a.role='class_account' AND s.class=a.class_code OR a.role='student' AND s.id=a.student_id));
$$;
CREATE OR REPLACE FUNCTION public.dd460_subject_for_class(sub public.subjects, cls text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT sub.category='common' OR sub.target_class IN ('all',cls) OR coalesce(sub.target_classes,'[]'::jsonb) ? cls;
$$;
CREATE OR REPLACE FUNCTION public.dd460_can_write_student(sid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.students s, public.dd460_actor() a WHERE s.id=sid
 AND (a.role='admin' OR a.role='class_account' AND s.class=a.class_code));
$$;
CREATE OR REPLACE FUNCTION public.dd460_bump_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 NEW.revision:=nextval('public.dd460_revision_seq'); NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.dd460_audit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE oldrow jsonb; newrow jsonb; rowdata jsonb; a public.account_profiles; cls text; sid text;
BEGIN
 IF TG_OP<>'INSERT' THEN oldrow:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN newrow:=to_jsonb(NEW); END IF;
 rowdata:=coalesce(newrow,oldrow); a:=public.dd460_actor();
 sid:=CASE WHEN TG_TABLE_NAME='students' THEN rowdata->>'id' ELSE rowdata->>'student_id' END;
 IF TG_TABLE_NAME='students' THEN cls:=rowdata->>'class';
 ELSIF sid IS NOT NULL THEN SELECT class INTO cls FROM public.students WHERE id=sid; END IF;
 INSERT INTO public.audit_events(actor_id,actor_name,table_name,operation,record_id,class_code,student_id,subject_id,before_data,after_data)
 VALUES(auth.uid(),coalesce(nullif(a.display_name,''),a.username,'Quản trị database'),TG_TABLE_NAME,TG_OP,coalesce(rowdata->>'id',sid,rowdata->>'unit_id'),cls,sid,rowdata->>'subject_id',oldrow,newrow);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['students','subjects','grades','languages','unit_settings','account_profiles','audit_events','write_receipts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['students','subjects','grades','languages','unit_settings'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS dd460_revision ON public.%I',t);
  EXECUTE format('CREATE TRIGGER dd460_revision BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.dd460_bump_revision()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS dd460_audit ON public.%I',t);
  EXECUTE format('CREATE TRIGGER dd460_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.dd460_audit_change()',t);
 END LOOP;
END $$;
GRANT SELECT ON public.account_profiles,public.students,public.subjects,public.grades,public.languages,public.audit_events TO authenticated;
CREATE POLICY profile_self ON public.account_profiles FOR SELECT TO authenticated USING(id=auth.uid());
CREATE POLICY student_scope ON public.students FOR SELECT TO authenticated USING(public.dd460_can_read_student(id));
CREATE POLICY grade_scope ON public.grades FOR SELECT TO authenticated USING(public.dd460_can_read_student(student_id));
CREATE POLICY language_scope ON public.languages FOR SELECT TO authenticated USING(public.dd460_can_read_student(student_id));
CREATE POLICY subject_scope ON public.subjects FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.dd460_actor() a
 WHERE a.role IN ('admin','company_officer') OR a.role='class_account' AND public.dd460_subject_for_class(subjects,a.class_code)
 OR a.role='student' AND EXISTS(SELECT 1 FROM public.students s WHERE s.id=a.student_id AND public.dd460_subject_for_class(subjects,s.class))));
CREATE POLICY audit_scope ON public.audit_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.dd460_actor() a
 WHERE a.role IN ('admin','company_officer') OR a.role='class_account' AND audit_events.class_code=a.class_code));

-- All writes go through checked RPCs; direct authenticated INSERT/UPDATE/DELETE is revoked.
CREATE OR REPLACE FUNCTION public.dd460_save_record(t text, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.account_profiles; pk text; rid text; oldrow jsonb; result jsonb; col text;
 cols text:=''; vals text:=''; changes text:=''; clean jsonb; expected bigint; allowed boolean;
BEGIN
 a:=public.dd460_actor();
 IF a.id IS NULL OR a.role='company_officer' THEN RAISE EXCEPTION 'Không có quyền chỉnh sửa' USING ERRCODE='42501'; END IF;
 IF t NOT IN ('students','subjects','languages') THEN RAISE EXCEPTION 'Bảng không hợp lệ'; END IF;
 pk:=CASE WHEN t='languages' THEN 'student_id' ELSE 'id' END; rid:=payload->>pk;
 IF rid IS NULL OR rid='' OR NOT payload ? '_expected_revision' THEN RAISE EXCEPTION 'Thiếu mã hoặc phiên bản dữ liệu'; END IF;
 expected:=(payload->>'_expected_revision')::bigint;
 PERFORM pg_advisory_xact_lock(hashtextextended(t||':'||rid,0));
 EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE %I=$1 FOR UPDATE',t,pk) INTO oldrow USING rid;
 IF coalesce((oldrow->>'revision')::bigint,0)<>expected THEN RAISE EXCEPTION 'Dữ liệu đã được người khác cập nhật. Hãy tải lại trước khi lưu.' USING ERRCODE='40001'; END IF;
 clean:=payload-'_expected_revision'-'revision'-'updated_at';
 IF t='students' THEN
  allowed:=a.role='admin' OR a.role='class_account' AND clean->>'class'=a.class_code AND (oldrow IS NULL OR oldrow->>'class'=a.class_code)
    OR a.role='student' AND rid=a.student_id AND oldrow IS NOT NULL;
  IF a.role='student' AND (clean->>'id' IS DISTINCT FROM oldrow->>'id' OR clean->>'code' IS DISTINCT FROM oldrow->>'code' OR clean->>'class' IS DISTINCT FROM oldrow->>'class'
   OR clean->>'rank' IS DISTINCT FROM oldrow->>'rank' OR clean->>'position' IS DISTINCT FROM oldrow->>'position' OR clean->>'role' IS DISTINCT FROM oldrow->>'role') THEN
   RAISE EXCEPTION 'Học viên không được sửa thông tin biên chế' USING ERRCODE='42501'; END IF;
 ELSIF t='languages' THEN
  allowed:=public.dd460_can_write_student(rid) OR a.role='student' AND rid=a.student_id;
 ELSE allowed:=a.role='admin'; END IF;
 IF NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'Ngoài phạm vi được chỉnh sửa' USING ERRCODE='42501'; END IF;
 IF clean ? 'current_lang_level' AND clean->>'current_lang_level' NOT IN ('Chưa đạt','A1','A21','A2','B11','B1') THEN RAISE EXCEPTION 'Trình độ Tiếng Nga không hợp lệ'; END IF;
 IF clean ? 'current_level' AND clean->>'current_level' NOT IN ('Chưa đạt','A1','A21','A2','B11','B1') THEN RAISE EXCEPTION 'Trình độ Tiếng Nga không hợp lệ'; END IF;
 FOR col IN SELECT jsonb_object_keys(clean) LOOP
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name=col) THEN RAISE EXCEPTION 'Cột không hợp lệ: %',col; END IF;
  cols:=cols||CASE WHEN cols='' THEN '' ELSE ',' END||quote_ident(col);
  vals:=vals||CASE WHEN vals='' THEN '' ELSE ',' END||format('(jsonb_populate_record(null::public.%I,$1)).%I',t,col);
  IF col<>pk THEN changes:=changes||CASE WHEN changes='' THEN '' ELSE ',' END||format('%I=excluded.%I',col,col); END IF;
 END LOOP;
 EXECUTE format('INSERT INTO public.%I(%s) SELECT %s ON CONFLICT(%I) DO UPDATE SET %s RETURNING to_jsonb(%I.*)',t,cols,vals,pk,changes,t) INTO result USING clean;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.dd460_write_grade(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE sid text:=payload->>'student_id'; subid text:=payload->>'subject_id'; currentrow public.grades;
 a public.account_profiles; cls text; sub public.subjects; locked boolean; result jsonb; score_value numeric;
BEGIN
 a:=public.dd460_actor();
 IF NOT public.dd460_can_write_student(sid) OR NOT payload ? '_expected_revision' THEN RAISE EXCEPTION 'Không có quyền sửa điểm' USING ERRCODE='42501'; END IF;
 SELECT class INTO cls FROM public.students WHERE id=sid;
 SELECT * INTO sub FROM public.subjects WHERE id=subid;
 IF sub.id IS NULL OR NOT public.dd460_subject_for_class(sub,cls) THEN RAISE EXCEPTION 'Môn học không thuộc lớp này'; END IF;
 SELECT coalesce((locks->>(cls||'_year_'||ceil(sub.semester/2.0)::int))::boolean,false) INTO locked FROM public.unit_settings WHERE unit_id='daidoi460' FOR SHARE;
 IF coalesce(locked,false) AND a.role<>'admin' THEN RAISE EXCEPTION 'Sổ điểm đã khóa' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('grades:'||sid||':'||subid,0));
 SELECT * INTO currentrow FROM public.grades WHERE student_id=sid AND subject_id=subid FOR UPDATE;
 IF coalesce(currentrow.revision,0)<>(payload->>'_expected_revision')::bigint THEN RAISE EXCEPTION 'Điểm đã được người khác cập nhật. Hãy tải lại trước khi lưu.' USING ERRCODE='40001'; END IF;
 IF payload->'score'='null'::jsonb THEN
  DELETE FROM public.grades WHERE student_id=sid AND subject_id=subid;
  RETURN jsonb_build_object('student_id',sid,'subject_id',subid,'score',null,'revision',0);
 END IF;
 score_value:=(payload->>'score')::numeric;
 IF score_value IS NULL OR score_value<0 OR score_value>10 OR score_value::text='NaN' THEN RAISE EXCEPTION 'Điểm phải từ 0 đến 10'; END IF;
 INSERT INTO public.grades(id,student_id,subject_id,score) VALUES(sid||'__'||subid,sid,subid,score_value)
 ON CONFLICT(student_id,subject_id) DO UPDATE SET score=excluded.score RETURNING to_jsonb(grades.*) INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.dd460_apply_import(p_students jsonb DEFAULT '[]', p_subjects jsonb DEFAULT '[]', p_grades jsonb DEFAULT '[]', p_languages jsonb DEFAULT '[]', p_operation_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.account_profiles; rowdata jsonb; result jsonb; changed jsonb:='[]';
BEGIN
 a:=public.dd460_actor();
 IF a.id IS NULL OR a.role='company_officer' OR p_operation_id IS NULL THEN RAISE EXCEPTION 'Không có quyền ghi dữ liệu' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_students)<>'array' OR jsonb_typeof(p_subjects)<>'array' OR jsonb_typeof(p_grades)<>'array' OR jsonb_typeof(p_languages)<>'array' THEN RAISE EXCEPTION 'Payload không hợp lệ'; END IF;
 IF jsonb_array_length(p_students)+jsonb_array_length(p_subjects)+jsonb_array_length(p_grades)+jsonb_array_length(p_languages)>50000 THEN RAISE EXCEPTION 'File quá lớn, tối đa 50000 bản ghi'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(a.id::text||':'||p_operation_id::text,0));
 SELECT r.result INTO result FROM public.write_receipts r WHERE r.actor_id=a.id AND r.operation_id=p_operation_id;
 IF FOUND THEN RETURN result; END IF;
 FOR rowdata IN SELECT value FROM jsonb_array_elements(p_subjects) ORDER BY value->>'id' LOOP
  changed:=changed||jsonb_build_array(jsonb_build_object('table','subjects','row',public.dd460_save_record('subjects',rowdata)));
 END LOOP;
 FOR rowdata IN SELECT value FROM jsonb_array_elements(p_students) ORDER BY value->>'id' LOOP
  changed:=changed||jsonb_build_array(jsonb_build_object('table','students','row',public.dd460_save_record('students',rowdata)));
 END LOOP;
 FOR rowdata IN SELECT value FROM jsonb_array_elements(p_languages) ORDER BY value->>'student_id' LOOP
  changed:=changed||jsonb_build_array(jsonb_build_object('table','languages','row',public.dd460_save_record('languages',rowdata)));
 END LOOP;
 FOR rowdata IN SELECT value FROM jsonb_array_elements(p_grades) ORDER BY value->>'student_id',value->>'subject_id' LOOP
  changed:=changed||jsonb_build_array(jsonb_build_object('table','grades','row',public.dd460_write_grade(rowdata)));
 END LOOP;
 result:=jsonb_build_object('changes',changed);
 INSERT INTO public.write_receipts VALUES(a.id,p_operation_id,result,now());
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.dd460_get_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.account_profiles; rowdata public.unit_settings; scoped jsonb;
BEGIN
 a:=public.dd460_actor(); IF a.id IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập' USING ERRCODE='42501'; END IF;
 SELECT * INTO rowdata FROM public.unit_settings WHERE unit_id='daidoi460';
 IF a.role='admin' THEN scoped:=coalesce(rowdata.locks,'{}');
 ELSE SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO scoped FROM jsonb_each(coalesce(rowdata.locks,'{}'))
  WHERE key~'^(OTQS1|OTQS2|TTG1|TTG2|XMCB)(_year_[1-5]|_([1-9]|10))$' AND (a.role='company_officer' OR key LIKE a.class_code||'_%'); END IF;
 RETURN jsonb_build_object('required_lang_standard',coalesce(rowdata.required_lang_standard,'A2'),'locks',scoped,'revision',coalesce(rowdata.revision,0));
END $$;
CREATE OR REPLACE FUNCTION public.dd460_update_settings(p_changes jsonb, p_expected jsonb, p_standard text, p_expected_standard text, p_operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.account_profiles; rowdata public.unit_settings; item record; result jsonb; nextlocks jsonb;
BEGIN
 a:=public.dd460_actor(); IF a.role IS DISTINCT FROM 'admin' OR p_operation_id IS NULL THEN RAISE EXCEPTION 'Chỉ Admin được cấu hình đơn vị' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(a.id::text||':'||p_operation_id::text,0));
 SELECT r.result INTO result FROM public.write_receipts r WHERE r.actor_id=a.id AND r.operation_id=p_operation_id; IF FOUND THEN RETURN result; END IF;
 INSERT INTO public.unit_settings(unit_id) VALUES('daidoi460') ON CONFLICT(unit_id) DO NOTHING;
 SELECT * INTO rowdata FROM public.unit_settings WHERE unit_id='daidoi460' FOR UPDATE;
 nextlocks:=coalesce(rowdata.locks,'{}');
 FOR item IN SELECT key,value FROM jsonb_each(p_changes) LOOP
  IF item.key !~ '^(OTQS1|OTQS2|TTG1|TTG2|XMCB)(_year_[1-5]|_([1-9]|10))$' OR jsonb_typeof(item.value)<>'boolean' THEN RAISE EXCEPTION 'Khóa cấu hình không hợp lệ'; END IF;
  IF nextlocks->item.key IS DISTINCT FROM p_expected->item.key THEN RAISE EXCEPTION 'Cấu hình đã thay đổi. Hãy tải lại.' USING ERRCODE='40001'; END IF;
  nextlocks:=jsonb_set(nextlocks,ARRAY[item.key],item.value,true);
 END LOOP;
 IF p_standard IS NOT NULL THEN
  IF p_standard NOT IN ('A1','A21','A2','B11','B1') THEN RAISE EXCEPTION 'Chuẩn ngoại ngữ không hợp lệ'; END IF;
  IF rowdata.required_lang_standard IS DISTINCT FROM p_expected_standard THEN RAISE EXCEPTION 'Chuẩn ngoại ngữ đã thay đổi' USING ERRCODE='40001'; END IF;
 END IF;
 UPDATE public.unit_settings SET locks=nextlocks,required_lang_standard=coalesce(p_standard,required_lang_standard) WHERE unit_id='daidoi460';
 result:=public.dd460_get_settings(); INSERT INTO public.write_receipts VALUES(a.id,p_operation_id,result,now()); RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.dd460_delete(p_kind text,p_id text,p_expected bigint,p_operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.account_profiles; t text; oldrow jsonb; result jsonb;
BEGIN
 a:=public.dd460_actor(); IF a.id IS NULL OR a.role NOT IN ('admin','class_account') OR p_operation_id IS NULL THEN RAISE EXCEPTION 'Không có quyền xóa' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(a.id::text||':'||p_operation_id::text,0));
 SELECT r.result INTO result FROM public.write_receipts r WHERE r.actor_id=a.id AND r.operation_id=p_operation_id; IF FOUND THEN RETURN result; END IF;
 IF p_kind IN ('all_students','all_subjects') THEN
  IF a.role<>'admin' THEN RAISE EXCEPTION 'Chỉ Admin được xóa toàn bộ' USING ERRCODE='42501'; END IF;
  IF p_kind='all_students' THEN DELETE FROM public.grades; DELETE FROM public.languages; DELETE FROM public.students;
  ELSE DELETE FROM public.grades; DELETE FROM public.subjects; END IF;
 ELSE
  IF p_kind NOT IN ('student','subject') THEN RAISE EXCEPTION 'Thao tác không hợp lệ'; END IF;
  t:=CASE WHEN p_kind='student' THEN 'students' ELSE 'subjects' END;
  IF p_kind='subject' AND a.role<>'admin' OR p_kind='student' AND NOT public.dd460_can_write_student(p_id) THEN RAISE EXCEPTION 'Không có quyền xóa bản ghi' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(t||':'||p_id,0));
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE id=$1 FOR UPDATE',t) INTO oldrow USING p_id;
  IF oldrow IS NULL OR (oldrow->>'revision')::bigint IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Dữ liệu đã thay đổi. Hãy tải lại trước khi xóa.' USING ERRCODE='40001'; END IF;
  IF p_kind='student' THEN DELETE FROM public.grades WHERE student_id=p_id; DELETE FROM public.languages WHERE student_id=p_id; DELETE FROM public.students WHERE id=p_id;
  ELSE DELETE FROM public.grades WHERE subject_id=p_id; DELETE FROM public.subjects WHERE id=p_id; END IF;
 END IF;
 result:=jsonb_build_object('ok',true); INSERT INTO public.write_receipts VALUES(a.id,p_operation_id,result,now()); RETURN result;
END $$;
-- Definer helpers must never be callable as write shortcuts.
REVOKE ALL ON FUNCTION public.dd460_save_record(text,jsonb),public.dd460_write_grade(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dd460_actor(),public.dd460_can_read_student(text),public.dd460_can_write_student(text),public.dd460_subject_for_class(public.subjects,text),public.dd460_get_settings(),public.dd460_apply_import(jsonb,jsonb,jsonb,jsonb,uuid),public.dd460_update_settings(jsonb,jsonb,text,text,uuid),public.dd460_delete(text,text,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dd460_actor(),public.dd460_can_read_student(text),public.dd460_can_write_student(text),public.dd460_subject_for_class(public.subjects,text),public.dd460_get_settings(),public.dd460_apply_import(jsonb,jsonb,jsonb,jsonb,uuid),public.dd460_update_settings(jsonb,jsonb,text,text,uuid),public.dd460_delete(text,text,bigint,uuid) TO authenticated;
REVOKE ALL ON SEQUENCE public.dd460_revision_seq FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.account_profiles TO service_role;
REVOKE ALL ON FUNCTION public.dd460_bump_revision(),public.dd460_audit_change() FROM PUBLIC,anon,authenticated;
COMMIT;
