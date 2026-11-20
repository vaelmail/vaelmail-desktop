import type { EmailRender } from "./types";

export function messageDocument(
  html: string,
  light: boolean,
  fontSize: number,
  token: string,
  label = "email content",
  fontCss = "",
  render?: EmailRender,
) {
  if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error("invalid frame token");
  const designed = !!render?.designed;
  const background = designed ? "#ffffff" : light ? "#f4f3ee" : "#121311";
  const color = designed ? "#222222" : light ? "#292c25" : "#d5d7cb";
  const line = light || designed ? "#d8dad0" : "#35382f";
  const accent = light || designed ? "#76603a" : "#cab58b";
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const ids = JSON.stringify(render?.resources.map((r) => r.id) || []);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; img-src ${render ? "data:" : "'none'"}; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><style>
${fontCss}
html,body{margin:0;background:${background};color:${color};color-scheme:${light || designed ? "light" : "dark"}}
body{font:${[14, 16, 18].includes(fontSize) ? fontSize : 16}px Manrope,system-ui,sans-serif;line-height:1.7}
html{--reader-scroll-track:${light || designed ? "#f8faf4" : "#181d1b"};--reader-scroll-thumb:${light || designed ? "#c9cfc3" : "#414643"};--reader-scroll-highlight:${light || designed ? "#ffffff" : "#7c857a"};--reader-scroll-edge:${light || designed ? "#394632" : "#090e0a"};--reader-scroll-active:${light || designed ? "#3e5830" : "#b9d778"}}
*{scrollbar-width:auto;scrollbar-color:var(--reader-scroll-thumb) var(--reader-scroll-track)}
@supports selector(::-webkit-scrollbar){*{scrollbar-color:auto}::-webkit-scrollbar{width:13px;height:13px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:var(--reader-scroll-track)}::-webkit-scrollbar-thumb{min-height:28px;min-width:28px;border:2px solid var(--reader-scroll-track);border-radius:0;background:var(--reader-scroll-thumb);box-shadow:inset 1px 1px var(--reader-scroll-highlight),inset -1px -1px var(--reader-scroll-edge)}::-webkit-scrollbar-thumb:hover{background:var(--reader-scroll-highlight)}::-webkit-scrollbar-thumb:active{background:var(--reader-scroll-active)}::-webkit-scrollbar-button{display:none}}
@media(forced-colors:active){*{scrollbar-color:auto}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:Canvas}::-webkit-scrollbar-thumb{background:ButtonText;border-color:Canvas;box-shadow:none}}

