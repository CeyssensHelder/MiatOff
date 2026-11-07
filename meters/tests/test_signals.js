/* GPL-3.0-or-later. Semantic signal scaling and collision behavior. */
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const box={window:{}};vm.createContext(box);for(const f of ['meters/js/designer-runtime.js','meters/designer/signals.js','meters/designer/model.js'])vm.runInContext(fs.readFileSync(f,'utf8'),box);
const M=box.window.StudioModel,S=box.window.StudioSignals,v=M.defaults().vehicle,w=M.widget('radial');
S.bind(w,'speed',v);assert.equal(w.max,260);assert.equal(w.label,'SPEED');assert.equal(w.decimals,0);assert.equal(S.value(90,'speed',v).unit,'km/h');
const geometry=[w.x,w.y,w.w,w.h,w.variant];v.units.speed='mph';assert.equal(S.range(w,v).max,160);assert.deepEqual([w.x,w.y,w.w,w.h,w.variant],geometry);
S.bind(w,'fuel',v);assert.equal(w.max,100);assert.equal(w.threshold,15);assert.equal(w.direction,'below');assert.equal(S.value(80,'fuel',v).unit,'%');
S.bind(w,'gLat',v);assert.equal(w.min,-2);assert.equal(w.decimals,2);
S.bind(w,'coolant',v);assert.equal(w.threshold,105);v.units.temperature='F';assert.equal(S.value(100,'coolant',v).n,212);assert(Math.abs(S.canonical(212,'coolant',v)-100)<1e-9);
S.bind(w,'rpm',v);v.rpm.max=9000;assert.equal(S.range(w,v).max,9000);w.autoScale=false;w.min=0;w.max=4000;assert.equal(S.range(w,v).max,4000);
S.bind(w,'consumption',v);v.units.consumption='mpg US';assert.equal(S.range(w,v).max,80);assert.equal(S.value(0,'consumption',v).n,null);
const a=Object.assign(M.widget('number'),{x:0,y:0,w:200,h:100}),b=Object.assign(M.widget('number'),{x:100,y:20,w:200,h:100});assert.equal(S.overlaps([a,b]).length,1);b.hidden=true;assert.equal(S.overlaps([a,b]).length,0);b.hidden=false;b.allowOverlap=true;assert.equal(S.overlaps([a,b]).length,0);b.allowOverlap=false;assert(S.place(b,[a]));assert.equal(S.overlaps([a,b]).length,0);const huge=Object.assign(M.widget('number'),{w:800,h:480});assert.equal(S.place(huge,[a]),false);
for(const name of M.names)for(const page of M.starter(name).pages)assert.equal(S.overlaps(page.widgets).length,0,name+' '+page.name);
console.log('Signal changes, metric/imperial ranges, custom scales, thresholds, placement and all starter layouts passed');
