import { assertDatabaseWriteAllowed } from '../profile-rules.js';
import { executeWithRetry } from './client.js';

export async function safeUpsertRows(client, tableName, rowsInput, primaryConflictCol = 'id', fallbackConflictCol = null, ignoreDuplicates = false) {
  assertDatabaseWriteAllowed();
  if (!rowsInput) return { data: [], error: null };
  const rowsArray = Array.isArray(rowsInput) ? rowsInput : [rowsInput];
  if (rowsArray.length === 0) return { data: [], error: null };

  let workingRows = rowsArray.map(r => ({ ...r }));
  let conflictCol = primaryConflictCol;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await executeWithRetry(
      () => client.from(tableName).upsert(workingRows, { onConflict: conflictCol, ignoreDuplicates }),
      { maxAttempts: 3, baseDelayMs: 140 }
    );
    if (!res || !res.error) {
      return res;
    }

    const errMsg = String(res.error.message || res.error.details || JSON.stringify(res.error));

    // 1. Dừng và báo rõ nếu schema thiếu cột (PGRST204 hoặc 42703)
    const missingColMatch =
      errMsg.match(/Could not find the '([^']+)' column/i) ||
      errMsg.match(/column "([^"]+)" of relation/i) ||
      errMsg.match(/column "([^"]+)" does not exist/i);

    if (missingColMatch && missingColMatch[1]) {
      const missingCol = missingColMatch[1];
      console.warn(`[Supabase Auto-Adapt] Bảng ${tableName} chưa có cột '${missingCol}', dừng ghi để tránh mất dữ liệu.`);
      // Never silently discard Excel columns and report a successful import.
      return { data: null, error: { ...res.error,
        message: `Bảng ${tableName} thiếu cột ${missingCol}. Cần cập nhật schema trước khi nhập dữ liệu.`
      } };
    }

    // 2. Kiểm tra nếu lỗi xung đột khóa UNIQUE (23505) khi nhiều người ghi đồng thời
    if (
      fallbackConflictCol &&
      conflictCol !== fallbackConflictCol &&
      (errMsg.includes('23505') || errMsg.toLowerCase().includes('duplicate key') || errMsg.toLowerCase().includes('unique constraint'))
    ) {
      conflictCol = fallbackConflictCol;
      continue;
    }

    return res;
  }

  return { data: null, error: { message: `Không thể ghi vào bảng ${tableName} sau nhiều lần thử.` } };
}

// ============================================================================
// CÁC HÀM TRUY VẤN TRỰC TIẾP TRÊN SUPABASE (SELECT, INSERT, UPDATE, DELETE)
// ============================================================================

// Limit both record count and UTF-8 payload size. Keep requests sequential so one
// browser does not multiply concurrent writes when many users import together.
function createWriteBatches(rows, maxRows = 500, maxBytes = 256 * 1024) {
  const encoder = new TextEncoder();
  const batches = [];
  let batch = [];
  let bytes = 2; // JSON array brackets
  for (const row of rows) {
    const rowBytes = encoder.encode(JSON.stringify(row)).byteLength;
    if (rowBytes + 2 > maxBytes) {
      throw new Error(`Một bản ghi vượt giới hạn ${maxBytes / 1024} KiB; hãy rút gọn nội dung trước khi nhập.`);
    }
    if (batch.length && (batch.length >= maxRows || bytes + rowBytes + 1 > maxBytes)) {
      batches.push(batch);
      batch = [];
      bytes = 2;
    }
    batch.push(row);
    bytes += rowBytes + 1;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function upsertBatches(client, table, rows, conflict, fallback = null, ignoreDuplicates = false, maxRows = 500) {
  assertDatabaseWriteAllowed();
  const batches = createWriteBatches(rows, maxRows);
  let processedCount = 0;
  for (let index = 0; index < batches.length; index++) {
    const result = await safeUpsertRows(client, table, batches[index], conflict, fallback, ignoreDuplicates);
    if (result?.error) return { ...result, processedCount, failedBatch: index + 1 };
    processedCount += batches[index].length;
  }
  // processedCount counts acknowledged inputs, including ignored duplicates.
  return { data: null, error: null, processedCount };
}

// Single-flight Promise giúp gom các yêu cầu tải toàn bộ dữ liệu trùng lặp trên cùng 1 máy
