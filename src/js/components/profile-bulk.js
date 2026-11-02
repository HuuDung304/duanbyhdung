import { AppState, getScopedStudents, normalizeDateVN, showToast } from '../grades.js';
import { writeReportWorkbook } from '../report-workbook.js';

// Selection is presentation-only and is confined to the currently rendered, authorized rows.
export function mountProfileBulk() {
 const body=document.getElementById('profilesTableBody'),table=body?.closest('table'),toolbar=document.getElementById('adminProfilesToolbar');
 if(!body||!table||!toolbar||body.dataset.bulkMounted)return;
 body.dataset.bulkMounted='true';
 const selected=new Set(),header=table.tHead?.rows[0]?.cells[0];
 const selectAll=document.createElement('input');selectAll.type='checkbox';selectAll.setAttribute('aria-label','Chọn tất cả học viên đang hiển thị');
 header.prepend(selectAll,document.createTextNode(' '));
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.className='profile-bulk-export';exportButton.disabled=true;
 toolbar.append(exportButton);
 const displayed=()=>[...body.querySelectorAll('tr[data-student-id]')];
 const update=()=>{
  const rows=displayed(),ids=new Set(rows.map(row=>row.dataset.studentId));
  const scoped=new Map(getScopedStudents().map(student=>[student.id,student]));
  for(const id of selected)if(!ids.has(id))selected.delete(id);
  for(const row of rows){
   const id=row.dataset.studentId,cell=row.cells[0];let checkbox=cell.querySelector('.profile-select-row');
   if(!checkbox){
    const number=document.createElement('span');number.className='profile-row-number';number.textContent=cell.textContent.trim();
    checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='profile-select-row';checkbox.setAttribute('aria-label',`Chọn học viên ${scoped.get(id)?.code || id}`);
    checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.add(id);else selected.delete(id);update();});
    cell.replaceChildren(checkbox,document.createTextNode(' '),number);
   }
   checkbox.checked=selected.has(id);
  }
  selectAll.checked=rows.length>0&&rows.every(row=>selected.has(row.dataset.studentId));
  selectAll.indeterminate=selected.size>0&&!selectAll.checked;
  exportButton.disabled=selected.size===0;exportButton.textContent=`Xuất đã chọn (${selected.size})`;
 };
 selectAll.addEventListener('change',()=>{for(const row of displayed()){if(selectAll.checked)selected.add(row.dataset.studentId);else selected.delete(row.dataset.studentId);}update();});
 exportButton.addEventListener('click',()=>{
  if(!['admin','company_officer'].includes(AppState.role)&&!AppState.role?.startsWith('class_leader_'))return;
  const scoped=new Map(getScopedStudents().map(student=>[student.id,student]));
  const students=displayed().filter(row=>selected.has(row.dataset.studentId)).map(row=>scoped.get(row.dataset.studentId)).filter(Boolean);
  if(!students.length){showToast('Chọn ít nhất một học viên.','error');return;}
  const rows=[['STT','Mã học viên','Họ và tên','Lớp','Cấp bậc','Chức vụ','Ngày sinh'],...students.map((student,index)=>[index+1,String(student.code||''),student.name,student.class,student.rank||'',student.position||student.role||'',normalizeDateVN(student.dob,'')])];
  const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=[8,20,30,14,16,20,18].map(wch=>({wch}));sheet['!reportHeaderRows']=[1];sheet['!reportRepeatRows']=1;
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'Hoc_vien');writeReportWorkbook(workbook,'Học viên đã chọn.xlsx');
 });
 // A redraw/filter replaces rows. Reconcile on the next frame without observing attribute updates.
 let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;update();});}).observe(body,{childList:true,subtree:true});
 window.addEventListener('report-role-change',()=>{selected.clear();update();});update();
}