#vael-reader-root{display:flow-root;min-width:0;margin:auto;padding:2px 0 12px;overflow-x:auto;overflow-wrap:break-word}
a{color:${accent};text-decoration:underline;text-underline-offset:3px}
${designed ? "" : `p,ul,ol,pre,blockquote{margin:0 0 1.15em}h1,h2,h3,h4,h5,h6{font-weight:600;line-height:1.4;margin:1.3em 0 .65em}h1{font-size:1.5em}h2{font-size:1.3em}h3,h4{font-size:1.1em}blockquote{margin-inline:0;padding:4px 0 4px 16px;border-left:2px solid ${line};opacity:.85}ul,ol{padding-left:1.5em}hr{border:0;border-top:1px solid ${line};margin:1.5em 0}`}
pre{white-space:pre-wrap;overflow-wrap:anywhere}code{font:.9em ui-monospace,monospace}
img{max-width:100%;object-fit:contain}
.vael-image-placeholder{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;max-width:100%;min-height:24px;overflow:hidden;background:${line}22;border:1px dashed ${line};color:${color};font:12px system-ui,sans-serif;white-space:nowrap;text-overflow:ellipsis;vertical-align:middle}
:focus-visible{outline:2px solid ${accent};outline-offset:3px}
@media print{html,body{background:white;color:black}#vael-reader-root{overflow:visible}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style><style>${(render?.css || "").replace(/</g, "\\3c ")}</style></head><body><main id="vael-reader-root" aria-label="${escape(label)}" tabindex="0">${render?.html ?? html}</main><script nonce="${token}">(()=>{
const root=document.getElementById('vael-reader-root'),allowed=new Set(${ids});let scheduled=false,last=0;const assets=new Map();
const images=Array.from(root.querySelectorAll('img'),img=>{const holder=document.createElement('span');holder.className=(img.className||'')+' vael-image-placeholder';holder.id=img.id;holder.setAttribute('role','img');holder.setAttribute('aria-label',img.alt||'image blocked');holder.title=img.alt||'image blocked';const width=Number(img.getAttribute('width')),height=Number(img.getAttribute('height'));holder.textContent=(width>0&&width<80)||(height>0&&height<24)?'▧':img.alt||'image blocked';holder.style.cssText=img.getAttribute('style')||'';for(const attr of ['width','height']){const value=img.getAttribute(attr);if(value&&!holder.style[attr])holder.style[attr]=value.endsWith('%')?value:value+'px'}img.replaceWith(holder);return{img,holder}});
const linkEvent=event=>{if(event.type==='auxclick'&&event.button!==1)return;const link=event.target.closest?.('a[href]');if(!link||!event.isTrusted)return;const href=link.getAttribute('href');if(href.startsWith('#')){event.preventDefault();const destination=document.getElementById(href.slice(1));destination?.scrollIntoView({block:'nearest'})}else if(href.startsWith('mailto:')){event.preventDefault();parent.postMessage({type:'vael:mailto',token:'${token}',href},'*')}else if(/^https?:/.test(href)&&(link.dataset.vaelWarning||event.type==='contextmenu')){event.preventDefault();parent.postMessage({type:'vael:link',token:'${token}',href,original:link.dataset.vaelOriginal||href,label:link.textContent.slice(0,2000),menu:event.type==='contextmenu'},'*')}};
root.addEventListener('click',linkEvent);root.addEventListener('auxclick',linkEvent);root.addEventListener('contextmenu',linkEvent);
const measure=(force=false)=>{scheduled=false;const height=Math.ceil(root.getBoundingClientRect().height);if(height>0&&(force||height!==last)){last=height;parent.postMessage({type:'vael:resize',token:'${token}',height},'*')}};
const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>measure())}};
const apply=()=>{for(const id of allowed){const data=assets.get(id);if(data)root.style.setProperty('--vael-image-'+id,'url("'+data+'")');else root.style.removeProperty('--vael-image-'+id)}for(const {img,holder} of images){const data=assets.get(img.dataset.vaelImage);const set=(img.dataset.vaelSrcset||'').split(',').flatMap(candidate=>{const [id,descriptor]=candidate.trim().split(' ');const value=assets.get(id);return value&&/^(?:\\d{1,4}w|\\d{1,2}(?:\\.\\d{1,3})?x)$/.test(descriptor)?[value+' '+descriptor]:[]}).join(',');if(data||set){if(data)img.src=data;else img.removeAttribute('src');if(set)img.srcset=set;else img.removeAttribute('srcset');holder.replaceWith(img)}else{img.removeAttribute('src');img.removeAttribute('srcset');img.replaceWith(holder)}}schedule()};
addEventListener('message',event=>{if(event.source!==parent||event.data?.token!=='${token}')return;if(event.data.type==='vael:measure')requestAnimationFrame(()=>measure(true));if(event.data.type==='vael:images'){assets.clear();for(const [id,data] of Object.entries(event.data.assets||{})){if(allowed.has(id)&&typeof data==='string'&&data.length<=7000000&&/^data:image\\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(data))assets.set(id,data)}apply()}});
new ResizeObserver(schedule).observe(root);root.addEventListener('load',schedule,true);root.addEventListener('error',schedule,true);addEventListener('load',()=>{schedule();parent.postMessage({type:'vael:ready',token:'${token}'},'*')});document.fonts.ready.then(schedule);schedule()
})()</script></body></html>`;
}

export function validFrameEvent(
  event: Pick<MessageEvent, "source" | "origin" | "data">,
  source: Window | null,
  token: string,
) {
  return (
    !!source && event.source === source && event.origin === "null" && event.data?.token === token
  );
}
export function validFrameResize(
  event: Pick<MessageEvent, "source" | "origin" | "data">,
  source: Window | null,
  token: string,
): number | null {
  const d = event.data;
  if (
    !validFrameEvent(event, source, token) ||
    d.type !== "vael:resize" ||
    typeof d.height !== "number" ||
    !Number.isFinite(d.height) ||
    d.height < 1 ||
    d.height > 1_000_000
  )
    return null;
  return Math.ceil(d.height);
}
