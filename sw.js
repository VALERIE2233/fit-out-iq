/* Fit-Out IQ — the keeper (v2, update on first open). Keeps the platform on the phone so it opens with no signal,
   but asks the server for the newest copy FIRST every time there is signal, so an upload shows on the very next open —
   no second reload, no private window. © 2026 Fit-Out IQ · Valerie Mbe Awuh
   How it decides: page request → try the server for up to 4 seconds → if it answers, that copy is shown and stored;
   if it does not (no signal, slow network), the stored copy is shown and the server is asked again in the background;
   when that background answer differs from what is shown, the page gets its "new version available" bar. */
var SHELL='fiq-shell-v2', LIBS='fiq-libs-v1', NET_WAIT_MS=4000;
var LIB_HOSTS=['cdnjs.cloudflare.com'];
function pageKey(){ return new Request('./'); }
function stored(txt){ return new Response(txt,{headers:{'Content-Type':'text/html; charset=utf-8','X-FIQ-Stored':new Date().toISOString()}}); }

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(SHELL).then(function(c){
    return fetch(new Request('./',{cache:'reload'})).then(function(res){ if(res&&res.ok)return res.text().then(function(t){return c.put(pageKey(),stored(t));}); }).catch(function(){});
  }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==SHELL&&k!==LIBS;}).map(function(k){return caches.delete(k);}));
  }).then(function(){ return self.clients.claim(); }));
});
function notifyClients(){
  return self.clients.matchAll({type:'window'}).then(function(cs){ cs.forEach(function(cl){ cl.postMessage({type:'fiq-updated'}); }); });
}
function isPage(req,url){
  if(url.origin!==self.location.origin)return false;
  if(req.mode==='navigate')return true;
  return /\/(index\.html)?$/.test(url.pathname);
}
function withTimeout(p,ms){
  return new Promise(function(resolve){ var done=false; var t=setTimeout(function(){ if(!done){done=true;resolve(null);} },ms);
    p.then(function(v){ if(!done){done=true;clearTimeout(t);resolve(v);} },function(){ if(!done){done=true;clearTimeout(t);resolve(null);} }); });
}
function offlinePage(status){
  var why=status?('The Fit-Out IQ server answered with an error ('+status+'), and the page has not been opened on this phone before.'):'No connection, and Fit-Out IQ has not been opened on this phone before.';
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#15181d;color:#9aa3ad;font:15px -apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:70px 20px"><div style="font-size:26px;letter-spacing:5px;color:#e8a020;margin-bottom:14px">▰▰</div>'+why+'<br><br>'+(status?'Try again in a minute.':'Connect once with signal or Wi-Fi; after that it opens here even without.')+'<br><br><button onclick="location.reload()" style="padding:10px 20px;font-size:14px;border-radius:6px;border:1px solid #777;background:#222;color:#eee">Try again</button></body>',{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
}
self.addEventListener('fetch',function(e){
  var req=e.request; if(req.method!=='GET')return;
  var url; try{url=new URL(req.url);}catch(err){return;}
  if(isPage(req,url)){
    e.respondWith(caches.open(SHELL).then(function(c){
      return c.match(pageKey()).then(function(cached){
        var fetchFresh=function(){
          return fetch(new Request(req.url,{cache:'no-cache'})).then(function(res){
            if(!res||!res.ok)return {bad:res?res.status:0};
            return res.text().then(function(txt){
              /* the fresh copy is served whether or not storing it works (a full phone must not mean a stale page);
                 it is served as a plain response built from the text, never the followed redirect itself */
              return c.put(pageKey(),stored(txt)).catch(function(){}).then(function(){ return {txt:txt}; });
            });
          }).catch(function(){return null;});
        };
        /* server first, for up to NET_WAIT_MS; the same request keeps running if it is slow */
        var freshP=fetchFresh();
        return withTimeout(freshP,NET_WAIT_MS).then(function(fresh){
          if(fresh&&fresh.txt!==undefined)return stored(fresh.txt);   // newest copy, already stored
          if(cached){
            /* no answer in time (or the server answered with an error): show the stored copy, let the request finish
               in the background and tell the page if what came back differs. The copy for comparing is taken BEFORE
               the stored one is handed to the browser (a handed-over body cannot be read again). */
            var keep=cached.clone();
            e.waitUntil(freshP.then(function(late){
              if(!late||late.txt===undefined)return; return keep.text().then(function(old){ if(old!==late.txt)return notifyClients(); });
            }).catch(function(){}));
            return cached;
          }
          return freshP.then(function(late){ return (late&&late.txt!==undefined)?stored(late.txt):offlinePage(late&&late.bad); });
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
