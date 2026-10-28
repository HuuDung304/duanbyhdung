export const RANKING_HEADERS = ['STT','MÃ HỌC VIÊN','HỌ VÀ TÊN','NGÀY THÁNG NĂM SINH','LỚP','ĐIỂM HK1','ĐIỂM KỲ 2','ĐIỂM TỔNG KẾT','TIẾNG NGA','GHI CHÚ'];

export function rankAcademicRoster(records, { greenRate = .10, yellowRate = .25, yellowIncludesGreen = false } = {}) {
  const ranked = records.map(record => ({ ...record, award: null })).sort((a,b) => (b.total ?? -1) - (a.total ?? -1)
    || String(a.student.code).localeCompare(String(b.student.code), 'vi') || String(a.student.id).localeCompare(String(b.student.id)));
  const greenLimit = Math.floor(ranked.length * greenRate);
  const yellowLimit = Math.max(0, Math.floor(ranked.length * yellowRate));
  let greens = 0, yellows = 0;
  for (const record of ranked) {
    if (record.total > 8 && record.languagePassed && greens < greenLimit) { record.award = 'green'; greens++; }
  }
  const remainingYellow = yellowIncludesGreen ? Math.max(0, yellowLimit - greens) : yellowLimit;
  for (const record of ranked) {
    if (!record.award && record.total > 7 && record.languagePassed && yellows < remainingYellow) { record.award = 'yellow'; yellows++; }
  }
  return { ranked, greenLimit, yellowLimit, greens, yellows };
}

export function rankingTableRows(records, formatDate, policy) {
  const result = rankAcademicRoster(records, policy);
  return { ...result, rows: result.ranked.map((item,index) => [index+1,String(item.student.code || ''),item.student.name,formatDate(item.student.dob),item.student.class,
    item.hk1 ?? '',item.hk2 ?? '',item.total ?? '',item.languagePassed ? 'Đạt' : 'Chưa đạt','']) };
}
