/* GPL-3.0-or-later. Portable studio documents and widget registry. */
(function(W){
'use strict';
const legacy=W.MeterDesigner, clone=x=>JSON.parse(JSON.stringify(x));
const registry={
 number:{group:'Gauges',variants:['plain','framed','inset']},
 radial:{group:'Gauges',variants:['arc','needle','segmented']},
 bar:{group:'Gauges',variants:['continuous','segmented','dotted']},
 gmeter:{group:'Gauges',variants:['circle','octagon','rounded']},
 shift:{group:'Indicators',variants:['led','rectangles']},
 warning:{group:'Indicators',variants:['icon','text']},
 history:{group:'Charts',variants:['line','area']},
 power:{group:'Charts',variants:['curves']},
 lap:{group:'Track',variants:['full','compact']},
 session:{group:'Track',variants:['cards']},
 label:{group:'Decoration',variants:['text']},
 shape:{group:'Decoration',variants:['rectangle','rounded','octagon','line']}
};
const colors=['#65e1c3','#ffba55','#e8d8af','#cbd5e1','#ed63ff','#ff874c'];
const names=['Street','Track','Classic Analog','Minimal','Neon','Retro Digital'];
function widget(type,variant){return {type,variant:variant||registry[type].variants[0],signal:type==='power'?'power':type==='warning'?'coolant':'rpm',x:32,y:48,w:240,h:160,min:0,max:8000,size:56,label:type.toUpperCase(),decimals:0,orientation:'horizontal',segments:20,gap:4,thickness:10,sweep:270,ticks:8,threshold:105,direction:'above',window:30,labelPosition:'top',unitPosition:'label',showSpeed:true,showRpm:true,showLaps:true,sparkline:false,trail:true,peaks:true,grid:true,autoScale:true,allowOverlap:false,locked:false,hidden:false};}
function migrate(input){let s=clone(input);if(s.version===1){s.version=2;s.assets={};s.themes.forEach(t=>{t.version=2;t.style={color:'#65e1c3',font:'Arial',effect:'flat',intensity:.5};t.background={kind:'solid',color:'#090d13',color2:'#182637',opacity:1,dim:0,fit:'cover',x:.5,y:.5};t.pages.forEach(p=>p.widgets=p.widgets.map(w=>Object.assign(widget(w.type),w,{variant:registry[w.type].variants[0],autoScale:false})));});}if(s.version===2&&Array.isArray(s.themes))s.themes.forEach(t=>t.pages.forEach(p=>p.widgets=p.widgets.map(w=>Object.assign(widget(w.type),{autoScale:w.autoScale===undefined?(w.min===0&&w.max===8000):w.autoScale},w))));return s;}
function defaults(){return migrate(legacy.defaults());}
function starter(n){const t={version:2,kind:'ThemeDocument',id:'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),name:n,author:'',style:{color:colors[names.indexOf(n)]||colors[0],font:n==='Retro Digital'?'MO Mono':n==='Neon'?'MO Chakra':'Arial',effect:n==='Neon'?'neon':n==='Classic Analog'?'raised':'flat',intensity:.5},background:{kind:n==='Track'?'carbon':n==='Neon'?'grid':'linear',color:n==='Classic Analog'?'#28231e':'#090d13',color2:n==='Neon'?'#241335':'#172638',opacity:1,dim:.1,fit:'cover',x:.5,y:.5},pages:[]};
const put=(type,variant,x,y,w,h,signal,size,label)=>Object.assign(widget(type,variant),{x,y,w,h,signal,size,label});
t.pages=[{name:'DRIVE',widgets:[put('radial',n==='Classic Analog'?'needle':n==='Retro Digital'?'segmented':'arc',24,64,336,336,'rpm',66,'ENGINE RPM'),put('number','plain',408,88,352,184,'speed',124,'SPEED'),put('number','framed',416,312,160,104,'coolant',44,'COOLANT'),put('number','framed',600,312,160,104,'fuel',44,'FUEL %')]},{name:'TELEMETRY',widgets:[put('gmeter',n==='Neon'?'octagon':'circle',24,56,320,320,'gLat',48,'G FORCE'),put('history','line',376,56,392,184,'rpm',32,'RPM HISTORY'),put('session','cards',376,272,392,152,'speed',36,'SESSION')]}];if(n==='Track')t.pages[0].widgets=[put('bar','segmented',24,32,752,88,'rpm',40,'ENGINE RPM'),put('number','plain',40,160,216,264,'gear',176,'GEAR'),put('number','plain',304,160,448,232,'speed',140,'SPEED')];if(n==='Minimal')t.pages[0].widgets.forEach(w=>{if(w.type==='number')w.variant='plain';});return t;}
function validate(s){
 const fail=m=>{throw Error(m);};if(!s||s.version!==2||s.kind!=='MetersSetup'||!Array.isArray(s.themes)||!s.themes.length||s.themes.length>8)fail('A project needs 1–8 themes');
 if(JSON.stringify(s).length>8*1024*1024)fail('Project exceeds 8 MiB');const defs=clone(s);defs.assets={};if(JSON.stringify(defs).length>262144)fail('Design definitions exceed 256 KiB');
 const assets=s.assets||{};if(Object.keys(assets).length>3)fail('Maximum three images');for(const a of Object.values(assets)){if(!a||typeof a.data!=='string'||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(a.data)||a.data.length>2097152)fail('Invalid image asset');}
 const projection=clone(s);projection.version=1;projection.themes=[];projection.assets={};legacy.validate(projection);
 const ids=new Set();for(const t of s.themes){if(t.version!==2||!/^custom-[a-z0-9-]+$/.test(t.id)||ids.has(t.id)||typeof t.name!=='string'||t.name.length>80||!t.pages.length||t.pages.length>8)fail('Invalid theme');ids.add(t.id);
 for(const b of [t.background,...t.pages.map(p=>p.background).filter(Boolean)]){if(!b||!['solid','linear','radial','grid','carbon','noise','image'].includes(b.kind)||!/^#[0-9a-f]{6}$/i.test(b.color)||!/^#[0-9a-f]{6}$/i.test(b.color2)||!['cover','contain'].includes(b.fit))fail('Invalid background');for(const k of ['opacity','dim','x','y'])if(!Number.isFinite(b[k])||b[k]<0||b[k]>1)fail('Invalid background '+k);if(b.kind==='image'&&!assets[b.asset])fail('Missing background image');}
 for(const style of [t.style,...t.pages.flatMap(p=>p.widgets)]){if(style.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(style.color))fail('Invalid color');if(style.font!==undefined&&!['Arial','MO Chakra','MO Mono'].includes(style.font))fail('Invalid font');if(style.effect!==undefined&&!['flat','raised','inset','neon'].includes(style.effect))fail('Invalid effect');if(style.intensity!==undefined&&(!Number.isFinite(style.intensity)||style.intensity<0||style.intensity>1))fail('Invalid intensity');}
 for(const p of t.pages){if(typeof p.name!=='string'||p.name.length>80||p.widgets.length>24)fail('Invalid page');for(const w of p.widgets){if(!registry[w.type]||!registry[w.type].variants.includes(w.variant))fail('Invalid widget variant');if(!['label','shape'].includes(w.type)&&!legacy.signals.includes(w.signal))fail('Invalid signal');for(const k of ['x','y','w','h','size','min','max','segments','gap','thickness','sweep','ticks','threshold','window','decimals'])if(!Number.isFinite(w[k]))fail('Invalid '+k);if(w.x<0||w.y<0||w.w<8||w.h<8||w.x+w.w>800||w.y+w.h>480||w.size<8||w.size>280||w.max<=w.min||w.segments<1||w.segments>80||w.gap<0||w.gap>30||w.thickness<1||w.thickness>50||w.sweep<30||w.sweep>360||w.ticks<0||w.ticks>24||w.window<1||w.window>120||w.decimals<0||w.decimals>3||typeof w.label!=='string'||w.label.length>80)fail('Widget settings out of range');}}
 }return s;
}
W.StudioModel={registry,names,clone,widget,migrate,defaults,starter,validate};
})(window);
