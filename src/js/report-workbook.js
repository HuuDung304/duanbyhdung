function formatReportArchive(archive, workbook) {
  const decode = file => new TextDecoder().decode(file.content);
  const store = (file, xml) => { file.content = new TextEncoder().encode(xml); file.size = file.content.length; };
  const styleIndex = archive.FullPaths.findIndex(path => /xl\/styles\.xml$/.test(path));
  const styleFile = archive.FileIndex[styleIndex];
  let styles = decode(styleFile);
  styles = styles.replace(/<name\b[^>]*\/>/g, '<name val="Times New Roman"/>').replace(/<sz\b[^>]*\/>/g, '<sz val="12"/>').replace(/<scheme\b[^>]*\/>/g, '').replace(/<family\b[^>]*\/>/g, '<family val="1"/>');
  const append = (tag, item) => {
    const expression = new RegExp(`<${tag}\\b[^>]*count="(\\d+)"[^>]*>([\\s\\S]*?)<\\/${tag}>`);
    let index;
    styles = styles.replace(expression, (_, count, content) => { index = Number(count); return `<${tag} count="${index + 1}">${content}${item}</${tag}>`; });
    return index;
  };
  const boldFont = append('fonts', '<font><b/><sz val="12"/><color rgb="FF0F172A"/><name val="Times New Roman"/><family val="1"/></font>');
  const border = append('borders', '<border><left style="thin"><color rgb="FF94A3B8"/></left><right style="thin"><color rgb="FF94A3B8"/></right><top style="thin"><color rgb="FF94A3B8"/></top><bottom style="thin"><color rgb="FF94A3B8"/></bottom><diagonal/></border>');
  const fill = append('fills', '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>');
  const greenFill = append('fills', '<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>');
  const yellowFill = append('fills', '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF9C3"/><bgColor indexed="64"/></patternFill></fill>');
  let styleCount = 0;
  styles = styles.replace(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/, (_, content) => {
    const original = content.match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g) || [];
    styleCount = original.length;
    const decorate = (xf, mode) => {
      let opening = xf.match(/^<xf\b[^>]*>/)[0].replace(/\/>$/, '>');
      const attr = (name, value) => { const re = new RegExp(` ${name}="[^"]*"`); opening = re.test(opening) ? opening.replace(re, ` ${name}="${value}"`) : opening.replace(/>$/, ` ${name}="${value}">`); };
      attr('borderId', border); attr('applyBorder', 1); attr('applyAlignment', 1);
      if (mode === 1) { attr('fontId', boldFont); attr('fillId', fill); attr('applyFont', 1); attr('applyFill', 1); }
      if (mode === 2 || mode === 3) { attr('fillId', mode === 2 ? greenFill : yellowFill); attr('applyFill', 1); }
      if (mode === 4) { attr('borderId', 0); attr('fillId', 0); attr('applyFill', 1); }
      return `${opening}<alignment horizontal="center" vertical="center" wrapText="1"/></xf>`;
    };
    return `<cellXfs count="${styleCount * 5}">${[0,1,2,3,4].map(mode => original.map(xf => decorate(xf, mode)).join('')).join('')}</cellXfs>`;
  });
  store(styleFile, styles);
  archive.FullPaths.forEach((path, index) => {
    const match = path.match(/xl\/worksheets\/sheet(\d+)\.xml$/); if (!match) return;
    const sheet = workbook.Sheets[workbook.SheetNames[Number(match[1]) - 1]];
    const headerRows = new Set(sheet['!reportHeaderRows'] || []);
    const file = archive.FileIndex[index];
    const xml = decode(file).replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/g, (all, attrs, cells) => {
      const row = Number(attrs.match(/\br="(\d+)"/)?.[1]);
      return `<row${attrs}>${cells.replace(/<c\b([^>]*)>/g, (cell, attributes) => {
        const previous = Number(attributes.match(/\bs="(\d+)"/)?.[1] || 0);
        const address = attributes.match(/\br="([A-Z]+\d+)"/)?.[1];
        const tint = sheet['!reportCellFills']?.[address];
        const column = address?.replace(/\d+$/, '');
        const mode = sheet['!reportBlankColumns']?.includes(column) ? 4 : headerRows.has(row) ? 1 : tint === 'green' ? 2 : tint === 'yellow' ? 3 : 0;
        const style = Math.min(previous, styleCount - 1) + mode * styleCount;
        return `<c${attributes.replace(/\s+s="\d+"/, '')} s="${style}">`;
      })}</row>`;
    });
    store(file, xml);
  });
}

