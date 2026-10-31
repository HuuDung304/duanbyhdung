import { escapeHTML as esc, sanitizeHTML } from '../safe-html.js';
export const hasCadetScore = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
export const cadetScoreFails = value => hasCadetScore(value) && Number(value) < 4;
export function canEditCadetGrade(state, student, subject) {
  if (!student || !subject) return false;
  if (state.role === 'admin') return true;
  if (state.role !== 'class_leader_' + student.class) return false;
  return !state.locks?.[`${student.class}_year_${Math.ceil(Number(subject.semester) / 2)}`];
}
export async function saveCadetGrade({state,studentId,subjectId,rawValue,subjects,upsert,remove,isCurrentSession=()=>true}) {
  const student=state.students.find(s=>s.id===studentId),subject=subjects.find(s=>s.id===subjectId);
  if(!canEditCadetGrade(state,student,subject))throw new Error('Không có quyền sửa điểm hoặc năm học đã khóa sổ.');
  const raw=String(rawValue).trim().replace(',','.');
  const value=raw===''?null:Math.round(Number(raw)*100)/100;
  if(value!==null&&(!Number.isFinite(Number(raw))||Number(raw)<0||Number(raw)>10))throw new Error('Nhập điểm từ 0 đến 10 hoặc để trống để xóa điểm.');
  const previous=state.grades[studentId]?.[subjectId];
  if((value===null&&!hasCadetScore(previous))||(value!==null&&hasCadetScore(previous)&&Number(previous)===value))return{changed:false,value,previous};
  const result=value===null?await remove(studentId,subjectId):await upsert(studentId,subjectId,value);
  if(!result||result.error)throw new Error(result?.error?.message||'Chưa xác nhận lưu điểm. Kiểm tra kết nối rồi thử lại.');
  if(!isCurrentSession())return{changed:false,sessionChanged:true,value,previous};
  if(!state.grades[studentId])state.grades[studentId]={};
  if(value===null)delete state.grades[studentId][subjectId];else state.grades[studentId][subjectId]=value;
  return{changed:true,value,previous};
}

