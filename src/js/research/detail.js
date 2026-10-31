import { escapeHTML as esc, sanitizeHTML } from '../safe-html.js';
import { canView, canEdit, canAward, participants, AWARDS, normalizeAwards, codeKey } from './model.js';
import { createResearchPeoplePicker } from './people-picker.js';

export function mountResearchDetail({ state, getProjects, save, onSaved, formatInformation }) {
  const $ = id => document.getElementById(id), view = $('researchDetailView'), list = $('researchListView'), dialog = $('researchFieldDialog');
  let activeId = null, edit = null, picker = null, saving = false, editGeneration = 0;
  const names = { projectCode:'Mã đề tài', title:'Tên đề tài', information:'Thông tin đề tài', leaderId:'Chủ đề tài', participants:'Học viên thực hiện', advisors:'Cán bộ hướng dẫn', awards:'Giải thưởng' };
  const html = (node, content) => { node.innerHTML = sanitizeHTML(content); };
  const infoText = project => [project.information, ...[['Mục tiêu',project.objective],['Nội dung nghiên cứu',project.content],['Sản phẩm dự kiến',project.product]].filter(([,v])=>v).map(([k,v])=>k+': '+v)].filter(Boolean).join('\n\n');
  function allowed(project, field) { return field === 'awards' ? canAward(project,state) : canEdit(project,state) && (field !== 'leaderId' || state.role !== 'student'); }
  function reset(focus = false) {
    const previousId = activeId; editGeneration++; activeId = null; edit = null; picker?.destroy(); picker = null;
    if (dialog.open) dialog.close();
    view.hidden = true; list.hidden = false;
    if (focus) [...list.querySelectorAll('[data-research-action="open"]')].find(el=>el.dataset.projectId===previousId)?.focus();
  }
  function render() {
    if (!activeId || dialog.open) return;
    const project = getProjects().find(p => p.id === activeId);
    if (!project || !canView(project,state)) { reset(); return; }
    const open = new Set([...view.querySelectorAll('details[open]')].map(d=>d.dataset.researchSection));
    const members = participants(project,state.students), leader = members.find(s=>s.studentId===project.leaderId);
    const people = values => values.map(s=>`<div class="research-detail-person"><strong>${esc(s.name || s.code)}</strong><span>${esc(s.code || '')} · ${esc(s.class || '')}${s.studentId===project.leaderId?' · Chủ đề tài':''}</span></div>`).join('');
    const bodies = {
      projectCode:esc(project.projectCode || project.id), title:esc(project.title),
      information:formatInformation(infoText(project) || 'Chưa cập nhật'),
      leaderId:leader ? people([leader]) : 'Chưa cập nhật', participants:people(members),
      advisors:(project.advisors || []).map(a=>`<div class="research-detail-person"><strong>${esc(a.name)}</strong><span>${esc(a.unit || '—')}</span></div>`).join('') || 'Chưa cập nhật',
      awards:normalizeAwards(project.awards || []).map(a=>`<span class="research-award">${esc(a)}</span>`).join('') || 'Chưa có'
    };
    html(view, `<button type="button" id="researchDetailBack" class="research-btn">← Danh sách đề tài</button><header class="research-detail-heading"><small>${esc(project.projectCode || project.id)}</small><h2>${esc(project.title)}</h2></header><div class="research-detail-sections">${Object.entries(names).map(([field,label])=>`<details data-research-section="${field}" ${open.has(field)?'open':''}><summary><span class="research-detail-arrow" aria-hidden="true">▾</span><span>${label}</span></summary><div class="research-detail-body"><div class="research-detail-value">${bodies[field]}</div>${field==='information'?`<p class="research-form-note">Năm học ${project.year}</p>`:''}${allowed(project,field)?`<button type="button" class="research-btn research-section-edit" data-research-field="${field}" aria-label="Chỉnh sửa ${label}">Chỉnh sửa</button>`:''}</div></details>`).join('')}${project.notes?`<details data-research-section="notes" ${open.has('notes')?'open':''}><summary><span class="research-detail-arrow" aria-hidden="true">▾</span>Ghi chú</summary><div class="research-detail-body"><div class="research-detail-value">${esc(project.notes)}</div></div></details>`:''}</div>`);
    list.hidden = true; view.hidden = false;
  }
  function open(project) {
    if (!project || !canView(project,state)) return;
    activeId = project.id; view.replaceChildren(); render(); window.scrollTo({top:0,behavior:'instant'});
    view.querySelector('h2')?.setAttribute('tabindex','-1'); view.querySelector('h2')?.focus({preventScroll:true});
  }
  function editField(field) {
    const project = getProjects().find(p=>p.id===activeId);
    if (!project || !allowed(project,field)) return;
    picker?.destroy(); editGeneration++; edit = { project:structuredClone(project), field };
    $('researchFieldTitle').textContent = 'Chỉnh sửa ' + names[field].toLocaleLowerCase('vi');
    $('researchFieldError').textContent = '';
    let content = '';
    if (field === 'information') content = `<textarea id="researchFieldText" class="research-long-editor" maxlength="60000" aria-label="Thông tin đề tài">${esc(infoText(project))}</textarea><label>Năm học tính điểm TBNH<select id="researchFieldYear">${[1,2,3,4,5].map(y=>`<option value="${y}" ${y===project.year?'selected':''}>Năm ${y}</option>`).join('')}</select></label>`;
    else if (field === 'advisors') content = `<textarea id="researchFieldText" class="research-long-editor" maxlength="20000" aria-label="Cán bộ hướng dẫn" placeholder="Mỗi dòng: Họ tên | Đơn vị">${esc(project.advisors.map(a=>a.name+' | '+a.unit).join('\n'))}</textarea>`;
    else if (field === 'participants' || field === 'leaderId') content = '<div id="researchFieldPeople"></div>';
    else if (field === 'awards') content = `<div class="research-award-options">${AWARDS.map(a=>`<label><input type="checkbox" data-detail-award value="${esc(a)}" ${normalizeAwards(project.awards).includes(a)?'checked':''}>${esc(a)}</label>`).join('')}</div>`;
    else content = `<input type="text" id="researchFieldText" maxlength="${field==='title'?500:100}" aria-label="${names[field]}" value="${esc(field==='projectCode'?project.projectCode || project.id:project.title)}" ${field==='title'?'required':''}>`;
    html($('researchFieldBody'),content);
    dialog.classList.toggle('research-field-wide',['information','advisors'].includes(field));
    if (field==='participants' || field==='leaderId') picker = createResearchPeoplePicker($('researchFieldPeople'),{getStudents:()=>field==='leaderId'&&state.role?.startsWith('class_leader_')?state.students.filter(s=>s.class===state.role.slice(13)):state.students,initialIds:field==='leaderId'?[project.leaderId]:project.participants.map(p=>p.studentId),leaderId:field==='participants'?project.leaderId:'',single:field==='leaderId'});
    dialog.showModal(); dialog.querySelector('textarea,input,select')?.focus();
  }
  view.addEventListener('click',event=>{
    if (event.target.closest('#researchDetailBack')) reset(true);
    const button=event.target.closest('[data-research-field]'); if(button)editField(button.dataset.researchField);
  });
  $('researchFieldForm').addEventListener('submit',async event=>{
    event.preventDefault(); if(saving || !edit)return;
    const {project,field}=edit; const token=editGeneration;
    if(!canView(project,state)||!allowed(project,field)){ $('researchFieldError').textContent='Bạn không có quyền sửa mục này.';return; }
    const input={...project,memberIds:project.participants.map(p=>p.studentId)};
    if(field==='information') {input.information=$('researchFieldText').value;input.objective='';input.content='';input.product='';input.year=Number($('researchFieldYear').value);}
    else if(field==='advisors')input.advisors=$('researchFieldText').value.split(/[;\n]+/).filter(v=>v.trim()).map(line=>{const [name,...unit]=line.split('|');return{name,unit:unit.join('|')};});
    else if(field==='participants')input.memberIds=picker.getIds();
    else if(field==='leaderId'){input.leaderId=picker.getIds()[0] || '';input.memberIds=[...new Set([input.leaderId,...input.memberIds])];}
    else if(field==='awards')input.awards=[...dialog.querySelectorAll('[data-detail-award]:checked')].map(el=>el.value);
    else input[field]=$('researchFieldText').value.trim();
    if(field==='projectCode'&&getProjects().some(p=>p.id!==project.id&&codeKey(p.projectCode||p.id)===codeKey(input.projectCode))){$('researchFieldError').textContent='Mã đề tài đã được sử dụng.';return;}
    saving=true;$('researchFieldSave').disabled=true;$('researchFieldSave').setAttribute('aria-busy','true');$('researchFieldError').textContent='';
    try{await save(input,project);if(token!==editGeneration)return;dialog.close();edit=null;render();onSaved();}
    catch(error){if(token===editGeneration)$('researchFieldError').textContent=error.message;}
    finally{saving=false;$('researchFieldSave').disabled=false;$('researchFieldSave').removeAttribute('aria-busy');}
  });
  dialog.querySelectorAll('[data-research-field-close]').forEach(button=>button.addEventListener('click',()=>{if(!saving)dialog.close();}));
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>{if(dialog.open)return;edit=null;picker?.destroy();picker=null;});
  return {open,render,reset,get active(){return activeId;}};
}
