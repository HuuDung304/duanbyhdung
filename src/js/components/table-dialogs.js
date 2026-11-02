function installProfileSorting(table) {
 const headers=[...(table.tHead?.rows[0]?.cells || [])], collator=new Intl.Collator('vi',{numeric:true,sensitivity:'base'});
 let sorting=false;
 const body=table.tBodies[0];
 if(body)new MutationObserver(()=>{if(!sorting)headers.forEach(item=>item.removeAttribute('aria-sort'));}).observe(body,{childList:true});
 for(const index of [1,2,3,4]) {
  const header=headers[index];if(!header || header.dataset.sortReady)return;
  header.dataset.sortReady='true';const title=header.textContent.trim(),button=document.createElement('button');
  button.type='button';button.className='table-sort-button';button.textContent=title+' ↕';button.setAttribute('aria-label',`Sắp xếp theo ${title}`);
  header.replaceChildren(button);
  button.addEventListener('click',()=>{
   const ascending=header.getAttribute('aria-sort')!=='ascending';
   headers.forEach(item=>item.removeAttribute('aria-sort'));header.setAttribute('aria-sort',ascending?'ascending':'descending');
   const rows=[...body.rows].filter(row=>row.cells.length>index && row.cells[0].colSpan===1);
   rows.sort((a,b)=>(ascending?1:-1)*collator.compare(a.cells[index].textContent.trim(),b.cells[index].textContent.trim()));
   sorting=true;
   rows.forEach((row,i)=>{row.cells[0].textContent=String(i+1);body.append(row);});
   queueMicrotask(()=>{sorting=false;});
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
}

// Initialize controls for the tables displayed directly on each page.
export function mountTableControls() {
 // These data workspaces show their existing tables and filters directly on the page.
 installYearButtons(document.getElementById('sheetSemesterSelect'));
 installYearButtons(document.getElementById('masterFilterSemester'));
 for(const id of ['cumulFilterYear','cumulFilterRank','cumulFilterDebt']) {const input=document.getElementById(id);if(input?.parentElement)input.parentElement.hidden=true;}
 const profileTable=document.getElementById('profilesTableBody')?.closest('table');
 if(profileTable)installProfileSorting(profileTable);
}
