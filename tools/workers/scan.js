(function(){
var $=function(id){return document.getElementById(id)};
var KEY_W='rlw_worker', KEY_D='rlw_device';
function store(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}
function load(k){try{return localStorage.getItem(k)}catch(e){return null}}
var dev=load(KEY_D);
if(!dev||!/^[0-9a-f]{32}$/.test(dev)){var a=new Uint8Array(16);crypto.getRandomValues(a);dev=Array.prototype.map.call(a,function(x){return ('0'+x.toString(16)).slice(-2)}).join('');store(KEY_D,dev)}
var me=null; try{me=JSON.parse(load(KEY_W)||'null')}catch(e){me=null}
var workers=[], chosen=null, status=null;
function show(id){['pickView','meView','doneView'].forEach(function(v){$(v).classList.toggle('hidden',v!==id)})}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function api(path,opt){return fetch(path,opt).then(function(r){return r.json().catch(function(){return {ok:false,error:'Network problem. Please try again.'}})}).catch(function(){return {ok:false,error:'No connection. Check your data and try again.'}})}
function canCheck(){return status&&status.service_day&&status.window==='open'}
function setClosed(){
  var c=$('closed'), msg='';
  if(!status) return;
  if(!status.service_day) msg='Check-in is only open on Sundays and special service days, from '+status.opens+' to '+status.closes+'.';
  else if(status.window==='before') msg='Check-in opens at '+status.opens+' today. Service starts at '+status.start+'.';
  else if(status.window==='closed') msg='Check-in for today closed at '+status.closes+'.';
  c.textContent=msg; c.classList.toggle('hidden',!msg);
  $('pickGo').disabled=!(chosen&&canCheck()); $('meGo').disabled=!canCheck();
}
function renderList(){
  var q=$('q').value.trim().toLowerCase(), html='', n=0;
  workers.forEach(function(w){
    if(q&&w.name.toLowerCase().indexOf(q)<0&&(w.unit||'').toLowerCase().indexOf(q)<0) return;
    n++;
    html+='<button type="button" role="listitem" data-id="'+w.id+'" aria-pressed="'+(chosen&&chosen.id===w.id)+'"><span>'+esc(w.name)+'</span><span class="u">'+esc(w.unit||'')+'</span></button>';
  });
  if(!workers.length) html='<p class="small" style="padding:12px 14px;margin:0">The workers list is empty. The admin needs to add workers first.</p>';
  else if(!n) html='<p class="small" style="padding:12px 14px;margin:0">No name matches "'+esc(q)+'".</p>';
  $('list').innerHTML=html;
}
$('list').addEventListener('click',function(e){var b=e.target.closest('button[data-id]');if(!b)return;var id=+b.getAttribute('data-id');chosen=workers.filter(function(w){return w.id===id})[0]||null;renderList();setClosed();$('pickGo').textContent=chosen?'Check in as '+chosen.name:'Check in'});
$('q').addEventListener('input',renderList);
function doneScreen(r){
  show('doneView');
  $('doneHead').textContent=r.already?'You already checked in today':'Checked in';
  $('doneName').textContent=r.name;
  $('doneTime').textContent=(r.already?'You already checked in at ':'Checked in at ')+r.time;
  var p=$('donePill'); p.className='pill '+r.status; p.textContent=r.label.replace('Late (','Late by ').replace(' min)',' min');
  $('tick').classList.toggle('late',r.status==='late');
  $('doneLine').textContent=r.status==='late'?'Thank you for coming. God bless your service today.':'Thank you for being on time. God bless your service today.';
  $('doneView').focus();
}
function go(w,btn,errEl){
  errEl.textContent=''; btn.disabled=true; var t=btn.textContent; btn.textContent='Checking in...';
  api('api/checkin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({worker_id:w.id,device:dev})}).then(function(r){
    btn.textContent=t; btn.disabled=false;
    if(r.ok){me={id:w.id,name:r.name};store(KEY_W,JSON.stringify(me));doneScreen(r);return}
    if(r.code==='no_worker'){store(KEY_W,null);me=null;}
    errEl.textContent=r.error||'Something went wrong. Please try again.';
    if(r.code==='closed') refresh();
  });
}
$('pickGo').addEventListener('click',function(){if(chosen)go(chosen,$('pickGo'),$('pickErr'))});
$('meGo').addEventListener('click',function(){if(me)go(me,$('meGo'),$('meErr'))});
function notMe(){store(KEY_W,null);me=null;chosen=null;$('q').value='';$('pickGo').textContent='Check in';loadWorkers();show('pickView');setClosed()}
$('notMe').addEventListener('click',notMe);$('notMe2').addEventListener('click',notMe);
function loadWorkers(){return api('api/workers').then(function(r){workers=r.ok?r.workers:[];renderList()})}
function refresh(){
  return api('api/status'+(me?'?w='+me.id:'')).then(function(r){
    if(!r.ok){$('clock').textContent=r.error||'Could not load. Please refresh.';return}
    status=r;
    $('clock').textContent=(r.label?r.label+' · ':'')+'Time now: '+r.now+' · Service starts '+r.start;
    if(me&&r.worker===null){store(KEY_W,null);me=null}
    if(me&&r.worker){me.name=r.worker.name;store(KEY_W,JSON.stringify(me))}
    setClosed();
    return r;
  });
}
refresh().then(function(r){
  if(me&&r&&r.checked){doneScreen({already:true,name:me.name,time:r.checked.time,label:r.checked.label,status:r.checked.status});return}
  if(me){$('meName').textContent=me.name;show('meView')}
  else{show('pickView');loadWorkers()}
});
setInterval(function(){if(!document.hidden)refresh()},60000);
})();
