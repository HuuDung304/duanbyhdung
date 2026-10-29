import { TABLES, getSupabaseClient, isSupabaseWriteBusy } from './client.js';

let realtimeChannelInstance = null;
let realtimeDebounceTimer = null;

export function subscribeSupabaseRealtime(onDatabaseChanged) {
  const client = getSupabaseClient();
  if (!client || typeof client.channel !== 'function') return null;

  try {
    if (realtimeChannelInstance && typeof client.removeChannel === 'function') {
      client.removeChannel(realtimeChannelInstance);
    }

    const triggerChange = (tableName, payload) => {
      clearTimeout(realtimeDebounceTimer);
      const notifyWhenIdle = () => {
        // Queue remote changes received during a local Excel upload instead of dropping them.
        if (isSupabaseWriteBusy()) {
          realtimeDebounceTimer = setTimeout(notifyWhenIdle, 450);
          return;
        }
        if (typeof onDatabaseChanged === 'function') onDatabaseChanged(tableName, payload);
      };
      realtimeDebounceTimer = setTimeout(notifyWhenIdle, 450);
    };

    realtimeChannelInstance = client
      .channel('dd460-supabase-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.STUDENTS }, (payload) => triggerChange('students', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.SUBJECTS }, (payload) => triggerChange('subjects', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.GRADES }, (payload) => triggerChange('grades', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.LANGUAGES }, (payload) => triggerChange('languages', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.UNIT_SETTINGS }, (payload) => triggerChange('unit_settings', payload))
      .subscribe();

    return realtimeChannelInstance;
  } catch (err) {
    console.warn('Không thể đăng ký kênh Realtime Supabase:', err);
    return null;
  }
}