// SheetJS CE does not serialize pageSetup. Add genuine OOXML print settings
// to the generated ZIP so the downloaded workbook opens with A4 landscape.
export function buildPrintableReport(workbook, xlsx = globalThis.XLSX) {
  workbook.Workbook ||= {};
  workbook.Workbook.Names ||= [];
  workbook.SheetNames.forEach((name, index) => {
    const sheet = workbook.Sheets[name];
    sheet['!margins'] = { left: .25, right: .25, top: .35, bottom: .35, header: .15, footer: .15 };
    const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1');
    sheet['!reportHeaderRows'] ||= [];
    sheet['!rows'] ||= [];
    for (let row = range.s.r; row <= range.e.r; row++) {
      const values = [];
      for (let column = range.s.c; column <= range.e.c; column++) {
        const key = xlsx.utils.encode_cell({ r: row, c: column });
        sheet[key] ||= { t: 's', v: '' };
        if (String(sheet[key].v ?? '').trim()) values.push(String(sheet[key].v));
      }
      if (values.length === 1 || values.some(value => /^(STT|Mã (HV|học viên)|Họ và [Tt]ên|Lớp|Học kỳ)$/.test(value))) sheet['!reportHeaderRows'].push(row + 1);
      const title = values.length === 1;
      if (title && range.e.c > range.s.c) {
        sheet['!merges'] ||= [];
        if (!sheet['!merges'].some(merge => merge.s.r <= row && merge.e.r >= row)) sheet['!merges'].push({ s: { r: row, c: range.s.c }, e: { r: row, c: range.e.c } });
      }
      let lines = 1;
      if (!title) for (let column = range.s.c; column <= range.e.c; column++) {
        const cell = sheet[xlsx.utils.encode_cell({ r: row, c: column })];
        const merge = sheet['!merges']?.find(item => item.s.r === row && item.e.r === row && item.s.c === column);
        const width = merge ? Array.from({ length: merge.e.c - column + 1 }, (_, offset) => sheet['!cols']?.[column + offset]?.wch || 14).reduce((sum, value) => sum + value, 0) : sheet['!cols']?.[column]?.wch || 14;
        lines = Math.max(lines, ...String(cell.v ?? '').split('\n').map(line => Math.ceil(line.length / Math.max(5, width - 2))));
      }
      sheet['!rows'][row] = { ...sheet['!rows'][row], hpt: Math.max(sheet['!rows'][row]?.hpt || 0, Math.min(250, lines * 16 + 12)) };
    }
    const quoted = `'${name.replaceAll("'", "''")}'`;
    const area = (sheet['!ref'] || 'A1').split(':').map(cell => cell.replace(/([A-Z]+)(\d+)/, '$$$1$$$2')).join(':');
    workbook.Workbook.Names.push({ Name: '_xlnm.Print_Area', Sheet: index, Ref: `${quoted}!${area}` });
    if (index > 0 || sheet['!reportRepeatRows']) workbook.Workbook.Names.push({ Name: '_xlnm.Print_Titles', Sheet: index, Ref: `${quoted}!$1:$${sheet['!reportRepeatRows'] || (index === 2 ? 3 : 5)}` });
  });
  const archive = xlsx.CFB.read(new Uint8Array(xlsx.write(workbook, { bookType: 'xlsx', type: 'array' })), { type: 'array' });
  archive.FullPaths.forEach((path, index) => {
    if (!/xl\/worksheets\/sheet\d+\.xml$/.test(path)) return;
    const file = archive.FileIndex[index];
    let xml = new TextDecoder().decode(file.content);
    if (/<sheetPr\b/.test(xml)) {
      xml = xml.replace('</sheetPr>', '<pageSetUpPr fitToPage="1"/></sheetPr>');
    } else {
      xml = xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    }
    const setup = '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
    xml = xml.replace(/(<pageMargins\b[^>]*\/>)/, `$1${setup}`);
    file.content = new TextEncoder().encode(xml); file.size = file.content.length;
  });
  formatReportArchive(archive, workbook);
  return xlsx.CFB.write(archive, { fileType: 'zip', type: 'array', compression: true });
}
export function writeReportWorkbook(workbook, filename) {
  const bytes = buildPrintableReport(workbook);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
