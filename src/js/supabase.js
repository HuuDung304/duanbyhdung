// Compatibility facade: existing imports keep the same public API.
// Implementations form a directed graph under database/; none imports this facade.
export {
  SUPABASE_PROJECT_REF,
  SUPABASE_URL,
  SUPABASE_KEY,
  SUPABASE_CONFIG,
  TABLES,
  withButtonLock,
  beginSupabaseWrite,
  endSupabaseWrite,
  isSupabaseWriteBusy,
  executeWithRetry,
  initSupabaseClient,
  supabaseSingleton,
  getSupabaseClient
} from './database/client.js';
export {
  importExcelTransaction
} from './database/import-transaction.js';
export {
  buildDeterministicStudentId,
  mapStudentToDbRow,
  mapDbRowToStudent,
  mapSubjectToDbRow,
  mapDbRowToSubject,
  mapLanguageToDbRow,
  mapDbRowToLanguage
} from './database/mappers.js';
export {
  subscribeSupabaseRealtime
} from './database/realtime.js';
export {
  loadAllDataFromSupabase,
  findStudentByCodeOnSupabase,
  upsertStudentToSupabase,
  upsertStudentsBulkToSupabase,
  deleteStudentFromSupabase,
  deleteAllStudentsFromSupabase,
  upsertSubjectToSupabase,
  upsertSubjectsBulkToSupabase,
  deleteSubjectFromSupabase,
  deleteSubjectsByIdsFromSupabase,
  deleteAllSubjectsFromSupabase,
  upsertGradeToSupabase,
  deleteGradeFromSupabase,
  upsertGradesBulkToSupabase,
  upsertLanguageToSupabase,
  saveUnitSettingsToSupabase
} from './database/repository.js';
export { supabaseSingleton as default } from './database/client.js';
