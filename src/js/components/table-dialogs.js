// Move the existing table card into a modal, retaining its nodes and event handlers.
export function mountTableDialogs() {
 const configs=[['tab-sheet','spreadsheetTable','Bảng điểm'],['tab-profiles','profilesTableBody','Hồ sơ quân nhân'],['tab-cumulative','cumulativeTableBody','Tiếng Nga · Tích lũy'],['tab-master','masterTableBody','Toàn đại đội']];
 for(const [sectionId,targetId,title] of configs){
  const section=document.getElementById(sectionId),target=document.getElementById(targetId);
  const table=target?.matches('table')?target:target?.closest('table');
  const card=table?.parentElement?.parentElement;
  if(!section||!card||card.dataset.tableDialogMounted)continue;
  card.dataset.tableDialogMounted='true';
  const launcher=document.createElement('button');launcher.type='button';launcher.className='table-dialog-launcher';
  launcher.innerHTML=`<span><strong></strong><small>Nhấn để mở bảng và xem dữ liệu</small></span><span aria-hidden="true">↗</span>`;
  launcher.querySelector('strong').textContent=title;
  const dialog=document.createElement('dialog');dialog.className='table-dialog';dialog.setAttribute('aria-label',title);
  const heading=document.createElement('div');heading.className='table-dialog-heading';
  const label=document.createElement('h2');label.textContent=title;
  const close=document.createElement('button');close.type='button';close.className='table-dialog-close';close.textContent='Đóng';close.setAttribute('aria-label',`Đóng ${title}`);
  heading.append(label,close);card.before(launcher,dialog);dialog.append(heading,card);
  launcher.addEventListener('click',()=>dialog.showModal());close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();else if(event.target.closest('.btn-view-cadet-detail,.btn-open-transcript,.btn-open-profile'))dialog.close();});
  dialog.addEventListener('close',()=>{if(launcher.isConnected&&!launcher.hidden)launcher.focus({preventScroll:true});});
  const sync=()=>{const unavailable=card.classList.contains('hidden')||card.style.display==='none';launcher.hidden=unavailable;if(dialog.open&&(unavailable||!section.classList.contains('active')))dialog.close();};
  new MutationObserver(sync).observe(card,{attributes:true,attributeFilter:['class','style','hidden']});
  new MutationObserver(sync).observe(section,{attributes:true,attributeFilter:['class','style','hidden']});sync();
 }
}
