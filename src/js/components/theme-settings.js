// Personal display preference only: never writes unit settings or replaces active forms.
const key='dd460_display_theme';
export function mountThemeSettings(container){
  if(!container||document.getElementById('themeToggle'))return;
  const card=document.createElement('article');card.className='workspace-settings-card display-settings';
  const heading=document.createElement('h3');heading.textContent='Giao diện';
  const row=document.createElement('div');row.className='display-settings-row';
  const label=document.createElement('div');
  const title=document.createElement('strong');title.id='themeToggleLabel';title.textContent='Chế độ tối';
  const note=document.createElement('p');note.id='themeToggleHelp';note.textContent='Lưu lựa chọn trên trình duyệt này.';label.append(title,note);
  const button=document.createElement('button');button.id='themeToggle';button.type='button';button.setAttribute('role','switch');button.setAttribute('aria-labelledby',title.id);button.setAttribute('aria-describedby',note.id);
  const state=document.createElement('span');state.className='display-settings-state';
  const track=document.createElement('span');track.className='display-settings-track';track.setAttribute('aria-hidden','true');
  const thumb=document.createElement('span');track.append(thumb);button.append(state,track);
  const sync=()=>{const dark=document.documentElement.dataset.theme==='dark';button.setAttribute('aria-checked',String(dark));state.textContent=dark?'Tối':'Sáng';};
  const apply=theme=>{document.documentElement.dataset.theme=theme==='dark'?'dark':'light';sync();};
  button.addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';apply(theme);try{localStorage.setItem(key,theme);}catch{/* Preference still works without storage access. */}});
  window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue);});
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  row.append(label,button);card.append(heading,row);container.append(card);sync();
}
