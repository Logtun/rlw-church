(function(){
var target=location.href.replace(/[?#].*$/,'').replace(/[^\/]*$/,'');
var q=qrcode(0,'M');q.addData(target);q.make();
var n=q.getModuleCount(),m=4,size=n+2*m,d='';
for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(q.isDark(r,c))d+='M'+(c+m)+' '+(r+m)+'h1v1h-1z';
document.getElementById('qr').innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+size+' '+size+'" shape-rendering="crispEdges"><rect width="'+size+'" height="'+size+'" fill="#fff"/><path d="'+d+'" fill="#000"/></svg>';
document.getElementById('url').textContent=target.replace(/^https?:\/\//,'').replace(/\/$/,'');
})();
