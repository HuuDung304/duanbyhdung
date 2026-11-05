import { AppState, DEFAULT_CLASSES, getScopedStudents, getSubjectsForClass, evaluateLangLevelStatus, getGradeLetterAndScale4, normalizeDateVN, showToast } from './grades.js';
const valid=value=>value!=null&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=10;
export function nominationYears(semesters) {
 return [...new Set(semesters.map(semester=>Math.ceil(Number(semester)/2)))].sort((a,b)=>a-b);
}
export function nominationRecords({students,grades,years,semesters,subjectsForClass,languageStatus,scale4,threshold,classes=DEFAULT_CLASSES}) {
 const displayYears=years||nominationYears(semesters);
 const selected=new Set(semesters||displayYears.flatMap(year=>[year*2-1,year*2]));
 return students.filter(s=>s.politicalStatus==='CAM_TINH_DANG'&&languageStatus(s).isPassed).map(student=>{
  const scores=grades[student.id]||{};
  const periods=displayYears.map(year=>{
   const terms=[year*2-1,year*2].map(semester=>{
    const subjects=subjectsForClass(student.class,semester);
    const credits=subjects.reduce((n,s)=>n+Number(s.credits),0);
    const complete=subjects.length>0&&credits>0&&subjects.every(s=>valid(scores[s.id]));
    return {semester,complete,credits,points:complete?subjects.reduce((n,s)=>n+scale4(Number(scores[s.id]))*Number(s.credits),0):0};
   });
   const cells=terms.map(t=>t.complete?t.points/t.credits:null);
   cells.push(terms.every(t=>t.complete)?terms.reduce((n,t)=>n+t.points,0)/terms.reduce((n,t)=>n+t.credits,0):null);
   return {year,cells};
  });
  const completed=periods.flatMap(p=>p.cells.slice(0,2).map((value,index)=>({semester:p.year*2-1+index,value}))).filter(term=>selected.has(term.semester)&&term.value!==null).map(term=>term.value);
  return {student,periods,eligible:completed.length>0&&completed.every(v=>v>=threshold),language:languageStatus(student).actualLevel};
 }).filter(row=>row.eligible).sort((a,b)=>classes.indexOf(a.student.class)-classes.indexOf(b.student.class)||String(a.student.code).localeCompare(String(b.student.code),'vi'));
}
const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const paragraph=(text,format=false)=>{
 const {bold=false,italic=false,underline=false,size=12,spacing=0}=typeof format==='boolean'?{bold:format}:format;
 return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="${spacing}"/></w:pPr><w:r><w:rPr><w:b w:val="${bold?1:0}"/><w:i w:val="${italic?1:0}"/>${underline?'<w:u w:val="single"/>':''}<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="${size*2}"/><w:szCs w:val="${size*2}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
};
const cell=(text,{span=1,bold=false,merge=''}={})=>`<w:tc><w:tcPr>${span>1?`<w:gridSpan w:val="${span}"/>`:''}${merge?`<w:vMerge w:val="${merge}"/>`:''}<w:vAlign w:val="center"/></w:tcPr>${String(text).split('\n').map(t=>paragraph(t,bold)).join('')}</w:tc>`;
export function nominationDocumentXml(records,years,formatDate,section='') {
 const count=7+years.length*3;
 const borders='<w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} w:val="single" w:sz="4" w:color="000000"/>`).join('')+'</w:tblBorders>';
 const tableHeader='<w:trPr><w:tblHeader/></w:trPr>';
 let rows='<w:tr>'+tableHeader+['SỐ\nTT','HỌ VÀ TÊN\nNGÀY SINH','ĐƠN VỊ\n(Lớp, Đại đội, Tiểu đoàn)','QUÊ QUÁN'].map(t=>cell(t,{bold:true,merge:'restart'})).join('')+cell('KẾT QUẢ HỌC TẬP',{span:years.length*3,bold:true})+['TRÌNH ĐỘ NGOẠI NGỮ','RÈN LUYỆN THỂ LỰC','GHI CHÚ'].map(t=>cell(t,{bold:true,merge:'restart'})).join('')+'</w:tr>';
 for(const labels of [years.flatMap(year=>[{text:`NĂM THỨ ${year}`,span:3}]),years.flatMap(()=>['HK1','HK2','CN'].map(text=>({text,span:1})))]) rows+='<w:tr>'+tableHeader+Array.from({length:4},()=>cell('',{merge:'continue'})).join('')+labels.map(item=>cell(item.text,{bold:true,span:item.span})).join('')+Array.from({length:3},()=>cell('',{merge:'continue'})).join('')+'</w:tr>';
 records.forEach(({student,periods,language},index)=>{
  const identity=[index+1,`${student.name}\n${formatDate(student.dob)}`,`Lớp ${student.class}, c460, d4`,student.hometown||''];
  for(let line=0;line<2;line++) rows+='<w:tr>'+identity.map(t=>cell(line?'':t,{merge:line?'continue':'restart'})).join('')+periods.flatMap(p=>p.cells).map(value=>cell(value===null?'':line?'T':value.toFixed(2))).join('')+[language,'',''].map(t=>cell(line?'':t,{merge:line?'continue':'restart'})).join('')+'</w:tr>';
 });
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tblGrid><w:gridCol w:w="7000"/><w:gridCol w:w="7000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:vAlign w:val="top"/></w:tcPr>${paragraph('ĐẢNG BỘ TIỂU ĐOÀN 4',{size:14,spacing:180})}${paragraph('CHI BỘ ĐẠI ĐỘI 460',{size:14,bold:true,spacing:180})}${paragraph('*',{size:14,bold:true})}</w:tc><w:tc><w:tcPr><w:vAlign w:val="top"/></w:tcPr>${paragraph('ĐẢNG CỘNG SẢN VIỆT NAM',{size:15,bold:true,underline:true,spacing:400})}${paragraph('Hà Nội, ngày ... tháng ... năm ...',{size:14,italic:true})}</w:tc></w:tr></w:tbl>${paragraph('DANH SÁCH DỰ KIẾN',{size:14,bold:true,spacing:180})}${paragraph('KẾT NẠP QUẦN CHÚNG ƯU TÚ VÀO ĐẢNG CỘNG SẢN VIỆT NAM',{size:15,bold:true,spacing:180})}${paragraph('ĐỢT THÁNG .... NĂM ....',{size:14,bold:true,spacing:180})}<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}</w:tblPr><w:tblGrid>${Array.from({length:count},()=>'<w:gridCol w:w="1200"/>').join('')}</w:tblGrid>${rows}</w:tbl>${paragraph(`Tổng: ${records.length} đồng chí.`)}${section}</w:body></w:document>`;
}
export function mountPartyNomination() {
 const button=document.getElementById('btnExportPartyNomination'),dialog=document.getElementById('partyNominationDialog'),form=document.getElementById('partyNominationForm');
 if(!button||!dialog||!form||button.dataset.mounted)return;
 button.dataset.mounted='true';
 button.addEventListener('click',()=>{if(['admin','company_officer'].includes(AppState.role))dialog.showModal();});
 document.getElementById('partyNominationCancel').addEventListener('click',()=>dialog.close());
 window.addEventListener('report-role-change',()=>{button.closest('article').hidden=!['admin','company_officer'].includes(AppState.role);dialog.close();});
 button.closest('article').hidden=!['admin','company_officer'].includes(AppState.role);
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!['admin','company_officer'].includes(AppState.role)||!form.reportValidity())return;
  const semesters=[...form.querySelectorAll('[name="partySemester"]:checked')].map(el=>Number(el.value));
  if(semesters.length!==3){showToast('Chọn đúng 3 học kỳ để xét.','error');return;}
  const years=nominationYears(semesters);
  const submit=form.querySelector('[type="submit"]');submit.disabled=true;
  try{
   const records=nominationRecords({students:getScopedStudents(),grades:AppState.grades,years,semesters,subjectsForClass:getSubjectsForClass,
    languageStatus:s=>evaluateLangLevelStatus(s.currentLangLevel||AppState.languages[s.id]?.currentLevel,AppState.requiredLangStandard),scale4:score=>getGradeLetterAndScale4(score).scale4,threshold:Number(document.getElementById('partyThreshold').value)});
   const response=await fetch(new URL('../assets/party-nomination-template.docx',import.meta.url));if(!response.ok)throw new Error('Không tải được mẫu Word.');
   const archive=XLSX.CFB.read(new Uint8Array(await response.arrayBuffer()),{type:'buffer'});
   const file=archive.FileIndex.find(item=>item.name==='document.xml');
   const original=new TextDecoder().decode(file.content);const section=original.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0]||'';
   const content=nominationDocumentXml(records,years,value=>normalizeDateVN(value,''),section);
   file.content = new TextEncoder().encode(content);
   file.size = file.content.length;
   const blob=new Blob([XLSX.CFB.write(archive,{type:'array',fileType:'zip'})],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Danh sách dự kiến kết nạp Đảng.docx';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);dialog.close();
  }catch(error){showToast(error.message,'error');}finally{submit.disabled=false;}
 });
}
