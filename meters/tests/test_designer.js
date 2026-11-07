/* GPL-3.0-or-later */
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('meters/js/designer-runtime.js','utf8'),context);const M=context.window.MeterDesigner;
const clone=x=>JSON.parse(JSON.stringify(x));
let setup=clone(M.defaults());assert.equal(M.validate(setup),setup);
assert(Math.abs(M.value(100,'speed',{units:{speed:'mph'}}).n-62.1371192)<1e-6);
assert.equal(M.value(0,'coolant',{units:{temperature:'F'}}).n,32);
assert.equal(M.value(0,'consumption',{units:{consumption:'mpg US'}}).n,null);
assert(Math.abs(M.value(10,'consumption',{units:{consumption:'mpg UK'}}).n-28.2480936)<1e-6);
for(const change of [s=>s.version=2,s=>s.vehicle.rpm.shift=99999,s=>s.vehicle.eff=2,s=>s.vehicle.ratios=[0],s=>s.vehicle.mass=Infinity]){let s=clone(setup);change(s);assert.throws(()=>M.validate(s));}
const widget={type:'number',signal:'speed',x:0,y:0,w:240,h:160,min:0,max:260,size:60,color:'#ffffff',font:'Arial',label:'SPEED'};
setup.themes=[{version:1,kind:'ThemeDocument',id:'custom-test',name:'Test',author:'',palette:{},pages:[{name:'Drive',widgets:[widget]}]}];
M.validate(setup);M.validate(clone(setup));
for(const change of [w=>w.signal='eval',w=>w.x=799,w=>w.font='url(evil)',w=>w.color='red',w=>w.size=NaN]){let s=clone(setup);change(s.themes[0].pages[0].widgets[0]);assert.throws(()=>M.validate(s));}
let calls=0;const canvas=new Proxy({},{get:(o,k)=>k==='measureText'?()=>({width:10}):()=>{calls++;},set:()=>true});
for(const type of M.types){widget.type=type;M.draw(canvas,setup.themes[0].pages[0],{speed:100,rpm:5000},setup.vehicle);}assert(calls>20);
const src=fs.readFileSync('meters/js/designer-runtime.js','utf8');assert(!/\b(const|let)\s|=>|`/.test(src));
console.log('Designer validation, conversions, renderer and ES5 checks passed');
