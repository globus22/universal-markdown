(() => {
'use strict';
const $ = id => document.getElementById(id);
const state = {items:[],active:null,drag:null,renderToken:0};
const defaults = () => ({rotate:0,flipX:false,flipY:false,crop:null,ratio:'none',width:null,height:null,lock:true,format:'image/jpeg',quality:90,matte:'#ffffff',brightness:100,contrast:100,saturate:100,grayscale:0,sepia:0,blur:0,watermark:'',watermarkPosition:'br',watermarkSize:3,watermarkOpacity:65});
const types = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'};
const human = n => n < 1024 ? n+' B' : n < 1048576 ? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(2)+' MB';
const nameOnly = name => name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'_');
let noticeTimer;
function notice(message,error=false) {let node=$('status'); node.textContent=message;node.className='notice show '+(error?'error':'info');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>node.className='notice',9000);}
const item = () => state.items.find(x=>x.id===state.active);
const bounds = x => x.s.rotate % 180===0 ? [x.bitmap.width,x.bitmap.height] : [x.bitmap.height,x.bitmap.width];
function outputDims(x) {
 const [w,h]=bounds(x);const c=x.s.crop||{x:0,y:0,w:1,h:1};
 const cw=Math.max(1,Math.round(w*c.w)),ch=Math.max(1,Math.round(h*c.h));
 let ow=x.s.width||cw,oh=x.s.height||ch;
 return [Math.max(1,Math.min(12000,Math.round(ow))),Math.max(1,Math.min(12000,Math.round(oh)))];
}
function resetDimensions(x){const [w,h]=bounds(x);const c=x.s.crop||{w:1,h:1};x.s.width=Math.max(1,Math.round(w*c.w));x.s.height=Math.max(1,Math.round(h*c.h));}
function filterOf(s){return 'brightness('+s.brightness+'%) contrast('+s.contrast+'%) saturate('+s.saturate+'%) grayscale('+s.grayscale+'%) sepia('+s.sepia+'%) blur('+s.blur+'px)';}
function drawPhoto(x,context,w,h,applyFilters=true) {
 const src=x.bitmap,s=x.s;
 context.save();context.translate(w/2,h/2);context.rotate(s.rotate*Math.PI/180);context.scale(s.flipX?-1:1,s.flipY?-1:1);
 const [rw,rh]=bounds(x),scaleX=w/rw,scaleY=h/rh;
 // Draw inside the *rotated output space*: the scaled source has its axes swapped at 90/270 degrees.
 const sx = s.rotate%180===0 ? scaleX : scaleY, sy=s.rotate%180===0?scaleY:scaleX;
 context.filter=applyFilters?filterOf(s):'none';
 context.drawImage(src,-src.width*sx/2,-src.height*sy/2,src.width*sx,src.height*sy);
 context.restore();context.filter='none';
}
function cropRect(x){return x.s.crop||{x:0,y:0,w:1,h:1};}
function watermark(ctx,w,h,s){
 if(!s.watermark.trim()) return;
 ctx.save();ctx.globalAlpha=s.watermarkOpacity/100;const fontSize=Math.max(10,Math.round(w*s.watermarkSize/100));
 ctx.font='700 '+fontSize+'px sans-serif';ctx.textBaseline='middle';
 const pad=Math.max(8,Math.round(fontSize*.7));const text=s.watermark.trim();
 const measured=ctx.measureText(text).width;
 let xx=w-pad-measured,yy=h-pad-fontSize/2;
 if(s.watermarkPosition==='bl'){xx=pad;}
 if(s.watermarkPosition==='tr'){yy=pad+fontSize/2;}
 if(s.watermarkPosition==='tl'){xx=pad;yy=pad+fontSize/2;}
 if(s.watermarkPosition==='center'){xx=(w-measured)/2;yy=h/2;}
 ctx.lineJoin='round';ctx.strokeStyle='#000';ctx.lineWidth=Math.max(2,fontSize/8);ctx.strokeText(text,xx,yy,Math.max(1,w-pad*2));
 ctx.fillStyle='#fff';ctx.fillText(text,xx,yy,Math.max(1,w-pad*2));ctx.restore();
}
function composite(x,preview=false){
 const [rw,rh]=bounds(x),c=cropRect(x);
 const [ow,oh]=preview?[Math.max(1,Math.round(rw*c.w)),Math.max(1,Math.round(rh*c.h))]:outputDims(x);
 const canvas=document.createElement('canvas');canvas.width=ow;canvas.height=oh;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas недоступен');
 const s=x.s;
 if(s.format==='image/jpeg'){ctx.fillStyle=s.matte;ctx.fillRect(0,0,ow,oh);}
 const sw=rw*c.w,sh=rh*c.h;
 // Render entire rotated bitmap to intermediate before cropping and rescaling.
 const temp=document.createElement('canvas');temp.width=rw;temp.height=rh;
 const tc=temp.getContext('2d');drawPhoto(x,tc,rw,rh,true);
 ctx.drawImage(temp,Math.max(0,c.x*rw),Math.max(0,c.y*rh),sw,sh,0,0,ow,oh);
 watermark(ctx,ow,oh,s);
 return canvas;
}
function serialize(canvas,mime,quality){
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Браузер не смог экспортировать изображение')),mime,quality/100));
}
async function exported(x,override=null){
 const canvas=composite(x);
 const mime=override||x.s.format;
 const blob=await serialize(canvas,mime,x.s.quality);
 if(blob.type!==mime)throw Error('Этот браузер не поддерживает экспорт '+mime+'. Выберите PNG, JPG или WebP.');
 return blob;
}
function readMetadata(bytes,fileType){
 // Heuristic only: presence of recognizable metadata payloads, not a full parser.
 const data=new Uint8Array(bytes);
 const max=Math.min(data.length,3*1024*1024);
 let found=[];
 if(fileType==='image/jpeg'){
  for(let i=2;i<max-8;){
   if(data[i]!==255)break;
   const marker=data[i+1];
   if(marker===0xda||marker===0xd9)break;
   if(marker===0x01||marker===0xd8){i+=2;continue;}
   const length=(data[i+2]<<8)|data[i+3];if(length<2)break;
   if(marker===0xe1){const header=String.fromCharCode(...data.slice(i+4,Math.min(i+30,data.length)));if(header.startsWith('Exif'))found.push('EXIF (может содержать GPS)');else if(header.includes('http://ns.adobe.com/xap'))found.push('XMP');else found.push('APP1');}
   if(marker===0xe2)found.push('APP2 / ICC');
   if(marker===0xed)found.push('IPTC / APP13');
   if(marker===0xfe)found.push('Комментарий JPEG');
   i+=length+2;
  }
 }else if(fileType==='image/png'){
  let p=8;
  while(p+12<max){const length=(data[p]*16777216+data[p+1]*65536+data[p+2]*256+data[p+3])>>>0;
   const tag=String.fromCharCode(...data.slice(p+4,p+8));
   if(['eXIf','tEXt','iTXt','zTXt','iCCP','tIME'].includes(tag))found.push(tag);
   if(tag==='IEND'||length>max)break;p+=12+length;
  }
 }else if(fileType==='image/webp'){
  const header=new TextDecoder('latin1').decode(data.slice(0,Math.min(max,1024)));
  if(header.includes('EXIF'))found.push('EXIF');if(header.includes('XMP '))found.push('XMP');if(header.includes('ICCP'))found.push('ICC');
 }
 return [...new Set(found)];
}
async function addFiles(files){
 let accepted=0;
 for(const file of files){
  if(!file.type.startsWith('image/')&&!/\.(heic|heif|avif)$/i.test(file.name)){notice('Пропущен неподдерживаемый файл: '+file.name,true);continue;}
  try{
   const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
   if(bitmap.width*bitmap.height>110000000){bitmap.close();throw Error('Слишком большое изображение');}
   const bytes=await file.slice(0,Math.min(file.size,3*1024*1024)).arrayBuffer();
   const metadata=readMetadata(bytes,file.type);
   const url=URL.createObjectURL(file);
   const x={id:Math.random().toString(36).slice(2),file,bitmap,url,metadata,s:defaults()};
   resetDimensions(x);state.items.push(x);accepted++;
   if(!state.active)state.active=x.id;
  }catch(e){notice('Не удалось открыть '+file.name+': '+e.message,true);}
 }
 if(accepted){renderStrip();activate(state.active);notice('Добавлено фотографий: '+accepted+'. Файлы не покидают браузер.');}
}
function renderStrip(){
 const strip=$('fileStrip');strip.replaceChildren();
 state.items.forEach(x=>{
  const b=document.createElement('button');b.type='button';b.className='photo-thumb'+(x.id===state.active?' selected':'');b.setAttribute('role','listitem');
  const img=document.createElement('img');img.src=x.url;img.alt='';
  const label=document.createElement('span');label.textContent=x.file.name;b.title=x.file.name;
  b.append(img,label);b.onclick=()=>activate(x.id);strip.append(b);
 });
 $('workspace').classList.toggle('hidden',!state.items.length);
 $('filesCount').textContent=state.items.length+' фото';
}
function activate(id){
 state.active=id;const x=item();if(!x)return;
 renderStrip();syncControls(x);$('activeName').textContent=x.file.name;
 $('activeSub').textContent=x.bitmap.width+' × '+x.bitmap.height+' px · '+human(x.file.size);
 $('originalInfo').textContent=x.file.type.replace('image/','').toUpperCase()+' · '+human(x.file.size);
 $('metadataInfo').textContent=x.metadata.length?x.metadata.join(', '):'Не обнаружены*';
 $('exportInfo').textContent=outputDims(x).join(' × ')+' px · '+(types[x.s.format]||'—').toUpperCase();
 renderPreview();
}
const fields=['cropRatio','outWidth','outHeight','lockRatio','outFormat','quality','matteColor','brightness','contrast','saturate','grayscale','sepia','blur','watermark','watermarkPosition','watermarkSize','watermarkOpacity'];
const map={cropRatio:'ratio',outWidth:'width',outHeight:'height',lockRatio:'lock',outFormat:'format',matteColor:'matte'};
function syncControls(x){
 for(const id of fields){const v=x.s[map[id]||id];if($(id).type==='checkbox')$(id).checked=!!v;else $(id).value=v??'';}
 $('sizePreset').value='original';
 for(const id of ['quality','brightness','contrast','saturate','grayscale','sepia','blur','watermarkOpacity'])
  $(id+'Value').textContent=$(id).value+(id==='blur'?' px':'%');
}
let renderQueued=false;
function renderPreview(){
 if(renderQueued)return;renderQueued=true;
 requestAnimationFrame(()=>{renderQueued=false;const x=item();if(!x)return;
 const canvas=$('previewCanvas'),stage=$('previewStage'),[w,h]=bounds(x);
 const available=Math.max(250,stage.clientWidth-48),maxHeight=490;
 const k=Math.min(available/w,maxHeight/h,1.5);
 canvas.width=Math.max(1,Math.round(w*k));canvas.height=Math.max(1,Math.round(h*k));
 const ctx=canvas.getContext('2d');drawPhoto(x,ctx,canvas.width,canvas.height);
 const c=cropRect(x);if(x.s.crop||x.s.ratio!=='none'){
  ctx.fillStyle='rgba(10,22,15,.37)';
  const xx=c.x*canvas.width,yy=c.y*canvas.height,ww=c.w*canvas.width,hh=c.h*canvas.height;
  ctx.fillRect(0,0,canvas.width,yy);ctx.fillRect(0,yy,xx,hh);ctx.fillRect(xx+ww,yy,canvas.width-xx-ww,hh);ctx.fillRect(0,yy+hh,canvas.width,canvas.height-yy-hh);
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.strokeRect(xx,yy,ww,hh);ctx.setLineDash([]);
 }
 $('emptyPreview').classList.add('hidden');
 $('exportInfo').textContent=outputDims(x).join(' × ')+' px · '+types[x.s.format].toUpperCase();
 });
}
function changed(){
 const x=item();if(!x)return;
 for(const id of ['quality','brightness','contrast','saturate','grayscale','sepia','blur','watermarkOpacity'])
  $(id+'Value').textContent=$(id).value+(id==='blur'?' px':'%');
 renderPreview();
}
for(const id of fields){
 const el=$(id);el.addEventListener(id==='watermark'?'input':'change',()=>{
  const x=item();if(!x)return;let val=el.type==='checkbox'?el.checked:el.value;
  if(['outWidth','outHeight','quality','brightness','contrast','saturate','grayscale','sepia','blur','watermarkSize','watermarkOpacity'].includes(id))val=Number(val);
  const key=map[id]||id;
  if(id==='cropRatio'){x.s.crop=null;x.s.ratio=val;resetDimensions(x);}
  else if(id==='outWidth'||id==='outHeight'){
   if(!Number.isFinite(val)||val<1||val>12000){syncControls(x);notice('Размер должен быть от 1 до 12000 px.',true);return;}
   const [ow,oh]=outputDims(x);
   x.s[key]=val;
   if(x.s.lock){const ratio=ow/oh;if(id==='outWidth')x.s.height=Math.max(1,Math.min(12000,Math.round(val/ratio)));else x.s.width=Math.max(1,Math.min(12000,Math.round(val*ratio)));}
  }else x.s[key]=val;
  if(id==='outFormat'&&val==='image/avif'){/* unsupported formats will error on export */}
  syncControls(x);changed();
 });
 el.addEventListener('input',()=>{if(el.type==='range'){const x=item();if(x){x.s[map[id]||id]=Number(el.value);changed();}}});
}
$('sizePreset').onchange=()=>{
 const x=item();if(!x)return;resetDimensions(x);
 if($('sizePreset').value!=='original'){
  const max=Number($('sizePreset').value),long=Math.max(x.s.width,x.s.height);
  if(long>max){const k=max/long;x.s.width=Math.max(1,Math.round(x.s.width*k));x.s.height=Math.max(1,Math.round(x.s.height*k));}
 }
 syncControls(x);changed();
};
function transform(fn){const x=item();if(!x)return;fn(x.s);resetDimensions(x);syncControls(x);renderPreview();}
$('rotateLeft').onclick=()=>transform(s=>{s.rotate=(s.rotate+270)%360;s.crop=null;});
$('rotateRight').onclick=()=>transform(s=>{s.rotate=(s.rotate+90)%360;s.crop=null;});
$('flipX').onclick=()=>transform(s=>s.flipX=!s.flipX);
$('flipY').onclick=()=>transform(s=>s.flipY=!s.flipY);
$('resetCrop').onclick=()=>transform(s=>{s.crop=null;s.ratio='none';});
$('resetBtn').onclick=()=>{const x=item();if(!x)return;x.s=defaults();resetDimensions(x);activate(x.id);};
function coord(e,canvas){
 const rect=canvas.getBoundingClientRect();
 return {x:Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width)),y:Math.min(1,Math.max(0,(e.clientY-rect.top)/rect.height))};
}
function selection(a,b,ratio,rw,rh){
 let x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
 let w=Math.abs(a.x-b.x),h=Math.abs(a.y-b.y);
 if(ratio&&ratio!=='free'&&ratio!=='none'){
  const real=Number(ratio)*rh/rw;
  if(w/h>real)w=h*real;else h=w/real;
  x=b.x>=a.x?a.x:a.x-w;y=b.y>=a.y?a.y:a.y-h;
 }
 x=Math.max(0,Math.min(1-w,x));y=Math.max(0,Math.min(1-h,y));
 return {x,y,w,h};
}
const canvas=$('previewCanvas');
canvas.addEventListener('pointerdown',e=>{
 const x=item();if(!x)return;
 if(x.s.ratio==='none'){x.s.ratio='free';$('cropRatio').value='free';}
 state.drag={id:e.pointerId,start:coord(e,canvas)};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
 const x=item();if(!x||!state.drag||state.drag.id!==e.pointerId)return;
 const [rw,rh]=bounds(x);const c=selection(state.drag.start,coord(e,canvas),x.s.ratio,rw,rh);
 if(c.w<.005||c.h<.005)return;x.s.crop=c;renderPreview();
});
canvas.addEventListener('pointerup',e=>{
 const x=item();if(!x||!state.drag)return;state.drag=null;
 if(x.s.crop){resetDimensions(x);syncControls(x);renderPreview();}
});
canvas.addEventListener('pointercancel',()=>state.drag=null);
$('pickBtn').onclick=()=>$('fileInput').click();
$('fileInput').onchange=e=>{addFiles([...e.target.files]);e.target.value='';};
const drop=$('dropZone');
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragging');});
drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');addFiles([...e.dataTransfer.files]);});
$('clearBtn').onclick=()=>{
 for(const x of state.items){URL.revokeObjectURL(x.url);x.bitmap.close();}
 state.items=[];state.active=null;renderStrip();$('emptyPreview').classList.remove('hidden');notice('Список очищен.');
};
function saveBlob(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
}
function filename(x,blob){return nameOnly(x.file.name)+'_clean.'+(types[blob.type]||'png');}
async function busy(btn,work){
 const before=btn.textContent;btn.disabled=true;btn.textContent='Обработка…';
 try{await work();}catch(e){notice(e.message,true);}finally{btn.disabled=false;btn.textContent=before;}
}
$('downloadBtn').onclick=()=>busy($('downloadBtn'),async()=>{
 const x=item();if(!x)return;const blob=await exported(x);saveBlob(blob,filename(x,blob));notice('Готово. Экспортированный файл создан без копирования исходных метаданных.');
});
$('copyBtn').onclick=()=>busy($('copyBtn'),async()=>{
 const x=item();if(!x)return;if(!navigator.clipboard?.write)throw Error('Копирование не поддерживается в этом браузере');
 const blob=await exported(x,'image/png');await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);notice('PNG скопирован в буфер обмена.');
});
$('downloadAll').onclick=()=>busy($('downloadAll'),async()=>{
 if(!state.items.length)return;if(!window.JSZip)throw Error('Библиотека ZIP не загрузилась. Проверьте интернет.');
 const zip=new JSZip();const used=new Set();
 for(let i=0;i<state.items.length;i++){
  const x=state.items[i],blob=await exported(x);let name=filename(x,blob),n=2;
  while(used.has(name)){name=nameOnly(x.file.name)+'_clean_'+n+++'.'+types[blob.type];}
  used.add(name);zip.file(name,blob);notice('Экспорт '+(i+1)+' из '+state.items.length+'…');
 }
 const result=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});
 saveBlob(result,'photo-studio-clean.zip');notice('ZIP готов: '+state.items.length+' фотографий.');
});
$('applyAll').onclick=()=>{
 const x=item();if(!x)return;const s=x.s;
 for(const target of state.items)if(target!==x){
  for(const key of ['format','quality','matte','brightness','contrast','saturate','grayscale','sepia','blur','watermark','watermarkPosition','watermarkSize','watermarkOpacity'])target.s[key]=s[key];
 }
 notice('Цветокоррекция и настройки экспорта применены ко всем. Кадрирование и размеры оставлены индивидуальными.');
};
})();