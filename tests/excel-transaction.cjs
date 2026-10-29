const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE students(id text PRIMARY KEY, code text UNIQUE, name text);
    CREATE TABLE subjects(id text PRIMARY KEY, name text);
    CREATE TABLE grades(id text PRIMARY KEY, student_id text REFERENCES students(id), subject_id text REFERENCES subjects(id), score numeric, UNIQUE(student_id,subject_id));`);
  await db.exec(readFileSync('supabase/migrations/20261029_excel_transaction.sql','utf8'));
  const payload = { students:[{id:'s',code:'001',name:'Test'}], subjects:[{id:'m',name:'Math'}], grades:[{id:'g',student_id:'s',subject_id:'m',score:0}] };
  const run = p => db.query('SELECT public.dd460_import_excel($1::jsonb)', [JSON.stringify(p)]);
  await run(payload);
  assert.equal((await db.query('SELECT score FROM grades')).rows[0].score, '0');
  await assert.rejects(run({ students:[{id:'s2',code:'002',name:'Rollback'}], grades:[{id:'bad',student_id:'s2',subject_id:'missing',score:5}] }));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM students WHERE id='s2'")).rows[0].n,0);
  await assert.rejects(run({grades:[{id:'bad',student_id:'s',subject_id:'m',score:11}]}));
  await assert.rejects(run({students:[{id:'other',code:'001',name:'Conflict'}]}));
  assert.equal((await db.query('SELECT id FROM students')).rows[0].id,'s');
  await db.exec('SET ROLE anon');
  await assert.rejects(run(payload)); // invoker cannot bypass table permissions
  await db.exec('RESET ROLE');
  await db.close();
  console.log('PASS: atomic commit, rollback, zero score, invalid score, ID conflict, invoker permissions');
})().catch(error => { console.error(error); process.exitCode=1; });
