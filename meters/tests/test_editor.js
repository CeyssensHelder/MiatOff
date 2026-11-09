/* Standalone editor behavior with DOM/file/storage boundaries. GPL-3.0-or-later. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
class Element {
    constructor(tag='div') { this.tag=tag;this.value='';this.children=[];this.files=[];this.checked=false; }
    append(e) { this.children.push(e); }
    add(e) { this.children.push(e);if(this.children.length===1)this.value=e.value; }
    replaceChildren() { this.children=[]; }
    setAttribute(k,v) { this[k]=v; }
    getBoundingClientRect() { return {left:0,top:0,width:800,height:480}; }
    setPointerCapture() {}
    click() { if(this.onclick)this.onclick(); }
    getContext() { return new Proxy({}, {get:()=>()=>{},set:()=>true}); }
}
const elements={};const storage={};let exported;
const document={getElementById:id=>elements[id]||(elements[id]=new Element()),createElement:tag=>new Element(tag)};
const context={window:{},document,Option:class{constructor(text,value){this.text=text;this.value=value;}},
localStorage:{getItem:k=>storage[k],setItem:(k,v)=>storage[k]=v},
Blob:class{constructor(parts){exported=JSON.parse(parts.join(''));}},
URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},setTimeout:()=>{},requestAnimationFrame:()=>{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('meters/js/designer-runtime.js','utf8'),context);
vm.runInContext(fs.readFileSync('meters/designer/editor.js','utf8'),context);
const click=id=>elements[id].onclick();const draft=()=>JSON.parse(storage['miatoff.designer.v1']);
async function importDoc(doc){elements.file.files=[{size:JSON.stringify(doc).length,text:async()=>JSON.stringify(doc)}];await elements.file.onchange();}
(async()=>{
assert.equal(draft().themes[0].pages[0].widgets.length,4);
click('pageadd');assert.equal(draft().themes[0].pages.length,2);
click('undo');assert.equal(draft().themes[0].pages.length,1);
click('redo');assert.equal(draft().themes[0].pages.length,2);
elements.pages.value='1';elements.pages.onchange();elements.types.value='gmeter';click('add');assert.equal(draft().themes[0].pages[1].widgets[0].type,'gmeter');
click('duplicate');assert.equal(draft().themes[0].pages[1].widgets.length,2);
click('delete');assert.equal(draft().themes[0].pages[1].widgets.length,1);
click('theme');assert.equal(exported.kind,'ThemeDocument');assert(!exported.vehicle);
const theme=exported;const vehicle=JSON.stringify(draft().vehicle);
await importDoc(theme);assert.equal(JSON.stringify(draft().vehicle),vehicle);
assert.equal(draft().initialTheme,theme.id);
const before=JSON.stringify(draft());await importDoc({kind:'MetersSetup',version:999});assert.equal(JSON.stringify(draft()),before);assert.equal(elements.status.className,'error');
const empty=JSON.parse(before);empty.themes=[];await importDoc(empty);assert.equal(JSON.stringify(draft()),before);
click('setup');assert.equal(exported.kind,'MetersSetup');assert(exported.vehicle);
await importDoc(exported);assert.equal(JSON.stringify(draft().vehicle),vehicle);
click('street');const c=elements.canvas;c.onpointerdown({button:0,clientX:100,clientY:100,pointerId:1});c.onpointermove({clientX:132,clientY:116});c.onpointerup();assert.equal(draft().themes[0].pages[0].widgets[0].x,56);assert.equal(draft().themes[0].pages[0].widgets[0].y,72);
console.log('Editor pages, history, widgets, import/export, failed imports and dragging passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
