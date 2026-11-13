/* Mutual room authentication over the encrypted data channel, before media. */
(function(root){
  'use strict';
  async function authenticate(conn, initiator, secret, localId, remoteId){
    const key = crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      {name:'HMAC', hash:'SHA-256'}, false, ['sign', 'verify']);
    const random = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2,'0')).join('');
    const validNonce = n => typeof n === 'string' && /^[a-f0-9]{48}$/.test(n);
    const ids = initiator ? [localId, remoteId] : [remoteId, localId];
    let a = initiator ? random() : '', b = '', phase = initiator ? 'challenge' : 'hello';
    const bytes = role => new TextEncoder().encode(JSON.stringify(['noel-auth-v1', role, ...ids, a, b]));
    const sign = async role => Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', await key, bytes(role))), x => x.toString(16).padStart(2,'0')).join('');
    const verify = async (role, proof) => {
      if(typeof proof !== 'string' || !/^[a-f0-9]{64}$/.test(proof)) return false;
      return crypto.subtle.verify('HMAC', await key, Uint8Array.from(proof.match(/../g), h => parseInt(h,16)), bytes(role));
    };
    return new Promise((resolve, reject) => {
      let settled = false, processing = false;
      const timer = setTimeout(() => fail(), 8000);
      function fail(){
        if(settled) return; settled = true; clearTimeout(timer);
        try{ conn.close(); }catch(e){} reject(new Error('相互認証に失敗しました'));
      }
      async function finish(){
        const proof = await sign('media');
        if(settled) return;
        settled = true; clearTimeout(timer); resolve(proof);
      }
      conn.on('close', fail); conn.on('error', fail);
      conn.on('data', async d => {
        if(settled) return;
        if(processing || !d || typeof d !== 'object') return fail();
        processing = true;
        try{
          if(!initiator && phase === 'hello' && d.type === 'hello' && validNonce(d.nonce)){
            a = d.nonce; b = random(); phase = 'proof';
            conn.send({type:'challenge', nonce:b, proof:await sign('responder')});
          }else if(initiator && phase === 'challenge' && d.type === 'challenge' && validNonce(d.nonce)){
            b = d.nonce;
            if(!await verify('responder', d.proof)) return fail();
            phase = 'ready'; conn.send({type:'proof', proof:await sign('initiator')});
          }else if(!initiator && phase === 'proof' && d.type === 'proof'){
            if(!await verify('initiator', d.proof)) return fail();
            // Resolve receiver authorization before allowing the caller to send media.
            const ready = await sign('ready'); await finish();
            queueMicrotask(() => { if(conn.open) conn.send({type:'ready', proof:ready}); });
          }else if(initiator && phase === 'ready' && d.type === 'ready'){
            if(!await verify('ready', d.proof)) return fail();
            await finish();
          }else fail();
        }catch(e){ fail(); }finally{ processing = false; }
      });
      if(initiator){
        const hello = () => { if(!settled) conn.send({type:'hello', nonce:a}); };
        if(conn.open) hello(); else conn.on('open', hello);
      }
    });
  }
  root.NoelPeerAuth = {authenticate};
})(typeof globalThis !== 'undefined' ? globalThis : window);
