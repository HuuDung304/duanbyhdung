// Add presentation feedback to existing forms without changing their validation or save handlers.
export function mountFormFeedback() {
 if(document.documentElement.dataset.formFeedbackMounted)return;
 document.documentElement.dataset.formFeedbackMounted='true';
 const selectors=['#formStudentProfile','#formAddCadet','#formAddSubject','#formUpdateLang'];
 const selector=selectors.join(',');
 let active=null, snapshot='';
 const values=form=>JSON.stringify([...form.elements].filter(el=>el.id&&el.type!=='password'&&el.type!=='file'&&!['submit','button'].includes(el.type)).map(el=>[el.id,el.type==='checkbox'||el.type==='radio'?el.checked:el.value]));
 const visible=form=>{const modal=form?.closest('[id^="modal"]');return Boolean(modal&&!modal.classList.contains('hidden')&&modal.style.display!=='none');};
 const changed=()=>active&&visible(active)&&values(active)!==snapshot;
 const clear=()=>{active=null;snapshot='';};
 document.addEventListener('focusin',event=>{
  const form=event.target.closest?.(selector);if(form&&visible(form)&&active!==form){active=form;snapshot=values(form);}
 });
 function message(input){
  if(input.validity.valueMissing)return 'Vui lòng nhập thông tin này.';
  if(input.validity.rangeUnderflow||input.validity.rangeOverflow)return 'Giá trị nằm ngoài khoảng cho phép.';
  if(input.validity.typeMismatch||input.validity.patternMismatch||input.validity.badInput)return 'Định dạng chưa hợp lệ.';
  return input.validationMessage||'Thông tin chưa hợp lệ.';
 }
 function feedback(input,show){
  if(!input?.id||!input.willValidate||!input.closest?.(selector))return;
  const id=`${input.id}-validation-feedback`;let note=document.getElementById(id);
  if(show&&!input.validity.valid){
   if(!note){note=document.createElement('small');note.id=id;note.className='form-field-feedback';note.setAttribute('role','status');input.insertAdjacentElement('afterend',note);}
   note.textContent=message(input);input.setAttribute('aria-invalid','true');
   const described=(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);if(!described.includes(id)){described.push(id);input.setAttribute('aria-describedby',described.join(' '));}
  }else if(note){note.remove();input.removeAttribute('aria-invalid');const described=(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(value=>value&&value!==id);if(described.length)input.setAttribute('aria-describedby',described.join(' '));else input.removeAttribute('aria-describedby');}
 }
 document.addEventListener('focusout',event=>feedback(event.target,true));
 document.addEventListener('invalid',event=>feedback(event.target,true),true);
 for(const type of ['input','change'])document.addEventListener(type,event=>{if(event.target.validity?.valid)feedback(event.target,false);});
 document.addEventListener('click',event=>{
  const close=event.target.closest?.('[id^="modal"] .modal-close');
  if(!close||!changed()||!close.closest('[id^="modal"]')?.contains(active))return;
  if(!window.confirm('Bạn có thay đổi chưa lưu. Bạn có muốn đóng và bỏ các thay đổi này?')){event.preventDefault();event.stopImmediatePropagation();}else clear();
 },true);
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||!changed())return;
  const modal=active.closest('[id^="modal"]');
  if(document.querySelector('dialog[open]')||!modal.contains(document.activeElement))return;
  if(!window.confirm('Bạn có thay đổi chưa lưu. Bạn có muốn đóng và bỏ các thay đổi này?')){event.preventDefault();event.stopImmediatePropagation();}else clear();
 },true);
 window.addEventListener('beforeunload',event=>{if(changed()){event.preventDefault();event.returnValue='';}});
}
