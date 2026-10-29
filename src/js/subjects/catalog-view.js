// Scope and semester are explicit; render controls without mutating curriculum or grades.
const node=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
export function renderSubjectCatalog(context){
  const {state,scope,classes,getSubjects,getName,getClasses,hasGrades,refresh}=context;
  const section=document.getElementById('tab-settings');if(!section)return;
  section.classList.add('subject-catalog');
  const visibleClasses=scope?[scope]:classes;
  if(!visibleClasses.includes(state.settingsSelectedClass))state.settingsSelectedClass=scope||'all';
  const selected=scope||state.settingsSelectedClass||'all';
  let filter=document.getElementById('subjectCatalogClass');
  if(!filter){
    const controls=node('div','subject-catalog-filter');const label=node('label','','Xem danh mục của lớp');
    filter=node('select');filter.id='subjectCatalogClass';label.htmlFor=filter.id;controls.append(label,filter);section.querySelector('.settings-intro').after(controls);
    filter.addEventListener('change',()=>{state.settingsSelectedClass=filter.value;refresh();});
  }
  filter.replaceChildren(...(scope?[scope]:['all',...classes]).map(cls=>new Option(cls==='all'?'Tất cả lớp':cls,cls)));filter.value=selected;filter.disabled=Boolean(scope);
  const summaries=document.getElementById('settingsClassSummaries');
  if(summaries){summaries.replaceChildren(...visibleClasses.map(cls=>{
    const subjects=getSubjects(cls);const card=node('button','settings-class-card');card.type='button';card.setAttribute('aria-pressed',String(selected===cls));
    card.append(node('h4','',cls),node('strong','',`${subjects.length} môn`),node('p','',`${subjects.reduce((sum,sub)=>sum+Number(sub.credits||0),0)} tín chỉ`));
    card.addEventListener('click',()=>{state.settingsSelectedClass=cls;refresh();});return card;
  }));}
  const visible=selected==='all'?state.subjects:getSubjects(selected),year=Number(state.settingsSelectedYear)||1;
  const years=document.getElementById('settingsYearTabsContainer');
  if(years){years.replaceChildren(...[1,2,3,4,5].map(y=>{
    const button=node('button','btn-setting-year-tab catalog-year-button');button.type='button';button.dataset.year=y;button.setAttribute('aria-pressed',String(year===y));
    button.append(node('strong','',`Năm ${y}`),node('small','',`HK${y*2-1} · HK${y*2}`));return button;
  }));}
  const container=document.getElementById('settingsSemestersContainer');if(!container)return;
  container.replaceChildren(...[year*2-1,year*2].map(semester=>{
    const subjects=visible.filter(sub=>Number(sub.semester)===semester);
    const card=node('article','catalog-semester');const heading=node('div','catalog-semester-heading');const title=node('div');
    title.append(node('h3','',`Học kỳ ${semester}`),node('small','',`${subjects.length} môn · ${subjects.reduce((sum,sub)=>sum+Number(sub.credits||0),0)} tín chỉ`));heading.append(title);
    if(state.role==='admin'||scope){
      const actions=node('div','catalog-semester-actions');
      for(const [text,category]of state.role==='admin'?[['Thêm cho cả 5 lớp','common'],['Thêm theo lớp','specialized']]:[[`Thêm môn cho ${scope}`,'specialized']]){
        const button=node('button','btn-add-to-sem',text);button.type='button';button.dataset.sem=semester;button.dataset.cat=category;actions.append(button);
      }
      heading.append(actions);
    }
    const scroll=node('div','catalog-table-scroll');const table=node('table');const head=node('thead'),labels=node('tr');
    for(const text of ['Tên môn trên thời khóa biểu','Lớp học','Tín chỉ','Dữ liệu điểm','Thao tác']){const th=node('th','',text);th.scope='col';labels.append(th);}
    head.append(labels);const body=node('tbody');
    for(const subject of subjects){
      const row=node('tr');row.dataset.subjectId=subject.id;
      const name=node('td','catalog-subject-name');name.append(node('strong','',getName(subject)),node('small','',subject.code));row.append(name);
      const targets=getClasses(subject),graded=hasGrades(state.grades,subject.id);
      row.append(node('td','',targets.length===classes.length?'Cả 5 lớp':targets.join(', ')),node('td','catalog-credits',subject.credits),node('td',graded?'catalog-has-grades':'',graded?'Đã có điểm':'Chưa có điểm'));
      const action=node('td');
      if(state.role==='admin'||scope&&targets.length===1&&targets[0]===scope){const edit=node('button','btn-edit-subj','Sửa');edit.type='button';edit.dataset.id=subject.id;edit.setAttribute('aria-label',`Sửa ${getName(subject)}, học kỳ ${semester}`);action.append(edit);}
      else action.textContent=scope&&targets.length>1?'Admin quản lý':'Chỉ xem';
      row.append(action);body.append(row);
    }
    if(!subjects.length){const row=node('tr'),cell=node('td','catalog-empty','Chưa có môn học trong học kỳ này');cell.colSpan=5;row.append(cell);body.append(row);}
    table.append(head,body);scroll.append(table);card.append(heading,scroll);return card;
  }));
}
