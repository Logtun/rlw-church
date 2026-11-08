(function(){
var TK='rlw_team_token',ME='rlw_team_me';
var token=localStorage.getItem(TK)||'',rows=[],tpl='',filter='all',openForm=null;
var $=function(id){return document.getElementById(id);};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function api(path,opts){opts=opts||{};opts.headers=Object.assign({'authorization':'Bearer '+token},opts.body?{'content-type':'application/json'}:{},opts.headers||{});
return fetch(path,opts).then(function(r){if(r.status===401){signOut(true);throw new Error('auth');}return r;});}
function show(v){$('loginView').classList.toggle('hidden',v!=='login');$('appView').classList.toggle('hidden',v!=='app');}
function signOut(silent){if(!silent&&token)fetch('api/team/logout',{method:'POST',headers:{authorization:'Bearer '+token}}).catch(function(){});token='';localStorage.removeItem(TK);rows=[];$('list').innerHTML='';show('login');setTimeout(function(){$('pw').focus();},50);}
var LAG=3600000;
function lagos(ts){return new Date(ts+LAG);}
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var DAYL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function fmtDate(iso){var p=iso.split('-');var d=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));return DAYL[d.getUTCDay()]+', '+d.getUTCDate()+' '+MON[d.getUTCMonth()]+' '+d.getUTCFullYear();}
function fmtTs(ts){var d=lagos(ts);var h=d.getUTCHours(),m=d.getUTCMinutes();return DAY[d.getUTCDay()]+' '+d.getUTCDate()+' '+MON[d.getUTCMonth()]+', '+((h%12)||12)+':'+(m<10?'0':'')+m+(h<12?' am':' pm');}
function prettyPhone(p){var r=p.replace('+234','');return '+234 '+r.slice(0,3)+' '+r.slice(3,6)+' '+r.slice(6);}
function waLink(r){var first=(r.full_name||'').split(/\s+/)[0];var msg=(tpl||'').split('{name}').join(first);return 'https://wa.me/'+r.phone.replace('+','')+'?text='+encodeURIComponent(msg);}
function card(r){
var tags=[];tags.push('<span class="tag">'+esc(r.age_range)+'</span>');if(r.gender)tags.push('<span class="tag">'+esc(r.gender)+'</span>');
tags.push('<span class="tag">'+esc(r.heard)+(r.heard_other?': '+esc(r.heard_other):'')+'</span>');
tags.push(r.wants_visit==='Yes'?'<span class="tag yes">Wants a visit/call</span>':'<span class="tag">No visit wanted</span>');
if(!r.consent)tags.push('<span class="tag warn">Did not tick consent</span>');
if(r.times>1)tags.push('<span class="tag">Filled the card '+r.times+' times</span>');
if(r.contacted_at)tags.push('<span class="tag done">Contacted</span>');if(r.visited_at)tags.push('<span class="tag done">Visited</span>');
var st='';
if(r.contacted_at)st+='<div>Contacted by <b>'+esc(r.contacted_by)+'</b>, '+fmtTs(r.contacted_at)+(r.contacted_note?': '+esc(r.contacted_note):'')+' <button class="del" style="color:#9fdcff" data-undo="contacted" data-id="'+r.id+'">undo</button></div>';
if(r.visited_at)st+='<div>Visited by <b>'+esc(r.visited_by)+'</b>, '+fmtTs(r.visited_at)+(r.visited_note?': '+esc(r.visited_note):'')+' <button class="del" style="color:#9fdcff" data-undo="visited" data-id="'+r.id+'">undo</button></div>';
var contact=r.consent?'<a class="btn wa sm" href="'+esc(waLink(r))+'" target="_blank" rel="noopener">WhatsApp</a><a class="btn ghost sm" href="tel:'+esc(r.phone)+'">Call</a>':'';
var marks=(r.contacted_at?'':'<button class="btn navy sm" type="button" data-mark="contacted" data-id="'+r.id+'">Mark contacted</button>')+(r.visited_at?'':'<button class="btn navy sm" type="button" data-mark="visited" data-id="'+r.id+'">Mark visited</button>');
var form='';if(openForm&&openForm.id===r.id){form='<form class="markform" data-form="'+r.id+'"><label class="small" for="by'+r.id+'">'+(openForm.kind==='visited'?'Visited':'Contacted')+' by</label><input type="text" id="by'+r.id+'" name="by" maxlength="60" value="'+esc(localStorage.getItem(ME)||'')+'" required><label class="small" for="note'+r.id+'">Note <span class="opt">(optional)</span></label><textarea id="note'+r.id+'" name="note" maxlength="500" placeholder="e.g. Called after service, will come next Sunday"></textarea><div class="actions"><button class="btn sm" type="submit">Save</button><button class="btn ghost sm" type="button" data-cancel="1">Cancel</button></div></form>';}
return '<article class="person" id="p'+r.id+'"><div class="nm">'+esc(r.full_name)+'</div><div class="meta">'+esc(prettyPhone(r.phone))+' · '+fmtTs(r.created_at)+(r.area?' · '+esc(r.area):'')+'</div><div class="tags">'+tags.join('')+'</div>'+(r.prayer?'<div class="prayer"><b>Prayer request:</b> '+esc(r.prayer)+'</div>':'')+'<div class="actions">'+contact+marks+'</div>'+(st?'<div class="status">'+st+'</div>':'')+form+'<button class="del" type="button" data-del="'+r.id+'">Delete this card</button></article>';}
function render(){
var list=rows.filter(function(r){return filter==='all'||!r.contacted_at;});
if(!list.length){$('list').innerHTML='<p class="empty">'+(rows.length?'Everyone has been contacted. Well done!':'No first-timers yet. Cards filled at the door will appear here.')+'</p>';return;}
var groups={},order=[];list.forEach(function(r){if(!groups[r.service_date]){groups[r.service_date]=[];order.push(r.service_date);}groups[r.service_date].push(r);});
$('list').innerHTML=order.map(function(d){return '<section class="group"><h2>'+fmtDate(d)+' <span class="small">('+groups[d].length+')</span></h2>'+groups[d].map(card).join('')+'</section>';}).join('');}
function load(){$('appErr').textContent='';return api('api/team/list').then(function(r){return r.json();}).then(function(j){if(!j.ok){$('appErr').textContent=j.error||'Could not load.';return;}rows=j.rows;tpl=j.template;if(document.activeElement!==$('tpl'))$('tpl').value=tpl;
$('sWeek').textContent=j.stats.week;$('sMonth').textContent=j.stats.month;$('sOpen').textContent=j.stats.open;render();}).catch(function(e){if(e.message!=='auth')$('appErr').textContent='Could not load the list. Check your connection and tap Refresh.';});}
$('loginForm').addEventListener('submit',function(e){e.preventDefault();$('loginErr').textContent='';$('loginBtn').disabled=true;
fetch('api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:$('pw').value})}).then(function(r){return r.json();}).then(function(j){$('loginBtn').disabled=false;
if(j.ok){token=j.token;localStorage.setItem(TK,token);$('pw').value='';show('app');load();}else $('loginErr').textContent=j.error||'Could not sign in.';}).catch(function(){$('loginBtn').disabled=false;$('loginErr').textContent='No connection. Try again.';});});
$('logout').addEventListener('click',function(){signOut(false);});
$('refresh').addEventListener('click',load);
$('me').value=localStorage.getItem(ME)||'';$('me').addEventListener('input',function(){localStorage.setItem(ME,$('me').value.trim());});
function setFilter(f){filter=f;$('fAll').setAttribute('aria-pressed',f==='all');$('fOpen').setAttribute('aria-pressed',f==='open');render();}
$('fAll').addEventListener('click',function(){setFilter('all');});$('fOpen').addEventListener('click',function(){setFilter('open');});
$('list').addEventListener('click',function(e){var t=e.target;
if(t.dataset.mark){openForm={id:+t.dataset.id,kind:t.dataset.mark};render();var i=document.getElementById('by'+t.dataset.id);if(i){i.focus();}return;}
if(t.dataset.cancel){openForm=null;render();return;}
if(t.dataset.undo){api('api/team/mark',{method:'POST',body:JSON.stringify({id:+t.dataset.id,kind:t.dataset.undo,undo:true})}).then(load);return;}
if(t.dataset.del){var r=rows.find(function(x){return x.id===+t.dataset.del;});if(!confirm('Delete the card for '+(r?r.full_name:'this person')+'? This cannot be undone.'))return;
api('api/team/delete',{method:'POST',body:JSON.stringify({id:+t.dataset.del})}).then(load);}});
$('list').addEventListener('submit',function(e){e.preventDefault();var fm=e.target;var by=fm.elements.by.value.trim();if(!by){fm.elements.by.focus();return;}localStorage.setItem(ME,by);$('me').value=by;
api('api/team/mark',{method:'POST',body:JSON.stringify({id:openForm.id,kind:openForm.kind,by:by,note:fm.elements.note.value})}).then(function(r){return r.json();}).then(function(j){if(!j.ok){$('appErr').textContent=j.error;return;}openForm=null;load();});});
$('csv').addEventListener('click',function(){api('api/team/export.csv').then(function(r){var cd=r.headers.get('content-disposition')||'';var m=cd.match(/filename="([^"]+)"/);return r.blob().then(function(b){var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=m?m[1]:'first-timers.csv';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);});}).catch(function(){});});
$('saveTpl').addEventListener('click',function(){api('api/team/settings',{method:'POST',body:JSON.stringify({template:$('tpl').value})}).then(function(r){return r.json();}).then(function(j){$('tplMsg').style.color=j.ok?'#7fe0a6':'';$('tplMsg').textContent=j.ok?'Saved.':(j.error||'Could not save.');if(j.ok){tpl=j.template;render();}});});
if(token){show('app');load();}else{show('login');}
})();
