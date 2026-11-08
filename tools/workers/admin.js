(function(){
var $=function(id){return document.getElementById(id)};
var TK='rlw_workers_admin';
var token=null; try{token=localStorage.getItem(TK)}catch(e){}
var S=null, today=null, monthData=null;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function api(path,body){
  var opt={headers:{authorization:'Bearer '+token}};
  if(body!==undefined){opt.method='POST';opt.headers['content-type']='application/json';opt.body=JSON.stringify(body)}
  return fetch(path,opt).then(function(r){if(r.status===401){signOut(true);throw new Error('auth')}return r.json()}).catch(function(e){if(e.message==='auth')throw e;return {ok:false,error:'Network problem. Please try again.'}});
}
function signOut(expired){token=null;try{localStorage.removeItem(TK)}catch(e){};$('appView').classList.add('hidden');$('loginView').classList.remove('hidden');if(expired)$('loginErr').textContent='Please sign in again.'}
$('loginForm').addEventListener('submit',function(e){
  e.preventDefault();$('loginErr').textContent='';$('loginBtn').disabled=true;
  fetch('api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:$('pw').value})}).then(function(r){return r.json()}).then(function(r){
    $('loginBtn').disabled=false;
    if(!r.ok){$('loginErr').textContent=r.error||'Could not sign in.';return}
    token=r.token;try{localStorage.setItem(TK,token)}catch(e){};$('pw').value='';start();
  }).catch(function(){$('loginBtn').disabled=false;$('loginErr').textContent='Network problem. Please try again.'});
});
$('logout').addEventListener('click',function(){api('api/admin/logout',{}).catch(function(){});signOut(false)});
// tabs
var TABS=['day','month','workers','settings'];
function tab(name){TABS.forEach(function(t){$('t-'+t).setAttribute('aria-selected',t===name);$('p-'+t).classList.toggle('hidden',t!==name)});
  if(name==='day')loadDay();if(name==='month')loadMonth();if(name==='workers')loadWorkers();if(name==='settings')loadSettings();
  try{history.replaceState(null,'','#'+name)}catch(e){}}
TABS.forEach(function(t){$('t-'+t).addEventListener('click',function(){tab(t)})});
function fmt12(hm){var p=hm.split(':'),h=+p[0],m=p[1],ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+m+' '+ap}
function isService(d){var dt=new Date(d+'T00:00:00Z');return dt.getUTCDay()===0||S.extra.some(function(x){return x.date===d})}
function addDays(d,n){var t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)}
function stepService(d,dir){var x=d;for(var i=0;i<120;i++){x=addDays(x,dir);if(isService(x))return x}return d}
function overview(){return api('api/admin/overview').then(function(r){if(!r.ok){$('appErr').textContent=r.error;return}S=r.settings;today=r.today;if(!$('dDate').value)$('dDate').value=r.last_service;if(!$('mMonth').value)$('mMonth').value=r.today.slice(0,7);if(!$('aSince').value)$('aSince').value=r.today;if(!$('bSince').value)$('bSince').value=r.today})}
// ---- Sunday table ----
function loadDay(){
  var d=$('dDate').value;if(!d)return;
  return api('api/admin/day?d='+d).then(function(r){
    if(!r.ok){$('appErr').textContent=r.error;return}
    $('appErr').textContent='';
    var n=$('dNotice'),msg='';
    var dl=new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    if(!r.service_day) msg='<b>'+esc(dl)+'</b> is not a service day. Add it under Settings, Extra service days, if there was a service.';
    else if(r.window==='future') msg='<b>'+esc(dl)+'</b> ('+esc(r.label)+') is still ahead. Service starts '+esc(r.start)+'.';
    else if(r.window==='open'||r.window==='before') msg='<b>'+esc(dl)+'</b> ('+esc(r.label)+'). Check-in is open until '+esc(r.closes)+'. Workers who have not checked in show as "Not yet" and become Absent when it closes.';
    else msg='<b>'+esc(dl)+'</b> ('+esc(r.label)+'). Service started '+esc(r.start)+(r.grace?' (grace '+r.grace+' min)':'')+'. Check-in is closed.';
    n.innerHTML=msg;n.classList.toggle('hidden',!msg);
    $('cOn').textContent=r.counts.ontime;$('cLate').textContent=r.counts.late;$('cExc').textContent=r.counts.excused;$('cTot').textContent=r.rows.length;
    var open=r.window!=='closed';$('cAbs').textContent=open?r.counts.notyet:r.counts.absent;$('cAbsL').textContent=open?'Not yet':'Absent';
    var h='';
    r.rows.forEach(function(x,i){
      h+='<tr data-id="'+x.id+'"><td>'+(i+1)+'</td><td><b>'+esc(x.name)+'</b></td><td>'+esc(x.unit)+'</td><td>'+esc(x.time||'-')+(x.edited?' <span class="small">(edited)</span>':'')+'</td><td><span class="pill '+x.status+'">'+esc(x.label)+'</span></td><td class="small">'+esc(x.note)+'</td><td><button class="btn ghost sm" type="button" data-fix="'+x.id+'">Fix</button></td></tr>';
      h+='<tr class="hidden" id="fix-'+x.id+'"><td></td><td colspan="6"><div class="edit"><label class="small" for="ft-'+x.id+'" style="margin:0">Arrival</label><input type="time" id="ft-'+x.id+'" value="'+(x.arrived_at?toHM(x.arrived_at):'')+'"><input type="text" id="fn-'+x.id+'" maxlength="300" placeholder="Note (reason)" value="'+esc(x.note)+'" aria-label="Note"><button class="btn sm" type="button" data-act="time" data-w="'+x.id+'">Save time</button><button class="btn navy sm" type="button" data-act="excuse" data-w="'+x.id+'">Mark excused</button><button class="btn ghost sm" type="button" data-act="clear" data-w="'+x.id+'">Clear record</button></div></td></tr>';
    });
    if(!r.rows.length)h='<tr><td colspan="7" class="small" style="text-align:center;padding:24px">No workers yet. Add them on the Workers tab.</td></tr>';
    $('dTable').querySelector('tbody').innerHTML=h;
  }).catch(function(){});
}
function toHM(ts){var d=new Date(ts+3600000);return ('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2)}
$('dTable').addEventListener('click',function(e){
  var f=e.target.closest('[data-fix]');if(f){$('fix-'+f.getAttribute('data-fix')).classList.toggle('hidden');return}
  var a=e.target.closest('[data-act]');if(!a)return;
  var w=+a.getAttribute('data-w'),act=a.getAttribute('data-act');
  if(act==='clear'&&!confirm('Clear this record? The worker will show as Absent (or Not yet) again.'))return;
  var body={worker_id:w,date:$('dDate').value,action:act,note:$('fn-'+w).value,time:$('ft-'+w).value};
  if(act==='time'&&!body.time){alert('Enter the arrival time first.');return}
  a.disabled=true;api('api/admin/mark',body).then(function(r){if(!r.ok){$('appErr').textContent=r.error;a.disabled=false;return}loadDay()}).catch(function(){});
});
$('dDate').addEventListener('change',loadDay);
$('dPrev').addEventListener('click',function(){$('dDate').value=stepService($('dDate').value||today,-1);loadDay()});
$('dNext').addEventListener('click',function(){$('dDate').value=stepService($('dDate').value||today,1);loadDay()});
function download(path,name){fetch(path,{headers:{authorization:'Bearer '+token}}).then(function(r){if(!r.ok)throw 0;return r.blob()}).then(function(b){var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000)}).catch(function(){$('appErr').textContent='Could not download. Please try again.'})}
$('dCsv').addEventListener('click',function(){var d=$('dDate').value;if(d)download('api/admin/day.csv?d='+d,'rlw-workers-'+d+'.csv')});
// ---- Month ----
function monthLabel(m){return new Date(m+'-01T00:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})}
function arr(v){if(v==null)return '-';if(v===0)return 'Right at start';return v<0?Math.abs(v)+' min early':v+' min late'}
function plural(n,w){return n+' '+w+(n===1?'':'s')}
function loadMonth(){
  var m=$('mMonth').value;if(!m)return;
  return api('api/admin/month?m='+m).then(function(r){
    if(!r.ok){$('appErr').textContent=r.error;return}
    monthData=r;$('appErr').textContent='';
    var days=r.service_days.map(function(d){return new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})});
    $('mDays').textContent=monthLabel(m)+': '+plural(r.service_days.length,'service day')+(days.length?' ('+days.join(', ')+')':'')+'. Counted so far: '+r.counted_days.length+(r.open_day?' (today is still open)':'')+'.';
    var by={};r.rows.forEach(function(x){by[x.id]=x});
    var top=r.top.map(function(id){return by[id]}),bot=r.bottom.map(function(id){return by[id]});
    var empty=!top.length;
    $('mEmpty').textContent=empty?'No services have been counted for this month yet. The ranking appears once a service day has closed.':'';
    $('mEmpty').classList.toggle('hidden',!empty);
    var cls=['g','s','b'],lab=['1st','2nd','3rd'],h='';
    top.forEach(function(x,i){h+='<div class="medal '+cls[i]+'"><div class="m">'+(i+1)+'</div><div class="n">'+esc(x.name)+'</div><div class="d">'+lab[i]+' · score '+x.score+'</div><div class="d">'+x.ontime+' of '+x.services+' on time</div></div>'});
    $('mTop').innerHTML=h||'<p class="small">Nobody yet.</p>';
    $('mTopLine').textContent=top.length?'Thank you for your faithfulness. "Moreover it is required in stewards, that a man be found faithful." (1 Corinthians 4:2)':'';
    $('mBot').innerHTML=bot.length?'<ul>'+bot.map(function(x){return '<li><b>'+esc(x.name)+'</b> <span class="small">score '+x.score+', '+x.ontime+' of '+x.services+' on time</span></li>'}).join('')+'</ul><p class="small" style="margin:10px 0 0">We love and value you. Let us aim to arrive a little earlier next month. "Let us not be weary in well doing: for in due season we shall reap, if we faint not." (Galatians 6:9)</p>':'<p class="small" style="margin:0">Nobody to list. Everyone outside the top 3 was fully on time, or there are not enough workers yet.</p>';
    var t='';
    r.rows.forEach(function(x){
      var c=r.top.indexOf(x.id)>=0?'top'+(r.top.indexOf(x.id)+1):(r.bottom.indexOf(x.id)>=0?'bot':'');
      t+='<tr class="'+c+'"><td class="num">'+(x.rank||'-')+'</td><td><b>'+esc(x.name)+'</b>'+(c==='bot'?' <span class="small">(encouraged)</span>':'')+'</td><td>'+esc(x.unit)+'</td><td class="num">'+x.services+'</td><td class="num">'+x.ontime+'</td><td class="num">'+x.late+'</td><td class="num">'+x.absent+'</td><td class="num">'+x.excused+'</td><td>'+arr(x.avgDiff)+'</td><td class="num"><b>'+(x.score==null?'-':x.score)+'</b></td></tr>';
    });
    if(!r.rows.length)t='<tr><td colspan="10" class="small" style="text-align:center;padding:24px">No workers yet.</td></tr>';
    $('mTable').querySelector('tbody').innerHTML=t;
    drawCard();
  }).catch(function(){});
}
function cardData(){
  var r=monthData,by={};r.rows.forEach(function(x){by[x.id]=x});
  return {monthLabel:monthLabel(r.month),includeBottom:$('mIncBot').checked,
    top:r.top.map(function(id){var x=by[id];return {name:x.name,detail:x.ontime+' of '+x.services+' services on time · score '+x.score}}),
    bottom:r.bottom.map(function(id){var x=by[id];return {name:x.name,score:x.score,detail:x.ontime+' of '+x.services+' on time · '+x.late+' late · '+x.absent+' absent'}})};
}
var cardBlob=null;
function drawCard(){
  if(!monthData)return;
  var cv=$('mCanvas');
  RLWCard.draw(cv,cardData()).then(function(){
    cv.toBlob(function(b){cardBlob=b;var img=$('mCardImg');if(img.src)URL.revokeObjectURL(img.src);img.src=URL.createObjectURL(b)},'image/png');
    var f=null;try{f=new File([new Blob()],'x.png',{type:'image/png'})}catch(e){}
    $('mShare').classList.toggle('hidden',!(navigator.canShare&&f&&navigator.canShare({files:[f]})));
  });
}
$('mIncBot').addEventListener('change',drawCard);
$('mMonth').addEventListener('change',loadMonth);
function fname(){return 'RLW-workers-punctuality-'+monthData.month+'.png'}
$('mDl').addEventListener('click',function(){if(!cardBlob)return;var a=document.createElement('a');a.href=URL.createObjectURL(cardBlob);a.download=fname();document.body.appendChild(a);a.click();setTimeout(function(){a.remove()},1000)});
$('mShare').addEventListener('click',function(){
  if(!cardBlob)return;var file=new File([cardBlob],fname(),{type:'image/png'});
  navigator.share({files:[file],text:'RLW Workers punctuality, '+monthLabel(monthData.month)+'. Well done to our most punctual workers!'}).then(function(){$('mShareMsg').textContent=''}).catch(function(e){if(e&&e.name!=='AbortError')$('mShareMsg').textContent='Sharing did not work here. Use Download image instead.'});
});
$('mCsv').addEventListener('click',function(){var m=$('mMonth').value;if(m)download('api/admin/month.csv?m='+m,'rlw-workers-'+m+'.csv')});
// ---- Workers ----
var WL=[];
function loadWorkers(){return api('api/admin/workers').then(function(r){if(!r.ok){$('appErr').textContent=r.error;return}WL=r.workers;renderWorkers()}).catch(function(){})}
function renderWorkers(){
  var q=$('wQ').value.trim().toLowerCase(),act=WL.filter(function(w){return w.active}).length,h='';
  $('wCount').textContent='Workers ('+act+' active'+(WL.length>act?', '+(WL.length-act)+' inactive':'')+')';
  WL.forEach(function(w){
    if(q&&(w.name+' '+(w.unit||'')).toLowerCase().indexOf(q)<0)return;
    h+='<div class="w'+(w.active?'':' off')+'" data-id="'+w.id+'"><div><div class="nm">'+esc(w.name)+(w.active?'':' (inactive)')+'</div><div class="small">'+esc([w.unit,w.phone,'counts from '+w.since,w.checkins+' check-ins'].filter(Boolean).join(' · '))+'</div></div>'+
      '<div class="row"><button class="btn ghost sm" type="button" data-edit="'+w.id+'">Edit</button><button class="btn ghost sm" type="button" data-toggle="'+w.id+'">'+(w.active?'Deactivate':'Reactivate')+'</button><button class="btn danger sm" type="button" data-del="'+w.id+'">Delete</button></div>'+
      '<div class="edit hidden" id="we-'+w.id+'" style="width:100%"><input type="text" id="wn-'+w.id+'" value="'+esc(w.name)+'" aria-label="Name" maxlength="80"><input type="text" id="wu-'+w.id+'" value="'+esc(w.unit||'')+'" placeholder="Unit" aria-label="Unit" maxlength="60"><input type="tel" id="wp-'+w.id+'" value="'+esc(w.phone||'')+'" placeholder="Phone" aria-label="Phone" maxlength="20"><input type="date" id="ws-'+w.id+'" value="'+esc(w.since)+'" aria-label="Counts from"><button class="btn sm" type="button" data-save="'+w.id+'">Save</button></div></div>';
  });
  $('wList').innerHTML=h||'<p class="small" style="margin:0">No workers yet. Add them above.</p>';
}
$('wQ').addEventListener('input',renderWorkers);
$('wList').addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;
  var id;
  if((id=b.getAttribute('data-edit'))){$('we-'+id).classList.toggle('hidden');return}
  if((id=b.getAttribute('data-save'))){api('api/admin/workers/update',{id:+id,name:$('wn-'+id).value,unit:$('wu-'+id).value,phone:$('wp-'+id).value,since:$('ws-'+id).value}).then(function(r){if(!r.ok){$('appErr').textContent=r.error;return}$('appErr').textContent='';loadWorkers()});return}
  if((id=b.getAttribute('data-toggle'))){var w=WL.filter(function(x){return x.id===+id})[0];api('api/admin/workers/update',{id:+id,active:!w.active}).then(function(){loadWorkers()});return}
  if((id=b.getAttribute('data-del'))){var w2=WL.filter(function(x){return x.id===+id})[0];if(!confirm('Delete '+w2.name+' and all their attendance records? To keep their history, use Deactivate instead.'))return;api('api/admin/workers/delete',{id:+id}).then(function(){loadWorkers()});return}
});
function addResult(el,r){if(!r.ok){el.className='err';el.textContent=r.error;return}el.className='ok';el.textContent=(r.added.length?'Added '+r.added.length+'.':'')+(r.skipped.length?' Already on the list: '+r.skipped.join(', ')+'.':'');loadWorkers()}
$('addOne').addEventListener('submit',function(e){e.preventDefault();api('api/admin/workers/add',{name:$('aName').value,unit:$('aUnit').value,phone:$('aPhone').value,since:$('aSince').value}).then(function(r){addResult($('aMsg'),r);if(r.ok){$('aName').value='';$('aPhone').value=''}})});
$('addBulk').addEventListener('submit',function(e){e.preventDefault();var names=$('bNames').value.split(/\r?\n/).map(function(s){return s.trim()}).filter(Boolean);api('api/admin/workers/add',{names:names,unit:$('bUnit').value,since:$('bSince').value}).then(function(r){addResult($('bMsg'),r);if(r.ok)$('bNames').value=''})});
// ---- Settings ----
function loadSettings(){return overview().then(function(){$('sStart').value=S.start;$('sGrace').value=S.grace;$('sOpen').value=S.open;$('sClose').value=S.close;renderExtra()})}
function renderExtra(){$('xList').innerHTML=S.extra.length?S.extra.map(function(x){return '<div class="w"><div><div class="nm">'+esc(x.label)+'</div><div class="small">'+esc(new Date(x.date+'T00:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}))+'</div></div><button class="btn ghost sm" type="button" data-xdel="'+x.date+'">Remove</button></div>'}).join(''):'<p class="small" style="margin:0">No extra days. Sundays only.</p>'}
$('sForm').addEventListener('submit',function(e){e.preventDefault();api('api/admin/settings',{start:$('sStart').value,grace:$('sGrace').value,open:$('sOpen').value,close:$('sClose').value}).then(function(r){var m=$('sMsg');if(!r.ok){m.className='err';m.textContent=r.error;return}m.className='ok';m.textContent='Saved. Service starts '+fmt12($('sStart').value)+'.';loadSettings()})});
$('xForm').addEventListener('submit',function(e){e.preventDefault();api('api/admin/extra',{date:$('xDate').value,label:$('xLabel').value}).then(function(r){if(!r.ok){$('xMsg').textContent=r.error;return}$('xMsg').textContent='';$('xLabel').value='';S.extra=r.extra;renderExtra()})});
$('xList').addEventListener('click',function(e){var b=e.target.closest('[data-xdel]');if(!b)return;api('api/admin/extra',{date:b.getAttribute('data-xdel'),remove:true}).then(function(r){if(r.ok){S.extra=r.extra;renderExtra()}})});
function start(){
  $('loginView').classList.add('hidden');$('appView').classList.remove('hidden');
  overview().then(function(){var h=(location.hash||'').slice(1);tab(TABS.indexOf(h)>=0?h:'day')}).catch(function(){});
}
if(token)start();else $('loginView').classList.remove('hidden');
})();
