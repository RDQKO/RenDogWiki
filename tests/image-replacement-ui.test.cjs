const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { makeLoader } = require('./helpers/load-ts.cjs');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url:'https://wiki.test/manage/image', pretendToBeVisual:true });
for(const key of ['window','document','HTMLElement','Element','Node','Event','MouseEvent','KeyboardEvent','File','FormData']) global[key]=dom.window[key];
Object.defineProperty(global,'navigator',{configurable:true,value:window.navigator});
global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=require('react-dom/test-utils'),{createRoot}=require('react-dom/client'),{renderToString}=require('react-dom/server');
let fetchMock,requests=[],root;
class TestURL extends URL { static createObjectURL(){return 'blob:preview';} static revokeObjectURL(){} }
const load=makeLoader({'next/navigation':{usePathname:()=>'/manage/image',useSearchParams:()=>new URLSearchParams()}},{
  window,document,HTMLElement,Element,Node,File,FormData,URL:TestURL,
  getComputedStyle:window.getComputedStyle.bind(window),fetch:(...args)=>{requests.push(args);return fetchMock(...args);},
});
const Provider=load('app/components/image/ImageReplacementProvider.tsx').default;
const {useRefreshImageReplacements}=load('app/components/image/ImageReplacementProvider.tsx');
const ManagedImage=load('app/components/common/ManagedImage.tsx').default;
const Modal=load('app/components/image/ImageReplaceModal.tsx').default;
const h=React.createElement;
const old='https://rdwiki.s3.ap-southeast-2.amazonaws.com/images/1/old.png';
const next='https://rdwiki.s3.ap-southeast-2.amazonaws.com/images/1/new.webp';
const nextCdn='https://d1y7k8qotewoph.cloudfront.net/images/1/new.webp';
async function mount(element){if(root)await act(async()=>root.unmount());document.body.innerHTML='<div id="root"></div>';root=createRoot(document.getElementById('root'));await act(async()=>root.render(element));}
async function click(element){assert.ok(element);await act(async()=>element.click());}
const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);
const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
after(async()=>{if(root)await act(async()=>root.unmount());dom.window.close();});

test('one manifest updates every displayed managed image while historical previews bypass aliases',async()=>{
  requests=[];fetchMock=async()=>json({aliases:{'images/1/old.png':next}});
  const images=Array.from({length:50},(_,i)=>h(ManagedImage,{key:i,src:old+'?v=old',alt:'live',width:30,height:20}));
  images.push(h(ManagedImage,{key:'history',src:old,alt:'history',resolveReplacements:false}));
  images.push(h(ManagedImage,{key:'local',src:'/images/logo.png',alt:'local'}));
  await mount(h(Provider,null,images));
  assert.equal(requests.length,1);
  for(const img of document.querySelectorAll('img[alt=live]')){assert.equal(img.getAttribute('src'),nextCdn);assert.equal(img.width,30);assert.equal(img.height,20);}
  assert.equal(document.querySelector('img[alt=history]').getAttribute('src'),old);
  assert.equal(document.querySelector('img[alt=local]').getAttribute('src'),'/images/logo.png');
});

test('server-provided aliases produce the same resolved initial image without waiting for a fetch',()=>{
  const html=renderToString(h(Provider,{initialAliases:{'images/1/old.png':next}},h(ManagedImage,{src:old,alt:'initial'})));
  assert.match(html,/new\.webp/);assert.doesNotMatch(html,/old\.png/);
});

test('forced refresh after a replacement waits for an older in-flight manifest then loads the latest one',async()=>{
  requests=[];let finish;
  fetchMock=async()=>new Promise(resolve=>{finish=resolve;});
  function Harness(){const refresh=useRefreshImageReplacements();return h('button',{onClick:()=>void refresh(true)},'갱신');}
  await mount(h(Provider,null,h(Harness),h(ManagedImage,{src:old,alt:'race'})));
  await click(button('갱신'));assert.equal(requests.length,1);
  fetchMock=async()=>json({aliases:{'images/1/old.png':next}});
  await act(async()=>finish(json({aliases:{}})));
  assert.equal(requests.length,2);assert.equal(document.querySelector('img').getAttribute('src'),nextCdn);
});

test('replacement modal keeps actions visible, previews a dropped file, handles a conflict, and sends the refreshed revision',async()=>{
  requests=[];let revision=7,postCount=0,changed=0,closed=0,submitted;
  fetchMock=async(url,options={})=>{
    if(url==='/api/image/replacements')return json({aliases:{}});
    if(options.method==='POST'){
      postCount++;submitted=options.body;
      if(postCount===1){revision=8;return new Response(JSON.stringify({error:'다른 곳에서 변경되었습니다.'}),{status:409});}
      return json({success:true});
    }
    return json({image:{id:1,name:'원본',url:old,s3_key:'images/1/old.png',revision},versions:[]});
  };
  await mount(h(Provider,null,h(Modal,{imageId:1,onClose:()=>closed++,onChanged:()=>changed++})));
  assert.equal(button('이미지 교체').disabled,true);assert.ok(button('취소'));
  const drop=new Event('drop',{bubbles:true,cancelable:true});
  Object.defineProperty(drop,'dataTransfer',{value:{files:[new File(['png'],'새그림.png',{type:'image/png'})]}});
  await act(async()=>document.querySelector('label[for]').dispatchEvent(drop));
  assert.match(document.body.textContent,/새그림.png/);assert.equal(document.querySelector('img[alt="교체할 이미지 미리보기"]').getAttribute('src'),'blob:preview');
  await click(document.querySelector('input[type=checkbox]'));await click(button('이미지 교체'));
  assert.equal(submitted.get('expectedRevision'),'7');assert.equal(submitted.get('file').name,'새그림.png');
  assert.match(document.querySelector('[role=alert]').textContent,/변경/);assert.equal(button('이미지 교체').disabled,true);assert.equal(closed,0);
  await click(button('최신 상태 다시 불러오기'));assert.equal(document.querySelector('input[type=checkbox]').checked,false);
  await click(document.querySelector('input[type=checkbox]'));await click(button('이미지 교체'));
  assert.equal(submitted.get('expectedRevision'),'8');assert.equal(changed,1);assert.equal(closed,1);
});

test('history previews show original files and restoring uses PATCH instead of uploading again',async()=>{
  requests=[];let payload,changed=0;
  fetchMock=async(url,options={})=>{
    if(url==='/api/image/replacements')return json({aliases:{'images/1/old.png':next}});
    if(options.method==='PATCH'){payload=JSON.parse(options.body);return json({success:true});}
    return json({image:{id:1,name:'원본',url:next,s3_key:'images/1/new.webp',revision:9},versions:[{id:3,name:'이전.png',url:old,s3_key:'images/1/old.png',created_at:'2026-11-23T00:00:00Z'}]});
  };
  await mount(h(Provider,null,h(Modal,{imageId:1,onClose(){},onChanged:()=>changed++})));
  assert.equal(document.querySelector('img[alt="이전.png"]').getAttribute('src'),'https://d1y7k8qotewoph.cloudfront.net/images/1/old.png');
  await click(button('복원 선택'));await click(document.querySelector('input[type=checkbox]'));await click(button('선택 버전으로 복원'));
  assert.deepEqual(payload,{id:1,expectedRevision:9,versionId:3});assert.equal(changed,1);
});
