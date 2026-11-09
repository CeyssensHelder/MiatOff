/* GPL-3.0-or-later. Signal semantics and layout assistance for the standalone studio. */
(function(W) {
'use strict';
const definitions = {
 speed: {label:'SPEED',min:0,max:260,decimals:0,ticks:13,imperialMax:160},
 rpm: {label:'ENGINE RPM',min:0,max:8000,decimals:0,ticks:8},
 gear: {label:'GEAR',min:0,max:6,decimals:0,ticks:6},
 coolant: {label:'COOLANT',min:40,max:140,decimals:0,ticks:5,threshold:105,direction:'above'},
 iat: {label:'INTAKE AIR',min:-20,max:100,decimals:0,ticks:6},
 outside: {label:'OUTSIDE',min:-20,max:50,decimals:1,ticks:7},
 fuel: {label:'FUEL',min:0,max:100,decimals:0,ticks:5,threshold:15,direction:'below'},
 trip: {label:'TRIP',min:0,max:500,decimals:1,ticks:5},
 consumption: {label:'CONSUMPTION',min:0,max:20,decimals:1,ticks:5},
 gLat: {label:'LATERAL G',min:-2,max:2,decimals:2,ticks:4},
 gLong: {label:'LONGITUDINAL G',min:-2,max:2,decimals:2,ticks:4},
 throttle: {label:'THROTTLE',min:0,max:100,decimals:0,ticks:5},
 power: {label:'POWER',min:0,max:200,decimals:0,ticks:5},
 torque: {label:'TORQUE',min:0,max:250,decimals:0,ticks:5}
};
function value(n,signal,vehicle) {
 const v=W.MeterDesigner.value(n,signal,vehicle);
 if(signal==='rpm')v.unit='rpm';
 if(signal==='fuel'||signal==='throttle')v.unit='%';
 if(signal==='gLat'||signal==='gLong')v.unit='g';
 if(['coolant','iat','outside'].includes(signal))v.unit='°'+vehicle.units.temperature;
 return v;
}
function canonical(n,signal,vehicle) {
 const zero=value(0,signal,vehicle).n,one=value(1,signal,vehicle).n;
 if(signal==='consumption'&&vehicle.units.consumption!=='L/100km')return n>0?(vehicle.units.consumption==='mpg UK'?282.480936:235.214583)/n:null;
 return (n-zero)/(one-zero);
}
function config(signal,vehicle) {
 const d=Object.assign({},definitions[signal]);
 if(signal==='rpm'){d.max=vehicle.rpm.max;d.ticks=Math.max(1,Math.min(16,Math.round(d.max/1000)));}
 if(signal==='speed'&&vehicle.units.speed==='mph'){d.max=canonical(160,signal,vehicle);d.ticks=8;}
 if(signal==='consumption'&&vehicle.units.consumption!=='L/100km'){d.min=0;d.max=80;d.displayRange=true;d.ticks=8;}
 return d;
}
function bind(w,signal,vehicle) {
 const d=config(signal,vehicle);w.signal=signal;w.label=d.label;w.autoScale=true;w.min=d.min;w.max=d.max;w.decimals=d.decimals;w.ticks=d.ticks;
 if(d.threshold!==undefined){w.threshold=d.threshold;w.direction=d.direction;}else if(w.type==='warning'){w.threshold=d.max*.9;w.direction='above';}
}
function range(w,vehicle) {
 const d=w.autoScale?config(w.signal,vehicle):w;
 // Range for consumption in mpg is defined in display units because conversion is reciprocal.
 if(d.displayRange)return {min:d.min,max:d.max};
 const a=value(d.min,w.signal,vehicle).n,b=value(d.max,w.signal,vehicle).n;
 if(a===null||b===null)return {min:0,max:80};return {min:Math.min(a,b),max:Math.max(a,b)};
}
function overlaps(widgets) {
 const hits=[];for(let i=0;i<widgets.length;i++)for(let j=i+1;j<widgets.length;j++){
 const a=widgets[i],b=widgets[j];if(a.hidden||b.hidden||a.type==='shape'||b.type==='shape'||a.allowOverlap||b.allowOverlap)continue;
 if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1)hits.push([i,j]);
 }return hits;
}
function place(w,widgets) {
 for(let y=0;y+w.h<=480;y+=8)for(let x=0;x+w.w<=800;x+=8){const candidate=Object.assign({},w,{x,y});if(!overlaps(widgets.concat(candidate)).some(pair=>pair[1]===widgets.length)){w.x=x;w.y=y;return true;}}
 return false;
}
W.StudioSignals={definitions,value,canonical,config,bind,range,overlaps,place};
})(window);
