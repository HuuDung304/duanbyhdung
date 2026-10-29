import { test } from 'node:test';
import assert from 'node:assert/strict';
import database, { getSupabaseClient, importExcelTransaction } from '../src/js/supabase.js';
import { supabaseSingleton } from '../src/js/database/client.js';
import { mapStudentToDbRow } from '../src/js/database/mappers.js';

test('database facade preserves one shared client and profile mapping', () => {
  assert.equal(database,supabaseSingleton);
  assert.equal(getSupabaseClient(),supabaseSingleton);
  const row=mapStudentToDbRow({id:'s',code:'001',name:'A',class:'OTQS1',dob:'30/04/2006',father_birth_date:'1975'});
  assert.equal(row.code,'001');
  assert.equal(row.dob,'2006-04-30');
  assert.equal(row.father_birth_date,'1975');
});

test('transaction module keeps zero scores, distinguishes missing RPC and SQL rejection, and blocks officer writes', async () => {
  const originalFetch=globalThis.fetch, originalState=globalThis.AppState;
  let calls=0;
  try {
    globalThis.AppState={role:'admin'};
    globalThis.fetch=async(url,options)=>{
      calls++;
      assert.match(url,/\/rest\/v1\/rpc\/dd460_import_excel$/);
      const body=JSON.parse(options.body);
      assert.equal(body.payload.grades[0].score,0);
      return new Response(JSON.stringify({processed:1}));
    };
    const input={grades:[{studentId:'s',subjectId:'m',score:0}]};
    assert.equal((await importExcelTransaction(input)).atomic,true);
    globalThis.fetch=async()=>new Response(JSON.stringify({code:'PGRST202'}),{status:404});
    assert.equal((await importExcelTransaction(input)).unavailable,true);
    globalThis.fetch=async()=>new Response(JSON.stringify({code:'23503',message:'Foreign key rejected'}),{status:400});
    await assert.rejects(importExcelTransaction(input),error=>error.confirmedRollback===true);
    globalThis.AppState.role='company_officer';
    await assert.rejects(importExcelTransaction(input),/cán bộ chỉ được xem/);
    assert.equal(calls,1);
  } finally {globalThis.fetch=originalFetch;globalThis.AppState=originalState;}
});
