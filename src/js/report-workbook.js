// SheetJS CE does not serialize pageSetup. Add genuine OOXML print settings
// to the generated ZIP so the downloaded workbook opens with A4 landscape.
export function buildPrintableReport(workbook, xlsx = globalThis.XLSX) {
  workbook.Workbook ||= {};
  workbook.Workbook.Names ||= [];
  workbook.SheetNames.forEach((name, index) => {
    const sheet = workbook.Sheets[name];
    sheet['!margins'] = { left: .25, right: .25, top: .35, bottom: .35, header: .15, footer: .15 };
    const quoted = `'${name.replaceAll("'", "''")}'`;
    const area = (sheet['!ref'] || 'A1').split(':').map(cell => cell.replace(/([A-Z]+)(\d+)/, '$$$1$$$2')).join(':');
    workbook.Workbook.Names.push({ Name: '_xlnm.Print_Area', Sheet: index, Ref: `${quoted}!${area}` });
    if (index > 0) workbook.Workbook.Names.push({ Name: '_xlnm.Print_Titles', Sheet: index, Ref: `${quoted}!$1:$${index === 2 ? 3 : 5}` });
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
  return xlsx.CFB.write(archive, { fileType: 'zip', type: 'array', compression: true });
}
export function writeReportWorkbook(workbook, filename) {
  const bytes = buildPrintableReport(workbook);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
