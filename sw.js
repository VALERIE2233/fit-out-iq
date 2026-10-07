/* Fit-Out IQ — the keeper. Keeps the platform on the phone so it opens instantly, even with no signal,
   and refreshes it quietly in the background when there is signal. © 2026 Fit-Out IQ · Valerie Mbe Awuh
   No version number on purpose: the page is served from the phone first and compared with the server's copy
   in the background; when the server's copy differs, it is stored and the page is told to show its
   "new version available" bar. This file does not need to change from build to build. */
var SHELL='fiq-shell-v1', LIBS='fiq-libs-v1';
var LIB_HOSTS=['cdnjs.cloudflare.com'];
function pageKey(){ return new Request('./'); }

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(SHELL).then(function(c){
    return fetch(new Request('./',{cache:'reload'})).then(function(res){ if(res&&res.ok)return storePage(c,res); }).catch(function(){});
  }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==SHELL&&k!==LIBS;}).map(function(k){return caches.delete(k);}));
  }).then(function(){ return self.clients.claim(); }));
});
function storePage(c,res){
  return res.text().then(function(txt){
    return c.put(pageKey(),new Response(txt,{headers:{'Content-Type':'text/html; charset=utf-8','X-FIQ-Stored':new Date().toISOString()}})).then(function(){return txt;});
  });
}
function notifyClients(){
  return self.clients.matchAll({type:'window'}).then(function(cs){ cs.forEach(function(cl){ cl.postMessage({type:'fiq-updated'}); }); });
}
function isPage(req,url){
  if(url.origin!==self.location.origin)return false;
  if(req.mode==='navigate')return true;
  return /\/(index\.html)?$/.test(url.pathname);
}
self.addEventListener('fetch',function(e){
  var req=e.request; if(req.method!=='GET')return;
  var url; try{url=new URL(req.url);}catch(err){return;}
  if(isPage(req,url)){
    e.respondWith(caches.open(SHELL).then(function(c){
      return c.match(pageKey()).then(function(cached){
        var refresh=fetch(new Request(req.url,{cache:'no-cache'})).then(function(res){
          if(!res||!res.ok)return res;
          var copy=res.clone();
          var oldText=cached?cached.clone().text():Promise.resolve(null);
          return oldText.then(function(old){
            return copy.text().then(function(txt){
              if(old!==txt){ return c.put(pageKey(),new Response(txt,{headers:{'Content-Type':'text/html; charset=utf-8','X-FIQ-Stored':new Date().toISOString()}})).then(function(){ if(old!==null)return notifyClients(); }); }
            });
          }).then(function(){return res;});
        }).catch(function(){return null;});
        if(cached){ e.waitUntil(refresh); return cached; }
        return refresh.then(function(res){
          return res||new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#15181d;color:#9aa3ad;font:15px -apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:70px 20px"><div style="font-size:26px;letter-spacing:5px;color:#e8a020;margin-bottom:14px">▰▰</div>No connection, and Fit-Out IQ has not been opened on this phone before.<br><br>Connect once with signal or Wi-Fi; after that it opens here even without.<br><br><button onclick="location.reload()" style="padding:10px 20px;font-size:14px;border-radius:6px;border:1px solid #777;background:#222;color:#eee">Try again</button></body>',{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
        });
      });
    }));
    return;
  }
  if(LIB_HOSTS.indexOf(url.hostname)>-1){
    e.respondWith(caches.open(LIBS).then(function(c){
      return c.match(req).then(function(hit){
        if(hit)return hit;
        return fetch(req).then(function(res){ if(res&&res.ok)c.put(req,res.clone()); return res; });
      });
    }));
    return;
  }
  /* everything else — sign-in, data, photos — goes straight to the network */
});
self.addEventListener('message',function(e){
  if(e.data&&e.data.type==='fiq-skip-waiting')self.skipWaiting();
});