export function mountCadetResults(root,{state,studentId,subjectsForClass,fullSubjectName,semesterGPA,academicYearGPA,courseGPA,creditsPassed,totalCredits,upsert,remove,onSaved,notify}) {
  const abort=new AbortController();let catalogKey='';
  const identity=()=>JSON.stringify([state.role,state.currentUser?.studentId,state.currentUser?.code]);
  const current=()=>state.students.find(s=>s.id===studentId);
  const scoreText=value=>hasCadetScore(value)?Number(value).toFixed(2):'';
  const format=value=>Number(value).toFixed(2).replace('.',',');
  function courses(){const student=current();return student?subjectsForClass(student.class):[];}
  function metrics(){
    root.querySelectorAll('[data-cadet-semester-gpa]').forEach(el=>{el.textContent=format(semesterGPA(studentId,Number(el.dataset.cadetSemesterGpa)));});
    root.querySelectorAll('[data-cadet-year-gpa]').forEach(el=>{el.textContent=format(academicYearGPA(studentId,Number(el.dataset.cadetYearGpa)));});
    const student=current();
    if(root.querySelector('[data-cadet-overall]'))root.querySelector('[data-cadet-overall]').textContent=format(courseGPA(studentId));
    if(student&&root.querySelector('[data-cadet-credits]'))root.querySelector('[data-cadet-credits]').textContent=`${creditsPassed(studentId)}/${totalCredits(student.class)} TC`;
  }
  function refresh(){
    if(!root.isConnected||state.viewingDetailStudentId!==studentId)return;
    const student=current();if(!student)return;
    const subjects=courses(),key=JSON.stringify(subjects.map(s=>[s.id,s.semester,s.credits,s.name]));
    if(key!==catalogKey&&!root.querySelector('[data-cadet-score]:focus,[data-saving="true"]')){render();return;}
    root.querySelectorAll('[data-cadet-course]').forEach(card=>{
      const subject=subjects.find(s=>s.id===card.dataset.cadetCourse),value=state.grades[studentId]?.[card.dataset.cadetCourse];
      card.classList.toggle('is-failed',cadetScoreFails(value));
      const input=card.querySelector('[data-cadet-score]');
      if(input&&document.activeElement!==input&&input.dataset.saving!=='true'){input.value=scoreText(value);input.readOnly=!canEditCadetGrade(state,student,subject);}
      const result=card.querySelector('[data-cadet-readonly-score]');if(result)result.textContent=hasCadetScore(value)?format(value):'—';
      const label=card.querySelector('[data-cadet-result]');if(label)label.textContent=!hasCadetScore(value)?'Chưa có điểm':cadetScoreFails(value)?'Rớt môn':'Đạt';
    });metrics();
  }
  function render(){
    const student=current();if(!student)return;
    const subjects=courses(),grades=state.grades[studentId]||{},opened=new Set([...root.querySelectorAll('details[open]')].map(el=>el.dataset.cadetYear));
    const first=!catalogKey;catalogKey=JSON.stringify(subjects.map(s=>[s.id,s.semester,s.credits,s.name]));
    const term=semester=>{
      const selected=subjects.filter(s=>Number(s.semester)===semester);
      return `<div class="cadet-semester"><div class="cadet-semester-heading"><h5>Học kỳ ${semester%2?1:2} <small>· Kỳ ${semester}</small></h5><span>ĐTB <strong data-cadet-semester-gpa="${semester}"></strong></span></div><div class="cadet-course-grid">${selected.map(subject=>{
        const score=grades[subject.id],editable=canEditCadetGrade(state,student,subject);
        return `<article class="cadet-course ${cadetScoreFails(score)?'is-failed':''}" data-cadet-course="${esc(subject.id)}"><div class="cadet-course-info"><small>${esc(subject.code||'')} · ${Number(subject.credits)||0} TC</small><h6>${esc(fullSubjectName(subject))}</h6><span data-cadet-result>${!hasCadetScore(score)?'Chưa có điểm':cadetScoreFails(score)?'Rớt môn':'Đạt'}</span></div><div class="cadet-course-mark">${editable?`<input type="text" inputmode="decimal" data-cadet-score data-subject="${esc(subject.id)}" aria-label="Điểm ${esc(fullSubjectName(subject))}" placeholder="—" value="${scoreText(score)}" maxlength="6">`:`<strong data-cadet-readonly-score>${hasCadetScore(score)?format(score):'—'}</strong>`}<small>/ 10</small></div><p class="cadet-grade-error" role="alert"></p></article>`;
      }).join('')||'<p class="research-muted">Chưa có môn học trong học kỳ này.</p>'}</div></div>`;
    };
    root.innerHTML=sanitizeHTML(`<div class="cadet-results-heading"><h4>3. Kết quả học tập</h4><div><span>Tích lũy <strong data-cadet-overall></strong></span><span data-cadet-credits></span></div></div>${[1,2,3,4,5].map(year=>`<details class="cadet-academic-year" data-cadet-year="${year}" ${first||opened.has(String(year))?'open':''}><summary><span>▾ Năm ${year}</span><span>ĐTB <strong data-cadet-year-gpa="${year}"></strong></span></summary>${term(year*2-1)}${term(year*2)}</details>`).join('')}`);metrics();
  }
  root.addEventListener('change',async event=>{
    const input=event.target.closest('[data-cadet-score]');if(!input||input.dataset.saving==='true')return;
    const card=input.closest('[data-cadet-course]'),error=card.querySelector('[role="alert"]'),old=state.grades[studentId]?.[input.dataset.subject],key=identity();
    input.dataset.saving='true';input.disabled=true;card.setAttribute('aria-busy','true');error.textContent='';
    let saved=null;
    try{saved=await saveCadetGrade({state,studentId,subjectId:input.dataset.subject,rawValue:input.value,subjects:courses(),upsert,remove,isCurrentSession:()=>key===identity()});}
    catch(e){if(root.isConnected&&key===identity()){input.value=scoreText(old);error.textContent=e.message;notify(e.message,'error');}}
    finally{input.dataset.saving='false';input.disabled=false;card.removeAttribute('aria-busy');}
    if(saved&&!saved.sessionChanged){input.value=scoreText(saved.value);refresh();if(saved.changed)onSaved({studentId,subjectId:input.dataset.subject,...saved});}
  },{signal:abort.signal});
  root.addEventListener('keydown',event=>{if(event.target.matches('[data-cadet-score]')&&event.key==='Enter'){event.preventDefault();event.target.blur();}},{signal:abort.signal});
  render();return{refresh,destroy:()=>abort.abort()};
}
