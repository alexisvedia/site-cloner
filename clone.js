const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer');

async function ensureDir(dir){ await fsp.mkdir(dir, { recursive: true }); }
function safeName(u){ return u.replace(/[^a-z0-9_.-]/gi, '_').slice(0,200); }

async function autoScroll(page, step=500, delay=200){
  await page.evaluate(async (s,d)=>{
    await new Promise(res=>{
      let total=0;
      const H=document.body.scrollHeight;
      const t=setInterval(()=>{
        window.scrollBy(0,s);
        total+=s;
        if(total>=H){ clearInterval(t); res(); }
      },d);
    });
  }, step, delay);
}

(async ()=>{
  const [, , rawUrl, outArg] = process.argv;
  if(!rawUrl || !outArg){
    console.error('Uso: node clone.js <url> <outputDir>');
    process.exit(1);
  }
  const url = rawUrl.trim();
  const outDir = path.resolve(outArg);
  await ensureDir(outDir);
  await ensureDir(path.join(outDir, 'assets'));

  const browser = await puppeteer.launch({ headless: 'new', defaultViewport:{width:1920,height:1080}});
  const page = await browser.newPage();

  const saved=new Set();
  page.on('response',async resp=>{
    try{
      const req=resp.request();
      const rurl=req.url();
      const type=req.resourceType();
      if(!['stylesheet','script','image','font','media','document'].includes(type)) return;
      if(saved.has(rurl)) return;
      if(resp.status()>=400) return;

      const buf=await resp.buffer();
      if(!buf?.length) return;

      const parsed=new URL(rurl);
      let ext=path.extname(parsed.pathname);
      if(!ext){
        const ct=resp.headers()['content-type']||'';
        if(ct.includes('javascript')) ext='.js';
        else if(ct.includes('css')) ext='.css';
        else if(ct.includes('html')) ext='.html';
        else if(ct.includes('font')) ext='.woff2';
        else if(ct.includes('image')) ext='.img';
      }
      const fname=safeName(parsed.hostname+parsed.pathname+parsed.search)+(ext?'':'_.bin');
      await fsp.writeFile(path.join(outDir,'assets',fname), buf);
      saved.add(rurl);
    }catch(e){}
  });

  await page.goto(url,{waitUntil:'networkidle2',timeout:120000});
  await autoScroll(page);
  await new Promise(r=>setTimeout(r,1500));

  await page.evaluate(()=>{
    window.lenis?.stop?.();
    if(window.gsap){
      gsap.globalTimeline?.pause?.();
      gsap.ticker?.fps?.(0);
    }
  });

  const html=await page.content();
  await fsp.writeFile(path.join(outDir,'rendered.html'),html,'utf8');

  try{
    const client=await page.target().createCDPSession();
    const snap=await client.send('DOMSnapshot.captureSnapshot',{
      computedStyles:['all'],includeDOMRects:true,includePaintOrder:true
    });
    await fsp.writeFile(path.join(outDir,'domsnapshot.json'),JSON.stringify(snap,null,2),'utf8');
  }catch(e){}

  let animData={};
  try{
    animData=await page.evaluate(()=>{
      const out={};
      if(window.ScrollTrigger?.getAll){
        out.scrolltriggers=window.ScrollTrigger.getAll().map(t=>({
          trigger:t.trigger&&(t.trigger.id||t.trigger.className),
          start:t.start,end:t.end,scrub:t.vars?.scrub,pin:t.vars?.pin,vars:t.vars
        }));
      }
      if(window.gsap?.globalTimeline){
        const children=window.gsap.globalTimeline.getChildren();
        out.gsaptweens=children.map(ch=>({
          id:ch.vars?.id,
          targets:ch.targets?.().map(el=>el.id||el.className||el.tagName),
          duration:ch.duration?.(),
          vars:ch.vars
        }));
      }
      return out;
    });
  }catch(e){}

  if(animData?.scrolltriggers?.length){
    await fsp.writeFile(path.join(outDir,'scrolltriggers.json'),JSON.stringify(animData.scrolltriggers,null,2));
  }
  if(animData?.gsaptweens?.length){
    await fsp.writeFile(path.join(outDir,'gsap_tweens.json'),JSON.stringify(animData.gsaptweens,null,2));
  }

  await browser.close();
  console.log("Terminado. Archivos guardados en:", outDir);
})();
