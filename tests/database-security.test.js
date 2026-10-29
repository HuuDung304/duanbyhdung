import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const ids = { admin:'10000000-0000-0000-0000-000000000001', officer:'10000000-0000-0000-0000-000000000002', leader:'10000000-0000-0000-0000-000000000003', student:'10000000-0000-0000-0000-000000000004' };
async function fixture() {
 const db = new PGlite();
 await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; GRANT USAGE ON SCHEMA auth TO anon,authenticated;`);
 await db.exec(readFileSync('supabase_schema.sql','utf8'));
 await db.exec(`INSERT INTO students(id,code,name,class) VALUES('s1','001','A','OTQS1'),('s2','002','B','TTG1'); INSERT INTO subjects(id,code,name,semester,credits) VALUES('m1','M1','Toán',1,3);`);
 await db.exec(readFileSync('supabase/migrations/20261029_security_and_transactions.sql','utf8'));
 for(const [role,id] of Object.entries(ids)) {
  await db.query('INSERT INTO auth.users VALUES($1)',[id]);
  await db.query('INSERT INTO account_profiles(id,username,role,class_code,student_id) VALUES($1,$2,$3,$4,$5)',[id,role,{admin:'admin',officer:'company_officer',leader:'class_account',student:'student'}[role],role==='leader'?'OTQS1':null,role==='student'?'s1':null]);
 }
 const as=async role=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[ids[role]||'']);await db.exec(`SET ROLE ${role==='anon'?'anon':'authenticated'}`);};
 return {db,as};
}
test('real PostgreSQL RLS isolates unit, class and student reads; no anonymous access or direct writes', async()=>{
 const {db,as}=await fixture();try{
  await as('anon'); await assert.rejects(db.query('SELECT * FROM students'),/permission denied/);
  await as('admin');assert.equal((await db.query('SELECT * FROM students')).rows.length,2);
  await as('officer');assert.equal((await db.query('SELECT * FROM students')).rows.length,2);
  await assert.rejects(db.query("UPDATE students SET name='Hacked'"),/permission denied/);
  await as('leader');assert.deepEqual((await db.query('SELECT id FROM students')).rows.map(r=>r.id),['s1']);
  await assert.rejects(db.query("UPDATE account_profiles SET role='admin'"),/permission denied/);
  await as('student');assert.deepEqual((await db.query('SELECT id FROM students')).rows.map(r=>r.id),['s1']);
  await assert.rejects(db.query("SELECT * FROM dd460_write_grade('{}')"),/permission denied/);
 }finally{await db.close();}
});
test('grade RPC enforces role, class, lock, exact version, idempotency and authoritative audit',async()=>{
 const {db,as}=await fixture();try{
  const write=async(score,revision=0,operation=crypto.randomUUID(),sid='s1')=>db.query('SELECT dd460_apply_import(p_grades:=$1::jsonb,p_operation_id:=$2::uuid) AS result',[JSON.stringify([{student_id:sid,subject_id:'m1',score,_expected_revision:revision}]),operation]);
  await as('officer');await assert.rejects(write(9),/Không có quyền/);
  await as('leader');await assert.rejects(write(9,0,crypto.randomUUID(),'s2'),/Không có quyền/);
  const operation=crypto.randomUUID();const first=(await write(3.99,0,operation)).rows[0].result;
  const revision=first.changes[0].row.revision;assert.equal(Number(first.changes[0].row.score),3.99);
  assert.deepEqual((await write(3.99,0,operation)).rows[0].result,first);
  await assert.rejects(write(8,0),/cập nhật/);
  await write(8,revision);assert.equal(Number((await db.query("SELECT score FROM grades WHERE student_id='s1'")).rows[0].score),8);
  assert.equal((await db.query("SELECT * FROM audit_events WHERE table_name='grades'")).rows.length,2);
  await as('admin');await db.query("SELECT dd460_update_settings($1,'{}',NULL,NULL,$2)",[JSON.stringify({OTQS1_year_1:true}),crypto.randomUUID()]);
  await as('leader');const current=(await db.query("SELECT revision FROM grades WHERE student_id='s1'")).rows[0].revision;await assert.rejects(write(9,current),/đã khóa/);
  await as('student');await assert.rejects(write(10,current),/Không có quyền/);
 }finally{await db.close();}
});
test('an invalid grade rolls back new students and all grade rows in the same import transaction',async()=>{
 const {db,as}=await fixture();try{
  await as('admin');const payload=[{id:'new',code:'003',name:'New',class:'OTQS1',_expected_revision:0}];
  await assert.rejects(db.query('SELECT dd460_apply_import($1,\'[]\',$2,\'[]\',$3)',[JSON.stringify(payload),JSON.stringify([{student_id:'s1',subject_id:'m1',score:7,_expected_revision:0},{student_id:'new',subject_id:'missing',score:8,_expected_revision:0}]),crypto.randomUUID()]),/Môn học/);
  assert.equal((await db.query("SELECT * FROM students WHERE id='new'")).rows.length,0);assert.equal((await db.query('SELECT * FROM grades')).rows.length,0);
 }finally{await db.close();}
});
test('settings merge only touched lock keys, preserve legacy backup, and detect stale changes',async()=>{
 const {db,as}=await fixture();try{
  await db.query("UPDATE unit_settings SET locks=$1",[JSON.stringify({__dd460_ext_profiles:{private:'legacy'},OTQS1_year_1:false,TTG1_year_1:false})]);
  await as('admin');await db.query('SELECT dd460_update_settings($1,$2,NULL,NULL,$3)',[JSON.stringify({OTQS1_year_1:true}),JSON.stringify({OTQS1_year_1:false}),crypto.randomUUID()]);
  await db.query('SELECT dd460_update_settings($1,$2,NULL,NULL,$3)',[JSON.stringify({TTG1_year_1:true}),JSON.stringify({TTG1_year_1:false}),crypto.randomUUID()]);
  await assert.rejects(db.query('SELECT dd460_update_settings($1,$2,NULL,NULL,$3)',[JSON.stringify({OTQS1_year_1:false}),JSON.stringify({OTQS1_year_1:false}),crypto.randomUUID()]),/đã thay đổi/);
  const settings=(await db.query('SELECT dd460_get_settings() AS result')).rows[0].result;assert.equal(settings.locks.TTG1_year_1,true);assert.equal(settings.locks.__dd460_ext_profiles.private,'legacy');
  await as('leader');const limited=(await db.query('SELECT dd460_get_settings() AS result')).rows[0].result;assert.equal(limited.locks.__dd460_ext_profiles,undefined);assert.equal(limited.locks.TTG1_year_1,undefined);
 }finally{await db.close();}
});
