/* GPL-3.0-or-later. PC-only editor. */
(function(){'use strict';
const M=window.MeterDesigner,$=id=>document.getElementById(id),copy=x=>JSON.parse(JSON.stringify(x));
let setup=M.defaults(),ti=0,pi=0,wi=0,undo=[],redo=[],drag=null;
const state={speed:90,rpm:3500,coolant:90,gLat:.3,gLong:.2,fuel:70,power:90,torque:120,gear:3},canvas=$('canvas'),ctx=canvas.getContext('2d');
function theme(){return setup.themes[ti];}function page(){return theme().pages[pi];}function widget(){return page().widgets[wi];}
function status(m,error=false){$('status').textContent=m;$('status').className=error?'error':'';}
function checkpoint(){undo.push(copy(setup));if(undo.length>100)undo.shift();redo=[];}
function save(){try{M.validate(setup);localStorage.setItem('miatoff.designer.v1',JSON.stringify(setup));status('Draft saved locally');}catch(e){status(e.message,true);}}
function render(){M.draw(ctx,page(),state,setup.vehicle);const w=widget();if(w){ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(w.x,w.y,w.w,w.h);ctx.fillStyle='#fff';ctx.fillRect(w.x+w.w-8,w.y+w.h-8,8,8);}if($('missing').checked){ctx.fillStyle='#000';ctx.fillRect(250,205,300,70);ctx.fillStyle='#fbbf24';ctx.font='bold 28px Arial';ctx.fillText('NO DATA',330,250);}}
function selectOptions(el,values,index){el.replaceChildren();values.forEach((s,i)=>el.add(new Option(s,i)));el.value=index;}
function field(parent,name,value,change,choices){let l=document.createElement('label');l.textContent=name;let e=document.createElement(choices?'select':'input');if(choices){choices.forEach(s=>e.add(new Option(s,s)));}else e.type=typeof value==='number'?'number':'text';e.value=value;l.htmlFor='field-'+parent.id+'-'+name.replace(/[^a-z0-9]/gi,'-');e.id=l.htmlFor;e.setAttribute('aria-label',name);if(name==='color')e.type='color';e.onchange=()=>change(e.type==='number'?Number(e.value):e.value);l.append(e);parent.append(l);}
function refresh(){selectOptions($('themes'),setup.themes.map(t=>t.name),ti);$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;['duplicate','delete','up','down'].forEach(id=>$(id).disabled=!widget());selectOptions($('pages'),theme().pages.map(p=>p.name),pi);selectOptions($('widgets'),page().widgets.map(w=>w.type+' '+w.label),wi);$('properties').replaceChildren();
field($('properties'),'Theme name',theme().name,v=>{checkpoint();theme().name=v;save();refresh();});
field($('properties'),'Author',theme().author||'',v=>{checkpoint();theme().author=v;save();refresh();});
field($('properties'),'Page name',page().name,v=>{checkpoint();page().name=v;save();refresh();});
let w=widget();if(w)Object.keys(w).forEach(k=>field($('properties'),k,w[k],v=>{checkpoint();const old=w[k];w[k]=v;try{M.validate(setup);}catch(e){w[k]=old;status(e.message);refresh();return;}save();refresh();},k==='type'?M.types:k==='signal'?M.signals:k==='font'?['Arial','MO Chakra','MO Mono']:null));
$('vehicle').replaceChildren();['generation','engine','year','market','body','transmission'].forEach(k=>field($('vehicle'),k,setup.vehicle[k],v=>{checkpoint();setup.vehicle[k]=v;if(k==='generation'||k==='engine'){['ratios','finalDrive','circumference','mass','cda','crr','eff','ratedPower','powerRpm','ratedTorque','torqueRpm'].forEach(n=>setup.vehicle[n]=null);setup.vehicle.provenance='Manual profile: verify specifications before enabling estimates';}save();refresh();},({generation:['ND1','ND2'],engine:['1.5','2.0'],body:['roadster','RF'],transmission:['manual','automatic']})[k]));
Object.keys(setup.vehicle.rpm).forEach(k=>field($('vehicle'),'RPM '+k,setup.vehicle.rpm[k],v=>{checkpoint();const old=setup.vehicle.rpm[k];setup.vehicle.rpm[k]=v;try{M.validate(setup);save();}catch(e){setup.vehicle.rpm[k]=old;status(e.message);}refresh();}));
const unitChoices={speed:['km/h','mph'],distance:['km','mi'],temperature:['C','F'],power:['PS','hp','kW'],torque:['Nm','lb-ft'],consumption:['L/100km','mpg UK','mpg US']};Object.keys(unitChoices).forEach(k=>field($('vehicle'),k,setup.vehicle.units[k],v=>{checkpoint();setup.vehicle.units[k]=v;save();refresh();},unitChoices[k]));$('advanced').value=JSON.stringify(setup.vehicle,null,2);render();}
function newWidget(type,x=40,y=40){return {type,signal:type==='power'?'power':'rpm',x,y,w:240,h:160,min:0,max:8000,size:60,color:'#38bdf8',font:'Arial',label:type.toUpperCase()};}
function template(type){
checkpoint();
const make=(kind,signal,x,y,w,h,size,label,color,max)=>Object.assign(newWidget(kind,x,y),{signal,w,h,size,label,color,max});
let widgets=[];
if(type==='street')widgets=[
make('radial','rpm',24,56,336,336,66,'ENGINE RPM','#65e1c3',8000),
make('number','speed',416,88,352,184,132,'SPEED','#f3f6ff',260),
make('number','coolant',424,312,160,104,48,'COOLANT','#65e1c3',140),
make('number','fuel',608,312,160,104,48,'FUEL %','#65e1c3',100)];
if(type==='track')widgets=[
make('bar','rpm',24,32,752,80,48,'ENGINE RPM','#65e1c3',8000),
make('number','gear',40,152,200,256,180,'GEAR','#65e1c3',6),
make('number','speed',288,152,456,240,160,'SPEED','#f3f6ff',260)];
setup.themes=[{version:1,kind:'ThemeDocument',id:'custom-design',name:type==='track'?'Apex / Track':type==='street'?'Midnight / Street':'Untitled theme',author:'',palette:{},pages:[{name:'DRIVE',widgets}]}];setup.initialTheme='custom-design';ti=pi=wi=0;save();refresh();}

M.types.forEach(t=>$('types').add(new Option(t,t)));['blank','street','track'].forEach(t=>$(t).onclick=()=>template(t));
$('add').onclick=()=>{if(page().widgets.length>=24){status('Maximum 24 widgets per page',true);return;}checkpoint();page().widgets.push(newWidget($('types').value));wi=page().widgets.length-1;save();refresh();};
$('delete').onclick=()=>{checkpoint();page().widgets.splice(wi,1);wi=0;save();refresh();};$('duplicate').onclick=()=>{if(!widget()||page().widgets.length>=24)return;checkpoint();page().widgets.push(copy(widget()));wi=page().widgets.length-1;save();refresh();};
['up','down'].forEach((id,i)=>$(id).onclick=()=>{let n=wi+(i?-1:1);if(n<0||n>=page().widgets.length)return;checkpoint();[page().widgets[wi],page().widgets[n]]=[page().widgets[n],page().widgets[wi]];wi=n;save();refresh();});
$('themes').onchange=()=>{ti=Number($('themes').value);pi=wi=0;refresh();};
$('pages').onchange=()=>{pi=Number($('pages').value);wi=0;refresh();};$('widgets').onchange=()=>{wi=Number($('widgets').value);refresh();};
$('pageadd').onclick=()=>{if(theme().pages.length>=8){status('Maximum 8 pages per theme',true);return;}checkpoint();theme().pages.push({name:'Page '+(theme().pages.length+1),widgets:[]});pi=theme().pages.length-1;wi=0;save();refresh();};$('pagedel').onclick=()=>{if(theme().pages.length===1)return;checkpoint();theme().pages.splice(pi,1);pi=wi=0;save();refresh();};
['undo','redo'].forEach((id,i)=>$(id).onclick=()=>{let from=i?redo:undo,to=i?undo:redo;if(!from.length)return;to.push(copy(setup));setup=from.pop();ti=pi=wi=0;save();refresh();});
function download(obj,name){try{M.validate(setup);const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){status(e.message,true);}}
$('theme').onclick=()=>download(theme(),'meters-theme.json');$('setup').onclick=()=>download(setup,'meters-setup.json');$('import').onclick=()=>$('file').click();$('file').onchange=async()=>{try{let f=$('file').files[0];if(!f)return;if(f.size>262144)throw Error('File too large');let doc=JSON.parse(await f.text()),candidate=copy(setup);if(doc.kind==='ThemeDocument'){candidate.themes=[doc];candidate.initialTheme=doc.id;candidate.initialPage=0;}else candidate=doc;M.validate(candidate);if(!candidate.themes.length)throw Error('The setup must contain at least one editable theme');checkpoint();setup=candidate;ti=pi=wi=0;save();refresh();}catch(e){status(e.message,true);}finally{$('file').value='';}};
$('applyvehicle').onclick=()=>{try{let candidate=copy(setup);candidate.vehicle=JSON.parse($('advanced').value);M.validate(candidate);checkpoint();setup=candidate;save();refresh();}catch(e){status(e.message,true);}};
function point(e){const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)*800/b.width,y:(e.clientY-b.top)*480/b.height};}
canvas.onpointerdown=e=>{if(e.button!==0)return;const p=point(e);for(let i=page().widgets.length-1;i>=0;i--){const w=page().widgets[i];if(p.x>=w.x&&p.x<=w.x+w.w&&p.y>=w.y&&p.y<=w.y+w.h){wi=i;checkpoint();drag={p,w:copy(w),resize:p.x>w.x+w.w-16&&p.y>w.y+w.h-16};canvas.setPointerCapture(e.pointerId);refresh();break;}}};
canvas.onpointermove=e=>{if(!drag)return;const p=point(e),w=widget(),dx=Math.round((p.x-drag.p.x)/8)*8,dy=Math.round((p.y-drag.p.y)/8)*8;if(drag.resize){w.w=Math.max(8,Math.min(800-w.x,drag.w.w+dx));w.h=Math.max(8,Math.min(480-w.y,drag.w.h+dy));}else{w.x=Math.max(0,Math.min(800-w.w,drag.w.x+dx));w.y=Math.max(0,Math.min(480-w.h,drag.w.y+dy));}render();};canvas.onpointerup=()=>{drag=null;save();refresh();};canvas.onpointercancel=canvas.onpointerup;
let playing=false;const sliders={};
['speed','rpm','coolant'].forEach((s,i)=>{let l=document.createElement('label');const caption=document.createElement('span');caption.textContent=s.toUpperCase()+' · '+state[s];l.append(caption);const e=document.createElement('input');e.type='range';e.min=0;e.max=[260,10000,140][i];e.value=state[s];e.setAttribute('aria-label','Preview '+s);sliders[s]={input:e,caption};e.oninput=()=>{playing=false;$('play').textContent='▶ Play driving simulation';$('preview-mode').textContent='Manual preview';state[s]=Number(e.value);caption.textContent=s.toUpperCase()+' · '+state[s];render();};l.append(e);$('simulation').append(l);});$('missing').onchange=render;
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Ⅱ Pause simulation':'▶ Play driving simulation';$('preview-mode').textContent=playing?'Driving simulation':'Manual preview';};
let lastTick=0;
function animate(now){if(playing&&now-lastTick>80){lastTick=now;const cycle=(now/1000)%12;state.rpm=Math.round(1000+(cycle%3)/3*6500);state.speed=Math.round(25+cycle*13);state.coolant=90;state.gLat=Math.sin(now/1400)*.7;state.gLong=Math.cos(now/2100)*.4;state.throttle=cycle%3<2.5?95:10;state.gear=1+Math.floor(cycle/3);Object.keys(sliders).forEach(k=>{sliders[k].input.value=state[k];sliders[k].caption.textContent=k.toUpperCase()+' · '+state[k];});render();}requestAnimationFrame(animate);}requestAnimationFrame(animate);
try{const stored=localStorage.getItem('miatoff.designer.v1');if(stored){const restored=M.validate(JSON.parse(stored));if(restored.themes.length)setup=restored;}}catch(e){status(e.message,true);}if(!setup.themes.length)template('street');else refresh();
})();
