function installProfileSorting(table) {
 const headers=[...(table.tHead?.rows[0]?.cells || [])], collator=new Intl.Collator('vi',{numeric:true,sensitivity:'base'});
 for(const index of [1,2,3,4]) {
  const header=headers[index];if(!header || header.dataset.sortReady)return;
  header.dataset.sortReady='true';const title=header.textContent.trim(),button=document.createElement('button');
  button.type='button';button.className='table-sort-button';button.textContent=title+' ↕';button.setAttribute('aria-label',`Sắp xếp theo ${title}`);
  header.replaceChildren(button);
  button.addEventListener('click',()=>{
   const ascending=header.getAttribute('aria-sort')!=='ascending';
   headers.forEach(item=>item.removeAttribute('aria-sort'));header.setAttribute('aria-sort',ascending?'ascending':'descending');
   const body=table.tBodies[0],rows=[...body.rows].filter(row=>row.cells.length>index && row.cells[0].colSpan===1);
   rows.sort((a,b)=>(ascending?1:-1)*collator.compare(a.cells[index].textContent.trim(),b.cells[index].textContent.trim()));
   rows.forEach((row,i)=>{const number=row.cells[0].querySelector('.profile-row-number');if(number)number.textContent=String(i+1);else row.cells[0].textContent=String(i+1);body.append(row);});
  });
 }
}

function installYearButtons(select) {
 if (!select || select.dataset.yearButtonsMounted) return;
 select.dataset.yearButtonsMounted='true';select.classList.add('table-year-native');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
 const group=document.createElement('div');group.className='table-year-buttons';group.setAttribute('role','group');group.setAttribute('aria-label','Chọn năm học');
 const buttons=Array.from({length:5},(_,i)=>{const button=document.createElement('button');button.type='button';button.textContent=`Năm ${i+1}`;button.dataset.year=String(i+1);button.addEventListener('click',()=>{select.value=button.dataset.year;select.dispatchEvent(new Event('change',{bubbles:true}));sync();});group.append(button);return button;});
 const sync=()=>buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.year===select.value)));
 select.addEventListener('change',sync);select.after(group);sync();
 group.syncYearButtons=sync;
}

