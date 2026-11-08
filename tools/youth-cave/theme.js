/* RLW Dark mode toggle: shared by the church site and its tools. Key: localStorage "rlw-theme" = "dark" | "light". */
(function(){
  var KEY='rlw-theme', root=document.documentElement;
  var DEF=root.getAttribute('data-theme-default')||'system';
  var MOON='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  var SUN='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function stored(){try{var t=localStorage.getItem(KEY);return t==='dark'||t==='light'?t:null}catch(e){return null}}
  function sys(){if(DEF==='dark')return 'dark';if(DEF==='light')return 'light';try{return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){return 'light'}}
  function cur(){return root.getAttribute('data-theme')==='dark'?'dark':'light'}
  function meta(t){
    var m=document.querySelectorAll('meta[name="theme-color"]');
    for(var i=0;i<m.length;i++){
      if(!m[i].hasAttribute('data-light'))m[i].setAttribute('data-light',m[i].getAttribute('content')||'');
      var d=m[i].getAttribute('data-dark')||root.getAttribute('data-theme-color-dark')||'#0E1116';
      m[i].setAttribute('content',t==='dark'?d:m[i].getAttribute('data-light'));
    }
  }
  function paint(){
    var t=cur(),b=document.querySelectorAll('.rlw-tt');
    for(var i=0;i<b.length;i++){
      b[i].innerHTML=t==='dark'?SUN:MOON;
      var l=t==='dark'?'Light mode':'Dark mode';
      b[i].setAttribute('aria-label',l);b[i].setAttribute('title',l);
      b[i].setAttribute('aria-pressed',t==='dark'?'true':'false');
    }
    meta(t);
  }
  function apply(t,anim){
    var reduce=false;try{reduce=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
    if(anim&&!reduce){root.classList.add('rlw-tanim');clearTimeout(apply._t);apply._t=setTimeout(function(){root.classList.remove('rlw-tanim')},320)}
    root.setAttribute('data-theme',t);paint();
    try{document.dispatchEvent(new CustomEvent('rlw-theme',{detail:t}))}catch(e){}
  }
  function toggle(){var t=cur()==='dark'?'light':'dark';try{localStorage.setItem(KEY,t)}catch(e){}apply(t,true)}
  document.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('.rlw-tt');if(b){e.preventDefault();toggle()}});
  window.addEventListener('storage',function(e){if(e.key===KEY)apply(stored()||sys(),true)});
  try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(){if(!stored()&&DEF==='system')apply(sys(),true)})}catch(e){}
  if(!root.getAttribute('data-theme'))root.setAttribute('data-theme',stored()||sys());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint);else paint();
  window.RLWTheme={toggle:toggle,get:cur,paint:paint};
})();
