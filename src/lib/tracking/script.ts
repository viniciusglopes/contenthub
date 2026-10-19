import { DEFAULT_CHECKOUT_DOMAINS } from "./pure";


// O SCRIPT DO SITE (servido em /api/t/<chave>/script). Pequeno, sem biblioteca, primeiro-partido:
//  - lê utm_*, fbclid (vira fbc), gclid, ttclid, ids de campanha/conjunto/anúncio, referência e página de entrada;
//  - guarda o primeiro e o último toque no cookie do PRÓPRIO site (_cht) e um id de visitante (_chv);
//  - consentimento: com requireConsent, nada é gravado nem enviado até o aceite (aviso nosso ou chTrack.consent(true));
//  - manda page_view, lead e initiate_checkout para /api/t/<chave>/evento (sendBeacon, texto puro);
//  - decora links de checkout (Hotmart, Kiwify, Eduzz, Monetizze, Lastlink...) com src/sck = id do visitante + UTMs,
//    para a venda voltar atribuída pelo webhook;
//  - formulário com data-ch-lead vira lead (precisa de caixinha name="ch_consent" marcada);
//  - com o pixel da Meta na página, dispara o mesmo evento com o mesmo eventID (deduplicação com a API de Conversões).

export interface ScriptConfig { key: string; endpoint: string; requireConsent: boolean; banner: boolean; bannerText: string; checkoutDomains: string[] }

