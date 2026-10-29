// Curriculum changes are planned without mutating records or their grade references.
export const SUBJECT_CLASSES = ['OTQS1','OTQS2','TTG1','TTG2','XMCB'];
export const subjectTextKey = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/g,' ').toUpperCase();
export function offeringClasses(subject) {
  if (!subject.category || subject.category === 'common' || subject.targetClass === 'all') return [...SUBJECT_CLASSES];
  const values = subject.targetClasses?.length ? subject.targetClasses : String(subject.targetClass || 'OTQS1').split(/[,;\s]+/);
  return [...new Set(values.map(value=>String(value).trim().toUpperCase()).filter(value=>SUBJECT_CLASSES.includes(value)))];
}
export function subjectHasGrades(grades, id) {
  return Object.values(grades || {}).some(scores=>scores && Object.hasOwn(scores,id) && scores[id] !== null && scores[id] !== undefined && String(scores[id]).trim() !== '');
}
export function stableOfferingId({code='',name='',semester=1,category='common',targetClasses=[]}) {
  const key=JSON.stringify([Number(semester),category==='common'?'ALL':[...targetClasses].sort(),subjectTextKey(code),subjectTextKey(name)]);
  let hash=14695981039346656037n;
  for(const char of key){hash^=BigInt(char.codePointAt(0));hash=BigInt.asUintN(64,hash*1099511628211n);}
  return `sub_hk${semester}_${hash.toString(16).padStart(16,'0')}`;
}
export function planOffering({subjects,students,grades,role,classScope=null,editId='',name,code='',semester,credits,classes,createId=()=>crypto.randomUUID()}) {
  if(role!=='admin' && !String(role).startsWith('class_leader_'))throw new Error('Tài khoản không có quyền sửa môn học.');
  const ownClass=String(role).startsWith('class_leader_')?String(role).slice('class_leader_'.length).toUpperCase():null;
  if(ownClass){if(classScope&&String(classScope).toUpperCase()!==ownClass)throw new Error('Không được nhập môn cho lớp khác.');classScope=ownClass;}
  const exactName=String(name || '').trim(), suppliedCode=String(code || '').trim().toUpperCase();
  const sem=Number(semester),tc=Number(credits);
  if(!exactName)throw new Error('Nhập đúng tên môn trên thời khóa biểu.');
  if(!Number.isInteger(sem)||sem<1||sem>10)throw new Error('Học kỳ phải từ 1 đến 10.');
  if(!Number.isInteger(tc)||tc<1||tc>15)throw new Error('Tín chỉ phải từ 1 đến 15.');
  const targets=[...new Set((classScope?[classScope]:classes || []).map(value=>String(value).trim().toUpperCase()))].sort();
  if(!targets.length||targets.some(value=>!SUBJECT_CLASSES.includes(value)))throw new Error('Chọn lớp học môn này.');
  const old=editId?subjects.find(subject=>subject.id===editId):null;
  if(editId&&!old)throw new Error('Môn học không còn trong danh mục. Hãy tải lại dữ liệu.');
  if(classScope&&old&&(offeringClasses(old).length!==1||offeringClasses(old)[0]!==classScope))throw new Error('Môn dùng chung cần Admin chỉnh sửa để không ảnh hưởng lớp khác.');
  if(old&&subjectHasGrades(grades,old.id)){
    if(Number(old.semester)!==sem)throw new Error('Môn đã có điểm: không chuyển học kỳ. Hãy thêm môn ở kỳ mới, giữ môn cũ.');
    const studentsById=new Map(students.map(student=>[student.id,student]));
    for(const [studentId,scores]of Object.entries(grades || {})){
      if(!subjectHasGrades({[studentId]:scores},old.id))continue;
      const student=studentsById.get(studentId);
      if(!student||!targets.includes(student.class))throw new Error('Không thể bỏ lớp đang có điểm của môn này. Điểm cũ phải được giữ nguyên.');
    }
  }
  for(const subject of subjects){
    if(subject.id===editId||Number(subject.semester)!==sem||!offeringClasses(subject).some(cls=>targets.includes(cls)))continue;
    const sameName=subjectTextKey(subject.name || subject.course_name)===subjectTextKey(exactName);
    const sameCode=suppliedCode&&subjectTextKey(subject.code)===subjectTextKey(suppliedCode);
    if(sameCode||(sameName&&(!suppliedCode||!subject.code||sameCode)))throw new Error('Môn đã có trong lớp và học kỳ này. Môn khác nhưng trùng tên phải có mã riêng; không tự gộp môn.');
  }
  const id=old?.id || `sub_${createId()}`;
  if(!old&&subjects.some(subject=>subject.id===id))throw new Error('Mã định danh bị trùng. Hãy thử lại, dữ liệu cũ chưa thay đổi.');
  const common=targets.length===SUBJECT_CLASSES.length;
  return {...old,id,name:exactName,course_name:exactName,code:suppliedCode || old?.code || `MH_${id.replace(/[^a-z0-9]/gi,'').slice(-12).toUpperCase()}`,semester:sem,credits:tc,category:common?'common':'specialized',targetClasses:common?[]:targets,targetClass:common?'all':targets.join(', ')};
}
