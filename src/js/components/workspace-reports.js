import { mountThemeSettings } from './theme-settings.js';
import './readability.js';
import './report-center.js';
import { AppState, DEFAULT_CLASSES, getScopedStudents, getCurrentUserClassScope, evaluateLangLevelStatus, formatVN, registerExternalHooks, renderDashboard } from '../grades.js';
import { collectLanguageStatistics } from '../dashboard-statistics.js';
const $ = id => document.getElementById(id);
const make = (tag, className, text) => { const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e; };
const main = document.querySelector('.u040-content');
const dashboard = $('tab-dashboard');
if (main && dashboard) {
  document.body.classList.add('workspace-reports');
  const subjectLink=document.querySelector('.u040-it[data-tab="tab-settings"] span');
  if(subjectLink)subjectLink.textContent='Môn học';
  const preferences=make('section','tab-content hidden space-y-4');preferences.id='tab-preferences';
  preferences.append(make('h2','workspace-page-title','Cài đặt'));
  mountThemeSettings(preferences);
  const cloud=make('article','workspace-settings-card unit-settings-only');
  cloud.hidden=AppState.role==='student'||AppState.role==='guest';
  cloud.append(make('h3','','Đồng bộ đám mây & liên kết lớp'));
  const modal=$('modalCloudSync');
  const cloudTabs=modal?.querySelector('.cloud-subtab')?.parentElement;
  const config=$('cloudtab-config')?.parentElement;
  if(cloudTabs){
    cloud.append(cloudTabs);cloudTabs.setAttribute('role','tablist');
    const buttons=[...cloudTabs.querySelectorAll('.cloud-subtab')];
    buttons.forEach((button,index)=>{
      button.textContent=index===0?'Kết nối':'Liên kết lớp';button.setAttribute('role','tab');button.setAttribute('aria-controls',button.dataset.subtab);button.setAttribute('aria-selected',String(index===0));
      button.addEventListener('click',()=>buttons.forEach(item=>{const selected=item===button;item.classList.toggle('active',selected);item.setAttribute('aria-selected',String(selected));$(item.dataset.subtab)?.classList.toggle('hidden',!selected);}));
    });
  }
  if(config)cloud.append(config);
  const manual=cloud.querySelector('#cloudtab-manual');
  if(manual){const label=make('label','','Đường dẫn dùng chung cho các lớp');const link=make('input');link.type='text';link.readOnly=true;link.value=location.href.split(/[?#]/)[0];link.setAttribute('aria-label','Đường dẫn truy cập đơn vị');label.append(link);manual.replaceChildren(label);}
  // Configuration fields and their existing handlers retain their IDs and values.
  preferences.append(cloud);
  const danger=$('settingsDangerZone');if(danger)preferences.append(danger);
  main.append(preferences);
  const settings=make('button','nav-tab account-settings','Cài đặt');settings.type='button';settings.dataset.tab=preferences.id;settings.id='btnAccountSettings';settings.setAttribute('aria-controls',preferences.id);
  new MutationObserver(()=>{if(preferences.classList.contains('active'))settings.setAttribute('aria-current','page');else settings.removeAttribute('aria-current');}).observe(preferences,{attributes:true,attributeFilter:['class']});
  const account=$('sidebarAccountMenu');account?.prepend(settings);
  settings.addEventListener('click',()=>{setTimeout(()=>account.closest('.u037')?.dispatchEvent(new Event('account-menu-close')));});
  // Header remains in the DOM for role/status synchronization, but is no longer displayed.
  document.querySelector('.u040-page-heading')?.setAttribute('hidden','');
  const kpis=dashboard.querySelector(':scope > .grid');
  if(kpis){kpis.id='dashboardKpis';kpis.firstElementChild?.remove();['Học lực tích lũy','Chuẩn Tiếng Nga','Học viên rớt môn'].forEach((label,index)=>{kpis.children[index].firstElementChild.textContent=label;});}
  const directCard=node=>{let e=node;while(e?.parentElement&&e.parentElement!==dashboard)e=e.parentElement;return e?.parentElement===dashboard?e:null;};
  const cards=[directCard($('dashboardLanguageSummary')),directCard($('reportYearSemesterMatrixBody')),directCard($('reportCompanyTableBody')),directCard($('reportDebtCadetsTableBody'))];
  const debtCard=kpis?.lastElementChild;
  const debtValue=$('statDebtCount'),debtFails=$('statDebtTotalFails');
  if(debtCard&&debtValue&&debtFails){
    const oldValues=debtValue.parentElement;
    const values=make('div','workspace-debt-values');
    for(const [value,label]of [[debtValue,'Học viên'],[debtFails,'Lượt rớt']]){const part=make('div');part.append(value,make('span','workspace-stat-label',label));values.append(part);}
    oldValues.replaceWith(values);debtCard.lastElementChild?.remove();
    const rate=make('div');rate.id='statDebtRate';debtCard.append(rate);
  }
  const titles=['Ngoại ngữ','Xếp loại điểm quá trình','Xếp loại điểm tích lũy','Đáng chú ý'];
  const tabs=make('div','workspace-report-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Nội dung báo cáo giao ban');
  const indicator=make('span','workspace-tab-indicator');indicator.setAttribute('aria-hidden','true');tabs.append(indicator);
  const panels=make('div','workspace-report-panels');
  let activeIndex=0;
  const tabButtons=[];
  const panelElements=[];
  cards.forEach((card,index)=>{
    const button=make('button','workspace-report-tab',titles[index]);button.type='button';button.id=`workspace-report-tab-${index}`;
    button.setAttribute('role','tab');button.setAttribute('aria-controls',`workspace-report-panel-${index}`);
    const panel=make('section','workspace-report-panel');panel.id=`workspace-report-panel-${index}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
    if(card){panel.append(card);const heading=card.querySelector('h4,h3');if(heading)heading.textContent=index===0?'Tỷ lệ đạt chuẩn ngoại ngữ':index===3?'Học viên rớt môn':titles[index];}
    if(index>0){const h=card?.querySelector('h4');h?.parentElement.querySelector('p')?.remove();}
    tabs.append(button);panels.append(panel);tabButtons.push(button);panelElements.push(panel);
    button.addEventListener('click',()=>select(index,true));
    button.addEventListener('keydown',event=>{
      let next=index;
      if(event.key==='ArrowRight')next=(index+1)%cards.length;
      else if(event.key==='ArrowLeft')next=(index+cards.length-1)%cards.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=cards.length-1;
      else return;
      event.preventDefault();select(next,true);tabButtons[next].focus();
    });
  });
  function placeIndicator(){const button=tabButtons[activeIndex];indicator.style.width=`${button.offsetWidth}px`;indicator.style.transform=`translateX(${button.offsetLeft}px)`;}
  function select(index,scroll=false){
    activeIndex=index;
    tabButtons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;panelElements[i].hidden=i!==index;});
    placeIndicator();
    if(scroll)tabButtons[index].scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'nearest',inline:'nearest'});
  }
  if(kpis)kpis.after(tabs,panels);else dashboard.append(tabs,panels);
  const missing=make('article','workspace-language-missing');
  const missingHead=make('div','workspace-table-heading');
  const missingTitle=make('div');missingTitle.append(make('h3','','Học viên chưa đạt chuẩn'));
  const count=make('span','workspace-table-count');missingTitle.append(count);
  const scopeLabel=make('label','','Lớp '),scope=make('select');scope.id='languageMissingClass';scope.setAttribute('aria-label','Lớp học viên chưa đạt ngoại ngữ');
  for(const cls of ['all',...DEFAULT_CLASSES])scope.append(new Option(cls==='all'?'Toàn đơn vị':cls,cls));scopeLabel.append(scope);missingHead.append(missingTitle,scopeLabel);
  const scroll=make('div','workspace-table-scroll');const table=make('table');
  const head=document.createElement('thead'),header=document.createElement('tr');
  for(const text of ['STT','Mã học viên','Họ và tên','Ngày sinh','Lớp','Trình độ hiện tại']){const th=make('th','',text);th.scope='col';header.append(th);}
  head.append(header);const rows=document.createElement('tbody');rows.id='languageMissingBody';table.append(head,rows);scroll.append(table);missing.append(missingHead,scroll);panelElements[0].append(missing);
  const ranks=['Chưa đạt','A1','A21','A2','B11','B1'];
  function render(){
    const student=AppState.role==='student'||AppState.role==='guest';settings.hidden=AppState.role==='guest';cloud.hidden=student;
    for(const id of ['cfgUnitRoomId','cfgFirebaseDbUrl','cfgFirebaseApiKey','cfgFirebaseProjectId','btnSaveCloudConfig','btnPushInitialData']){const control=$(id);if(control)control.disabled=AppState.role!=='admin';}
    if(danger)danger.hidden=AppState.role!=='admin';
    rows.replaceChildren();if(student)return;
    const classScope=getCurrentUserClassScope();scope.disabled=Boolean(classScope);if(classScope)scope.value=classScope;
    const selected=classScope||scope.value;
    const standard=evaluateLangLevelStatus('Chưa đạt',AppState.requiredLangStandard).requiredStandard;
    const students=getScopedStudents().filter(s=>selected==='all'||s.class===selected);
    const data=collectLanguageStatistics(students,AppState.languages||{},standard,evaluateLangLevelStatus,DEFAULT_CLASSES).roster.filter(item=>!item.passed)
      .sort((a,b)=>ranks.indexOf(b.level)-ranks.indexOf(a.level)||a.student.name.localeCompare(b.student.name,'vi')||String(a.student.code).localeCompare(String(b.student.code)));
    count.textContent=`Chuẩn ${standard} · ${data.length} học viên`;
    for(const [index,item]of data.entries()){
      const row=document.createElement('tr');
      for(const value of [index+1,item.student.code,item.student.name,formatVN(item.student.dob),item.student.class,item.level])row.append(make('td','',value));
      rows.append(row);
    }
    if(!data.length){const row=make('tr'),cell=make('td','workspace-empty','Không có học viên chưa đạt chuẩn');cell.colSpan=6;row.append(cell);rows.append(row);}
    requestAnimationFrame(placeIndicator);
  }
  scope.addEventListener('change',render);
  window.addEventListener('report-role-change',render);
  registerExternalHooks({renderWorkspaceReports:render});
  new ResizeObserver(placeIndicator).observe(tabs);
  select(0);render();
  if(AppState.role!=='student'&&AppState.role!=='guest')renderDashboard();
}