export function buildScript(c: ScriptConfig): string {
  const cfg = {
    k: c.key,
    e: c.endpoint,
    rc: c.requireConsent,
    b: c.banner,
    bt: c.bannerText || "Usamos cookies para entender de onde você veio e melhorar os anúncios. Você aceita?",
    cd: [...new Set([...DEFAULT_CHECKOUT_DOMAINS, ...c.checkoutDomains])],
  };
  return `/* ContentHub rastreamento */(function(w,d){"use strict";if(w.chTrack)return;var C=${JSON.stringify(cfg)};
var Y=400*864e5,P=new URLSearchParams(location.search),now=Date.now();
function gc(n){var m=d.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)"));return m?decodeURIComponent(m[1]):""}
function sc(n,v){var h=location.hostname.split("."),dm=h.length>2&&!/^\\d+$/.test(h[h.length-1])?"; domain=."+h.slice(-2).join("."):"";d.cookie=n+"="+encodeURIComponent(v)+"; path=/; max-age="+Y/1e3+"; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"")+dm}
function rid(){var a=new Uint8Array(12);(w.crypto||w.msCrypto).getRandomValues(a);return Array.prototype.map.call(a,function(x){return("0"+x.toString(16)).slice(-2)}).join("")}
function ok(){return !C.rc||gc("_chc")==="1"}
function rd(){try{return JSON.parse(atob(gc("_cht")||""))||{}}catch(e){return{}}}
var K=["utm_source","utm_medium","utm_campaign","utm_content","utm_term","utm_id","campaign_id","adset_id","ad_id","fbclid","gclid","ttclid"];
function touch(){var t={at:now,landing:location.origin+location.pathname},has=0;K.forEach(function(k){var v=P.get(k);if(v){t[k]=v.slice(0,300);has=1}});
var r=d.referrer;try{if(r&&new URL(r).hostname!==location.hostname){t.referrer=new URL(r).hostname;has=1}}catch(e){}return has?t:null}
var T=rd(),V=gc("_chv"),FBC=gc("_fbc"),FBP=gc("_fbp");
function save(){var nt=touch();if(nt){if(!T.f)T.f=nt;T.l=nt}else if(!T.f){T.f={at:now,landing:location.origin+location.pathname};T.l=T.f}
if(!V)V=rid();if(P.get("fbclid")&&!FBC)FBC="fb.1."+now+"."+P.get("fbclid");sc("_chv",V);sc("_cht",btoa(JSON.stringify(T)));if(FBC&&!gc("_fbc"))sc("_fbc",FBC)}
function send(type,extra){if(!ok())return;var b=JSON.stringify(Object.assign({t:type,v:V,u:location.href.slice(0,800),f:T.f||null,l:T.l||null,fbc:FBC||gc("_fbc"),fbp:FBP||gc("_fbp"),c:gc("_chc")==="1"},extra||{}));
try{if(navigator.sendBeacon&&navigator.sendBeacon(C.e,new Blob([b],{type:"text/plain"})))return}catch(e){}try{fetch(C.e,{method:"POST",body:b,keepalive:true,mode:"no-cors",headers:{"Content-Type":"text/plain"}})}catch(e){}}
function px(n,id,data){try{if(w.fbq)w.fbq("track",n,data||{},{eventID:id})}catch(e){}}
function isCk(h){try{var u=new URL(h,location.href);return C.cd.some(function(x){return u.hostname===x||u.hostname.slice(-(x.length+1))==="."+x})}catch(e){return false}}
function deco(a){if(!ok()||!V||!a.href||!isCk(a.href))return;try{var u=new URL(a.href);if(!u.searchParams.get("src"))u.searchParams.set("src",V);if(!u.searchParams.get("sck"))u.searchParams.set("sck",V);
var l=T.l||T.f||{};["utm_source","utm_medium","utm_campaign","utm_content","utm_term"].forEach(function(k){if(l[k]&&!u.searchParams.get(k))u.searchParams.set(k,l[k])});a.href=u.toString()}catch(e){}}
function decoAll(){Array.prototype.forEach.call(d.querySelectorAll("a[href]"),deco)}
function start(){save();send("page_view");decoAll();
d.addEventListener("click",function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest("a[href]");if(a&&isCk(a.href)){deco(a);var id="ic."+rid();px("InitiateCheckout",id);send("initiate_checkout",{id:id})}},true);
d.addEventListener("submit",function(ev){var f=ev.target;if(!f||!f.hasAttribute||!f.hasAttribute("data-ch-lead"))return;var g=function(n){var i=f.querySelector("[name="+n+"]");return i?i.value:""};
var cb=f.querySelector("[name=ch_consent]");w.chTrack.lead({name:g("name")||g("nome"),email:g("email"),phone:g("phone")||g("telefone")||g("whatsapp"),consent:!!(cb&&cb.checked)})},true);
if(w.MutationObserver)new MutationObserver(decoAll).observe(d.documentElement,{childList:true,subtree:true})}
function banner(){if(!C.b||gc("_chc"))return;var bx=d.createElement("div");bx.setAttribute("role","dialog");bx.style.cssText="position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;max-width:560px;margin:auto;background:#111827;color:#f9fafb;font:14px/1.4 system-ui,sans-serif;padding:14px 16px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);display:flex;gap:10px;align-items:center;flex-wrap:wrap";
var p=d.createElement("span");p.style.flex="1 1 240px";p.textContent=C.bt;var a=d.createElement("button"),n=d.createElement("button");a.textContent="Aceitar";n.textContent="Recusar";
a.style.cssText="background:#f5c518;color:#111;border:0;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer";n.style.cssText="background:transparent;color:#d1d5db;border:1px solid #4b5563;border-radius:8px;padding:8px 14px;cursor:pointer";
a.onclick=function(){w.chTrack.consent(true);bx.remove()};n.onclick=function(){w.chTrack.consent(false);bx.remove()};bx.appendChild(p);bx.appendChild(n);bx.appendChild(a);(d.body||d.documentElement).appendChild(bx)}
w.chTrack={consent:function(yes){if(yes){sc("_chc","1");start()}else{d.cookie="_chc=0; path=/; max-age="+Y/1e3+"; SameSite=Lax";["_chv","_cht"].forEach(function(n){d.cookie=n+"=; path=/; max-age=0"})}},
lead:function(o){o=o||{};if(!ok())return"";var id="lead."+rid();px("Lead",id);send("lead",{id:id,lead:{name:o.name||"",email:o.email||"",phone:o.phone||"",consent:o.consent===true}});return id},
track:function(n){if(n==="InitiateCheckout"){var id="ic."+rid();px(n,id);send("initiate_checkout",{id:id});return id}return""},visitor:function(){return ok()?V:""}};
if(ok())start();else if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",banner);else banner()})(window,document);`;
}

export function snippetFor(scriptUrl: string): string {
  return `<script async src="${scriptUrl}"></script>`;
}
