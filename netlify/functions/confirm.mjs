import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const page=(title,text)=>({statusCode:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'},body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — CalAI</title><link rel="stylesheet" href="/styles.css"></head><body><main class="legal"><a href="/">← CalAI</a><section class="card"><h1>${title}</h1><p>${text}</p><a class="button" href="/">Back to CalAI</a></section></main></body></html>`});
export default async req=>{
  const token=new URL(req.url).searchParams.get('token')||'';
  if(!/^[a-f0-9]{64}$/.test(token)) return page('Invalid confirmation link','This confirmation link is invalid. Submit the waitlist form again for a new one.');
  const store=getStore({name:'calai-waitlist',consistency:'strong'}),tokenKey=`token-${hash(token)}`,record=await store.get(tokenKey,{type:'json'});
  if(!record||record.expiresAt<Date.now()) return page('Confirmation link expired','This link has expired. Submit the waitlist form again for a new one.');
  const subscriber=await store.get(record.subscriberKey,{type:'json'});
  if(!subscriber||subscriber.tokenHash!==hash(token)) return page('Invalid confirmation link','This confirmation link is no longer valid.');
  await store.setJSON(record.subscriberKey,{...subscriber,status:'confirmed',confirmedAt:new Date().toISOString(),tokenHash:null});
  await store.delete(tokenKey);
  return page('You’re confirmed','Your email is confirmed. You’re now on the CalAI early-access waitlist.');
};
