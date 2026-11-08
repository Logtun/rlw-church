// Monthly punctuality share card (1080x1350), drawn on a canvas.
window.RLWCard=(function(){
var NAVY='#1B2A6B', GREEN='#0A8F4A', GOLD='#d4a72c', SILVER='#aeb5c1', BRONZE='#c27a45';
var logo=null, logoP=null;
function getLogo(){if(logoP)return logoP;logoP=new Promise(function(res){var i=new Image();i.onload=function(){logo=i;res(i)};i.onerror=function(){res(null)};i.src='logo-lg.jpg'});return logoP}
function fit(ctx,text,max,size,weight,family){var s=size;do{ctx.font=weight+' '+s+'px '+family;if(ctx.measureText(text).width<=max)break;s-=2}while(s>18);return s}
function wrap(ctx,text,max){var words=text.split(' '),lines=[],cur='';words.forEach(function(w){var t=cur?cur+' '+w:w;if(ctx.measureText(t).width>max&&cur){lines.push(cur);cur=w}else cur=t});if(cur)lines.push(cur);return lines}
var SERIF='Georgia, "Times New Roman", serif', SANS='system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
function draw(canvas,data){
  // data: {monthLabel, top:[{name,detail}], bottom:[{name}], includeBottom}
  return getLogo().then(function(){
  var c=canvas.getContext('2d'),W=1080,H=1350; canvas.width=W; canvas.height=H;
  c.fillStyle='#ffffff'; c.fillRect(0,0,W,H);
  // header
  c.fillStyle='#000'; c.fillRect(0,0,W,250);
  if(logo){var lh=190,lw=lh*logo.width/logo.height;c.drawImage(logo,60,30,lw,lh)}
  c.fillStyle='#fff'; c.textAlign='left'; c.textBaseline='alphabetic';
  c.font='700 30px '+SANS; c.fillText("RLW WORKERS' ATTENDANCE",230,95);
  c.font='700 64px '+SERIF; c.fillText('Punctuality Honours',230,165);
  c.font='500 34px '+SANS; c.fillStyle='#cfd6ef'; c.fillText(data.monthLabel,230,212);
  c.fillStyle=NAVY; c.fillRect(0,250,W/2,14); c.fillStyle=GREEN; c.fillRect(W/2,250,W/2,14);
  var inc=data.includeBottom&&data.bottom.length;
  // measure the encouragement box first so everything fits
  var encLines=[], boxH=0;
  if(inc){c.font='500 27px '+SANS;encLines=wrap(c,'We love and value you. Let us aim to arrive a little earlier next month. Your service matters.',W-270);boxH=40+44+data.bottom.length*70+14+encLines.length*36+34}
  var y=inc?318:360;
  c.textAlign='center'; c.fillStyle=NAVY; c.font='700 '+(inc?46:52)+'px '+SERIF; c.fillText('Our most punctual workers',W/2,y);
  y+=inc?30:44;
  var colors=[GOLD,SILVER,BRONZE], ranks=['1ST','2ND','3RD'];
  var rowH=inc?106:178;
  if(!data.top.length){c.font='500 34px '+SANS;c.fillStyle='#555';c.fillText('No services recorded this month yet.',W/2,y+90);y+=rowH}
  data.top.forEach(function(t,i){
    var top=y+18, h=rowH-22;
    c.fillStyle='#f5f6fa'; roundRect(c,70,top,W-140,h,24); c.fill();
    c.strokeStyle=colors[i]; c.lineWidth=5; roundRect(c,70,top,W-140,h,24); c.stroke();
    var cx=150, cy=top+h/2, r=inc?40:56;
    c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.fillStyle=colors[i]; c.fill();
    c.fillStyle='#1a1306'; c.textAlign='center'; c.font='900 '+(inc?30:34)+'px '+SANS; c.fillText(ranks[i],cx,cy+11);
    c.textAlign='left'; c.fillStyle='#0d0f16';
    var fs=fit(c,t.name,W-140-200-40,inc?46:56,'800',SANS); c.font='800 '+fs+'px '+SANS; c.fillText(t.name,230,cy-(inc?4:6));
    c.fillStyle='#4a5160'; c.font='500 '+(inc?28:32)+'px '+SANS; c.fillText(t.detail,230,cy+(inc?34:46));
    y+=rowH;
  });
  y+=inc?26:56;
  c.textAlign='center'; c.fillStyle='#22283a'; c.font='italic 500 '+(inc?30:36)+'px '+SERIF;
  var q='"Moreover it is required in stewards, that a man be found faithful."';
  wrap(c,q,W-160).forEach(function(l){c.fillText(l,W/2,y+10);y+=inc?40:50});
  c.font='700 '+(inc?26:30)+'px '+SANS; c.fillStyle=NAVY; c.fillText('1 Corinthians 4:2',W/2,y+10); y+=inc?44:76;
  c.font='600 '+(inc?28:36)+'px '+SANS; c.fillStyle=GREEN; c.fillText('Thank you for your faithfulness. Well done!',W/2,y+12); y+=40;
  if(inc){
    var bh=boxH, bt=Math.max(y+14,(H-110-30)-bh);
    c.fillStyle='#eef1fb'; roundRect(c,70,bt,W-140,bh,24); c.fill();
    c.fillStyle=NAVY; c.fillRect(70,bt+18,10,bh-36);
    c.textAlign='left'; c.fillStyle=NAVY; c.font='700 36px '+SERIF; c.fillText('Encouraged to improve',115,bt+40+28);
    c.fillStyle='#0d0f16'; var ny=bt+40+44+38;
    data.bottom.forEach(function(b){var hasS=(b.score!==undefined&&b.score!==null);var fs=fit(c,b.name,W-280-(hasS?190:0),34,'700',SANS);c.textAlign='left';c.font='700 '+fs+'px '+SANS;c.fillText(b.name,115,ny);if(hasS){c.textAlign='right';c.font='700 30px '+SANS;c.fillText('Score '+b.score,W-115,ny);c.textAlign='left'}if(b.detail){var fc=c.fillStyle;c.fillStyle='#4a5160';c.font='500 25px '+SANS;c.fillText(b.detail,115,ny+30);c.fillStyle=fc}ny+=70});
    c.fillStyle='#3d4456'; c.font='500 27px '+SANS; ny+=4;
    encLines.forEach(function(l){c.fillText(l,115,ny);ny+=36});
  }
  // footer
  c.fillStyle='#000'; c.fillRect(0,H-110,W,110);
  c.fillStyle='#fff'; c.textAlign='center'; c.font='600 32px '+SANS; c.fillText('Rivers of Living Water Parish',W/2,H-45);
  return canvas;
  });
}
function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
return {draw:draw};
})();
