// Lucian UX/UI Prompt #037 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#037
/** Enhance existing account nodes: delegated application handlers keep their IDs. */
export function mountAccountMenu(profile, logout) {
  if (!profile || profile.classList.contains('u037')) return;
  profile.classList.add('u037');
  const chip = document.createElement('button');
  chip.type = 'button'; chip.className = 'sidebar-account-trigger u037-chip';
  chip.setAttribute('aria-label', 'Mở menu tài khoản');
  chip.setAttribute('aria-haspopup', 'menu'); chip.setAttribute('aria-expanded', 'false');
  chip.setAttribute('aria-controls', 'sidebarAccountMenu');
  chip.append(...profile.childNodes);
  const avatar=chip.querySelector('i');avatar?.classList.add('u037-ws');
  const title=chip.querySelector('b');
  const syncAvatar=()=>{if(avatar)avatar.textContent=(title?.textContent.trim()||'TK').slice(0,1).toLocaleUpperCase('vi');};
  if(title)new MutationObserver(syncAvatar).observe(title,{childList:true,characterData:true,subtree:true});syncAvatar();
  const caret = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  caret.classList.add('u037-car'); caret.setAttribute('viewBox', '0 0 20 20'); caret.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(caret.namespaceURI, 'path'); path.setAttribute('d','M6 12l4-4 4 4');caret.append(path);chip.append(caret);
  const menu = document.createElement('div');menu.id='sidebarAccountMenu';menu.className='u037-menu';
  menu.setAttribute('role','menu');menu.setAttribute('aria-label','Menu tài khoản');menu.inert=true;
  const heading=document.createElement('p');heading.className='u037-sec';heading.textContent='Tài khoản';
  const list=document.createElement('div');list.className='u037-list';list.setAttribute('role','none');
  const bar=document.createElement('div');bar.className='u037-hl';bar.setAttribute('aria-hidden','true');list.append(bar);
  if(logout)list.append(logout);
  menu.append(heading,list);profile.append(chip,menu);
  let open=false;
  const items=()=>[...list.querySelectorAll('button')].filter(it=>!it.hidden&&!it.classList.contains('hidden')&&getComputedStyle(it).display!=='none');
  function decorate(){
    // Settings is supplied later by workspace-reports, after its RBAC setup.
    [...menu.children].filter(it=>it.tagName==='BUTTON').forEach(it=>list.prepend(it));
    [...list.querySelectorAll('button')].forEach((it,index)=>{
      it.classList.add('u037-it');it.classList.toggle('out',it===logout);
      if(it.id==='btnAccountSettings'&&!it.querySelector('svg')){
        const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');
        const line=document.createElementNS(icon.namespaceURI,'path');line.setAttribute('d','M4 7h16M4 17h16M9 4v6M15 14v6');line.setAttribute('stroke-linecap','round');icon.append(line);it.prepend(icon);
      }
      it.setAttribute('role','menuitem');it.style.setProperty('--i',index);
      it.tabIndex=open?0:-1;
    });
  }
  new MutationObserver(decorate).observe(menu,{childList:true});decorate();
  function place(){
    const rect=chip.getBoundingClientRect();
    const width=Math.min(320,innerWidth-24);
    menu.style.width=`${width}px`;menu.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-width-12))}px`;
    menu.style.bottom=`${Math.max(12,innerHeight-rect.top+16)}px`;
    menu.style.maxHeight=`${Math.max(80,rect.top-28)}px`;
  }
  function setOpen(value,focusFirst=false){
    open=value;if(open)place();profile.classList.toggle('is-open',open);
    chip.setAttribute('aria-expanded',String(open));chip.setAttribute('aria-label',open?'Đóng menu tài khoản':'Mở menu tài khoản');
    menu.inert=!open;items().forEach(it=>it.tabIndex=open?0:-1);
    if(!open)list.classList.remove('is-hl');
    if(open&&focusFirst)items()[0]?.focus({preventScroll:true});
  }
  function highlight(it){if(!it)return;bar.style.setProperty('--y',`${it.offsetTop}px`);bar.style.setProperty('--h',`${it.offsetHeight}px`);list.classList.add('is-hl');}
  list.addEventListener('pointerover',e=>highlight(e.target.closest('button')));
  list.addEventListener('focusin',e=>highlight(e.target.closest('button')));
  menu.addEventListener('pointerleave',()=>list.classList.remove('is-hl'));
  chip.addEventListener('click',()=>setOpen(!open));
  profile.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&open){e.preventDefault();setOpen(false);chip.focus({preventScroll:true});return;}
    if(e.target===chip&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setOpen(true,true);return;}
    if(!open||!e.target.closest('.u037-it'))return;
    const all=items(),index=all.indexOf(e.target.closest('button'));let next;
    if(e.key==='ArrowDown')next=(index+1)%all.length;
    if(e.key==='ArrowUp')next=(index-1+all.length)%all.length;
    if(e.key==='Home')next=0;if(e.key==='End')next=all.length-1;
    if(next!==undefined){e.preventDefault();all[next]?.focus({preventScroll:true});}
  });
  // Leave the application's document click delegation in charge of real actions.
  menu.addEventListener('click',e=>{if(e.target.closest('button'))setTimeout(()=>{setOpen(false);chip.focus({preventScroll:true});});});
  profile.addEventListener('account-menu-close',()=>setOpen(false));
  document.addEventListener('click',e=>{if(!profile.contains(e.target))setOpen(false);});
  profile.addEventListener('focusout',()=>setTimeout(()=>{if(!profile.contains(document.activeElement))setOpen(false);}));
  window.addEventListener('resize',()=>setOpen(false));
  window.addEventListener('scroll',()=>{if(open)place();},{passive:true});
  window.addEventListener('report-role-change',()=>setOpen(false));
}
