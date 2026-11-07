/* GPL-3.0-or-later. Local image normalization and durable drafts. */
window.StudioAssets={
 async image(file){
  if(!['image/png','image/jpeg'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a PNG/JPEG under 10 MiB');
  const bytes=new Uint8Array(await file.arrayBuffer());let width=0,height=0;
  if(file.type==='image/png'){const d=new DataView(bytes.buffer);width=d.getUint32(16);height=d.getUint32(20);}else{for(let i=2;i<bytes.length-9;){if(bytes[i]!==255){i++;continue;}const marker=bytes[i+1],len=(bytes[i+2]<<8)|bytes[i+3];if([192,193,194].includes(marker)){height=(bytes[i+5]<<8)|bytes[i+6];width=(bytes[i+7]<<8)|bytes[i+8];break;}if(len<2)break;i+=2+len;}}
  if(!width||!height||width*height>16000000)throw Error('Image must be decodable and at most 16 megapixels');
  const bitmap=await createImageBitmap(file),scale=Math.min(1,800/bitmap.width,480/bitmap.height),c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();const data=c.toDataURL('image/png');if(data.length>2097152)throw Error('Normalized image exceeds 1.5 MiB');return {data,width:c.width,height:c.height};
 },
 async db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('miatoff-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
 async load(){const db=await this.db();return new Promise((resolve,reject)=>{const t=db.transaction('drafts'),r=t.objectStore('drafts').get('project');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);t.oncomplete=()=>db.close();});},
 async save(s){const db=await this.db();return new Promise((resolve,reject)=>{const t=db.transaction('drafts','readwrite');t.objectStore('drafts').put(s,'project');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
};
