const assert=require('assert'),fs=require('fs'),vm=require('vm');
const box={window:{}};vm.createContext(box);for(const f of ['meters/js/designer-runtime.js','meters/designer/model.js'])vm.runInContext(fs.readFileSync(f,'utf8'),box);
const M=box.window.StudioModel;
const setup=M.defaults();setup.themes=[M.starter('Neon')];M.validate(setup);
for(const name of M.names){const s=M.defaults();s.themes=[M.starter(name)];M.validate(s);assert.equal(s.themes[0].pages.length,2);}
for(const [type,def]of Object.entries(M.registry))for(const variant of def.variants){const s=M.defaults();s.themes=[M.starter('Street')];s.themes[0].pages[0].widgets=[M.widget(type,variant)];M.validate(s);}
for(const mutate of [s=>s.version=3,s=>s.themes[0].pages[0].widgets[0].variant='unknown',s=>s.themes[0].style.intensity=2,s=>s.themes[0].background.kind='url',s=>s.assets={bad:{data:'javascript:alert(1)'}}]){const s=M.clone(setup);mutate(s);assert.throws(()=>M.validate(s));}
const legacy=box.window.MeterDesigner.defaults();legacy.themes=[{version:1,kind:'ThemeDocument',id:'custom-test',name:'Old',pages:[{name:'Drive',widgets:[{type:'radial',signal:'rpm',x:0,y:0,w:300,h:300,min:0,max:8000,size:60,color:'#ffffff',font:'Arial',label:'RPM'}]}]}];const migrated=M.migrate(legacy);M.validate(migrated);assert.equal(migrated.themes[0].pages[0].widgets[0].color,'#ffffff');assert.equal(migrated.themes[0].style.effect,'flat');assert.deepEqual(JSON.parse(JSON.stringify(migrated.vehicle)),JSON.parse(JSON.stringify(legacy.vehicle)));
console.log('Studio starters, all variants, validation and v1 migration passed');

const assetProject=M.clone(setup);assetProject.assets={image:{data:'data:image/png;base64,'+'A'.repeat(400000)}};M.validate(assetProject);console.log('Image payload is independent of design-definition size limit');