// Move the existing table card into a modal, retaining its nodes and event handlers.
export function mountTableDialogs() {
 const configs=[['tab-sheet','spreadsheetTable','Bảng điểm'],['tab-profiles','profilesTableBody','Hồ sơ quân nhân'],['tab-cumulative','cumulativeTableBody','Tiếng Nga · Tích lũy'],['tab-master','masterTableBody','Toàn đại đội']];
 for(const [sectionId,targetId,title] of configs){
  const section=document.getElementById(sectionId),target=document.getElementById(targetId);
  const table=target?.matches('table')?target:target?.closest('table');
  const card=table?.parentElement?.parentElement;
  if(!section||!card||card.dataset.tableDialogMounted)continue;
  card.dataset.tableDialogMounted='true';
  if(sectionId==='tab-profiles')installProfileSorting(table);
  const launcher=document.createElement('button');launcher.type='button';launcher.className='table-dialog-launcher';
  launcher.innerHTML=`<span><strong></strong><small>Nhấn để mở bảng và xem dữ liệu</small></span><span aria-hidden="true">↗</span>`;
  launcher.querySelector('strong').textContent=title;
  const dialog=document.createElement('dialog');dialog.className='table-dialog';dialog.setAttribute('aria-label',title);
  const heading=document.createElement('div');heading.className='table-dialog-heading';
  const label=document.createElement('h2');label.textContent=title;
  const close=document.createElement('button');close.type='button';close.className='table-dialog-close';close.textContent='Đóng';close.setAttribute('aria-label',`Đóng ${title}`);
  const actions=document.createElement('div');actions.className='table-dialog-actions';
  const reset=document.createElement('button');reset.type='button';reset.className='table-dialog-reset';reset.textContent='Xóa bộ lọc';
  if(['tab-sheet','tab-cumulative','tab-master'].includes(sectionId))actions.append(reset);
  actions.append(close);heading.append(label,actions);card.before(launcher,dialog);dialog.append(heading,card);
  const filters={ 'tab-sheet':['sheetClassSelect','sheetSemesterSelect','sheetSearchInput'], 'tab-cumulative':['cumulFilterClass','cumulSearchInput'], 'tab-master':['masterFilterClass','masterFilterSemester','masterFilterRank','masterFilterDebt','masterSearch'] };
  reset.addEventListener('click',()=>{
   for(const id of filters[sectionId]||[]) {
    const input=document.getElementById(id);if(!input||input.disabled)continue;
    if(input.tagName==='SELECT')input.value=[...input.options].some(option=>option.value==='all')?'all':'1';else input.value='';
    input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));
   }
   dialog.querySelector('.table-year-buttons')?.syncYearButtons?.();
  });
  let toolbar=null, placeholder=null;
  if(sectionId==='tab-sheet'||sectionId==='tab-master') {
   const selector=sectionId==='tab-sheet'?'#sheetClassSelect':'#masterFilterClass';
   const input=section.querySelector(selector);
   toolbar=sectionId==='tab-sheet'?input?.closest('.sheet-filter-controls')?.parentElement:input?.closest('.space-y-3');
   if(toolbar){placeholder=document.createComment('Vị trí bộ lọc');toolbar.before(placeholder);toolbar.classList.add('table-dialog-controls');dialog.insertBefore(toolbar,card);}
   const search=document.getElementById(sectionId==='tab-sheet'?'sheetSearchInput':'masterSearch');
   const classBox=input?.closest(sectionId==='tab-sheet'?'#sheetClassSelectBox':'div');
   const searchBox=search?.closest(sectionId==='tab-sheet'?'#sheetSearchBox':'div');
   if(classBox&&searchBox)classBox.after(searchBox);
   installYearButtons(document.getElementById(sectionId==='tab-sheet'?'sheetSemesterSelect':'masterFilterSemester'));
  }
  if(sectionId==='tab-cumulative') {
   const classInput=document.getElementById('cumulFilterClass'),search=document.getElementById('cumulSearchInput');
   const oldToolbar=classInput?.closest('.space-y-3');
   if(classInput&&search){const controls=document.createElement('div');controls.className='table-dialog-controls table-dialog-simple';controls.append(classInput.parentElement,search.parentElement);dialog.insertBefore(controls,card);}
   // The language standard is configuration, not a table filter; keep it reachable for Admin.
   const standard=oldToolbar?.querySelector('.required-lang-standard-select')?.closest('.p-3');
   if(standard)oldToolbar.before(standard);
   if(oldToolbar)oldToolbar.hidden=true;
   for(const id of ['cumulFilterYear','cumulFilterRank','cumulFilterDebt']) {const input=document.getElementById(id);if(input?.parentElement)input.parentElement.hidden=true;}
  }
  const syncToolbar=()=>{if(!toolbar||sectionId!=='tab-sheet')return;if(window.AppState?.role==='student')placeholder.after(toolbar);else dialog.insertBefore(toolbar,card);};
  window.addEventListener('report-role-change',syncToolbar);syncToolbar();
  launcher.addEventListener('click',()=>{dialog.showModal();dialog.querySelector('.table-year-buttons')?.syncYearButtons?.();});close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();else if(event.target.closest('.btn-view-cadet-detail,.btn-open-transcript,.btn-open-profile'))dialog.close();});
  dialog.addEventListener('close',()=>{if(launcher.isConnected&&!launcher.hidden)launcher.focus({preventScroll:true});});
  const sync=()=>{const unavailable=card.classList.contains('hidden')||card.style.display==='none';launcher.hidden=unavailable;if(dialog.open&&(unavailable||!section.classList.contains('active')))dialog.close();};
  new MutationObserver(sync).observe(card,{attributes:true,attributeFilter:['class','style','hidden']});
  new MutationObserver(sync).observe(section,{attributes:true,attributeFilter:['class','style','hidden']});sync();
 }
}
