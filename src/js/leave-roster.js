import {AppState,DEFAULT_CLASSES,getScopedStudents,showToast} from './grades.js';
import {writeReportWorkbook} from './report-workbook.js';
const key=value=>String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const north='Hà Tĩnh,Nghệ An,Thanh Hóa,Ninh Bình,Nam Định,Hà Nam,Hà Nội,Hải Phòng,Hải Dương,Hưng Yên,Thái Bình,Bắc Ninh,Bắc Giang,Phú Thọ,Vĩnh Phúc,Hòa Bình,Tuyên Quang,Hà Giang,Lào Cai,Yên Bái,Lai Châu,Điện Biên,Sơn La,Cao Bằng,Bắc Kạn,Thái Nguyên,Lạng Sơn,Quảng Ninh'.split(',').map(key);
const south='Quảng Trị,Quảng Bình,Huế,Thừa Thiên Huế,Đà Nẵng,Quảng Nam,Quảng Ngãi,Bình Định,Gia Lai,Kon Tum,Đắk Lắk,Đắk Nông,Lâm Đồng,Khánh Hòa,Phú Yên,Ninh Thuận,Bình Thuận,Bình Phước,Bình Dương,Đồng Nai,Tây Ninh,Long An,Hồ Chí Minh,TPHCM,Bà Rịa Vũng Tàu,Tiền Giang,Bến Tre,Trà Vinh,Vĩnh Long,Đồng Tháp,An Giang,Kiên Giang,Cần Thơ,Hậu Giang,Sóc Trăng,Bạc Liêu,Cà Mau'.split(',').map(key);
export function hometownRegion(value){
 const text=' '+key(value)+' ';
 // Prefer the last province match (province usually follows district/commune).
 const matches=[...north.map(name=>({name,region:'north'})),...south.map(name=>({name,region:'south'}))].map(item=>({...item,index:text.lastIndexOf(' '+item.name+' ')})).filter(item=>item.index>=0).sort((a,b)=>b.index-a.index||b.name.length-a.name.length);
 return matches[0]?.region||'';
}
export function leaveTime(value){
 const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
 if(!match)throw new Error('Nhập đầy đủ ngày và giờ về/lên.');
 const [,year,month,day,hour,minute]=match;
 const date=new Date(Number(year),Number(month)-1,Number(day),Number(hour),Number(minute));
 if(date.getFullYear()!==Number(year)||date.getMonth()!==Number(month)-1||date.getDate()!==Number(day)||Number(hour)>23||Number(minute)>59)throw new Error('Ngày giờ không hợp lệ.');
 return `${hour} giờ ${minute} ngày ${Number(day)} tháng ${Number(month)} năm ${year}`;
}
export function leaveRows(students,regions,depart,returning){
 const names={OTQS1:'Ô tô quân sự 1',OTQS2:'Ô tô quân sự 2',TTG1:'Tăng thiết giáp 1',TTG2:'Tăng thiết giáp 2',XMCB:'Xe máy công binh'};
 const result={north:[],south:[]};
 for(const s of [...students].sort((a,b)=>DEFAULT_CLASSES.indexOf(a.class)-DEFAULT_CLASSES.indexOf(b.class)||String(a.code).localeCompare(String(b.code),'vi'))){
  const region=regions[s.id]||hometownRegion(s.hometown);
  if(!Object.hasOwn(result,region))throw new Error(`Chưa xác định miền của ${s.name} (${s.code}).`);
  result[region].push([s.name,s.rank||'',s.position||s.role||'Học viên',`Lớp ${names[s.class]||s.class}, Đại đội 460, Tiểu đoàn 4`,s.hometown||'',depart,returning]);
 }
 return result;
}
export function mountLeaveRoster(){
 const buttons=[...document.querySelectorAll('[data-leave-region]')],button=buttons[0],dialog=document.getElementById('leaveRosterDialog'),form=document.getElementById('leaveRosterForm'),list=document.getElementById('leaveRegionList');
 if(!button||button.dataset.mounted)return;button.dataset.mounted='true';let students=[],identity='',selectedRegion='north';
 const allowed=()=>['admin','company_officer'].includes(AppState.role)||AppState.role?.startsWith('class_leader_');
 const currentIdentity=()=>JSON.stringify([AppState.role,AppState.currentUser?.code,AppState.currentUser?.studentId]);
 for(const option of buttons) option.addEventListener('click',()=>{
  if(!allowed())return;selectedRegion=option.dataset.leaveRegion;
  document.getElementById('leaveRosterTitle').textContent=`Danh sách tranh thủ miền ${selectedRegion==='north'?'Bắc':'Nam'}`;
  students=getScopedStudents().filter(s=>!hometownRegion(s.hometown)||hometownRegion(s.hometown)===selectedRegion);identity=currentIdentity();list.replaceChildren();
  for(const s of students){
   const label=document.createElement('label');label.textContent=`${s.name} (${s.code}) — ${s.hometown||'Chưa có quê quán'} `;
   const select=document.createElement('select');select.dataset.student=s.id;select.required=true;select.setAttribute('aria-label',`Miền của ${s.code}`);
   for(const [value,text]of [['','Chọn miền'],['north','Miền Bắc'],['south','Miền Nam']])select.add(new Option(text,value));select.value=hometownRegion(s.hometown);label.append(select);list.append(label);
  }
  dialog.showModal();
 });
 document.getElementById('leaveRosterCancel').addEventListener('click',()=>dialog.close());
 window.addEventListener('report-role-change',()=>dialog.close());
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!allowed()||identity!==currentIdentity()||!form.reportValidity())return;
  try{
   if(!students.length)throw new Error('Phạm vi tài khoản chưa có học viên.');
   const departInput=document.getElementById('leaveDeparture').value,returnInput=document.getElementById('leaveReturn').value;
   const depart=leaveTime(departInput),returning=leaveTime(returnInput);
   if(returnInput<=departInput)throw new Error('Thời gian lên phải sau thời gian về.');
   const regions=Object.fromEntries([...list.querySelectorAll('select')].map(select=>[select.dataset.student,select.value]));
   const groups=leaveRows(students,regions,depart,returning),book=XLSX.utils.book_new();
   for(const [region,name]of [[selectedRegion,selectedRegion==='north'?'Miền Bắc':'Miền Nam']]){
    const sheet=XLSX.utils.aoa_to_sheet([['TEN','CAP_BAC','CHUC_VU','DON_VI','QUE_QUAN','NGAY_VE','NGAY_LEN'],...groups[region]]);sheet['!cols']=[28,15,20,55,55,42,42].map(wch=>({wch}));sheet['!reportHeaderRows']=[1];sheet['!reportRepeatRows']=1;XLSX.utils.book_append_sheet(book,sheet,name);
   }
   writeReportWorkbook(book,`Danh sách tranh thủ miền ${selectedRegion==='north'?'Bắc':'Nam'}.xlsx`);dialog.close();
  }catch(error){showToast(error.message,'error');}
 });
}
