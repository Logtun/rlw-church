(function(){
var f=document.getElementById('f'),go=document.getElementById('go'),t0=Date.now();
function norm(raw){var s=String(raw||'').replace(/[\s\-().]/g,'');if(s.charAt(0)==='+')s=s.slice(1);if(s.indexOf('00234')===0)s=s.slice(2);var r=null;
if(/^234\d{10}$/.test(s))r=s.slice(3);else if(/^2340\d{10}$/.test(s))r=s.slice(4);else if(/^0\d{10}$/.test(s))r=s.slice(1);else if(/^\d{10}$/.test(s))r=s;
if(!r||!/^[789][01]\d{8}$/.test(r))return null;return '+234'+r;}
function val(n){var el=f.elements[n];if(!el)return '';if(el.length&&!el.tagName){for(var i=0;i<el.length;i++)if(el[i].checked)return el[i].value;return '';}return el.value;}
function setErr(n,msg){var w=document.getElementById('w_'+n);if(!w)return;var e=w.querySelector('.err');if(e)e.textContent=msg||'';w.classList.toggle('bad',!!msg);}
var other=document.getElementById('heard_other');
f.addEventListener('change',function(e){if(e.target.name==='heard'){other.classList.toggle('hidden',e.target.value!=='Other');if(e.target.value==='Other')other.focus();}if(e.target.name)setErr(e.target.name,'');});
f.addEventListener('submit',function(e){e.preventDefault();
var errs={};var name=val('full_name').trim();if(name.length<2)errs.full_name='Please enter your full name.';
if(!norm(val('phone')))errs.phone='Please enter a Nigerian phone number, e.g. 0803 123 4567.';
if(!val('age_range'))errs.age_range='Please choose your age range.';
if(!val('heard'))errs.heard='Please tell us how you heard about us.';
if(!val('wants_visit'))errs.wants_visit='Please choose Yes or No.';
['full_name','phone','age_range','heard','wants_visit'].forEach(function(k){setErr(k,errs[k]);});
var first=Object.keys(errs)[0];document.getElementById('formErr').textContent='';
if(first){var w=document.getElementById('w_'+first);w.scrollIntoView({behavior:'smooth',block:'center'});var i=w.querySelector('input');if(i)i.focus({preventScroll:true});return;}
var body={full_name:name,phone:val('phone'),gender:val('gender'),age_range:val('age_range'),area:val('area'),heard:val('heard'),heard_other:val('heard_other'),wants_visit:val('wants_visit'),prayer:val('prayer'),consent:document.getElementById('consent').checked,website:val('website'),t:t0};
go.disabled=true;go.textContent='Sending…';
fetch('api/checkin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){return{s:r.status,j:j};});}).then(function(x){
go.disabled=false;go.textContent='Send my card';
if(x.j&&x.j.ok){var fn=x.j.first||'';document.getElementById('thanksTitle').textContent=fn?('Thank you, '+fn+'!'):'Thank you!';
document.getElementById('formCard').classList.add('hidden');var th=document.getElementById('thanks');th.classList.remove('hidden');window.scrollTo(0,0);th.focus();}
else{if(x.j&&x.j.field)setErr(x.j.field,x.j.error);document.getElementById('formErr').textContent=(x.j&&x.j.error)||'Something went wrong. Please try again.';}
}).catch(function(){go.disabled=false;go.textContent='Send my card';document.getElementById('formErr').textContent='No connection. Please check your data and try again.';});
});
document.getElementById('another').addEventListener('click',function(){f.reset();other.classList.add('hidden');t0=Date.now();document.getElementById('thanks').classList.add('hidden');document.getElementById('formCard').classList.remove('hidden');window.scrollTo(0,0);document.getElementById('full_name').focus();});
})();
