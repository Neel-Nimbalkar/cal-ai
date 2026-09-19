import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const json=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':process.env.URL||'https://cal-ai-cw9a.netlify.app'},body:JSON.stringify(body)});
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');

export default async req=>{
  if(req.method!=='POST') return json(405,{error:'Method not allowed'});
  let body; try{body=JSON.parse(req.body||'{}')}catch{return json(400,{error:'Invalid request'})}
  const email=String(body.email||'').trim().toLowerCase(),friction=String(body.friction||'').slice(0,100),consent=body.consent===true;
  if(!validEmail(email)||!friction||!consent) return json(400,{error:'Enter a valid email, answer the question, and agree to receive waitlist emails.'});
  const store=getStore({name:'calai-waitlist',consistency:'strong'}),key=`subscriber-${hash(email)}`;
  const existing=await store.get(key,{type:'json'});
  if(existing?.status==='confirmed') return json(200,{message:'This email is already confirmed.'});
  const token=crypto.randomBytes(32).toString('hex'),origin=process.env.URL||'https://cal-ai-cw9a.netlify.app';
  await store.setJSON(key,{email,friction,status:'pending',consentVersion:'2026-09-19',consentedAt:new Date().toISOString(),tokenHash:hash(token),createdAt:existing?.createdAt||new Date().toISOString()});
  await store.setJSON(`token-${hash(token)}`,{subscriberKey:key,expiresAt:Date.now()+1000*60*60*24*7},{ttl:60*60*24*7});
  if(!process.env.RESEND_API_KEY) return json(503,{error:'Confirmation email delivery is not configured yet. Please try again later.'});
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:process.env.WAITLIST_FROM||'CalAI <onboarding@resend.dev>',to:[email],subject:'Confirm your CalAI early access',html:`<div style="font-family:system-ui;max-width:560px;margin:auto"><h1>Confirm your CalAI early access</h1><p>One click confirms that you want product updates and early-access invitations from CalAI.</p><p><a href="${origin}/.netlify/functions/confirm?token=${token}" style="background:#246b45;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">Confirm my email</a></p><p>This link expires in 7 days. If you didn’t request it, ignore this message.</p><p><a href="${origin}/privacy.html">Privacy</a></p></div>`})});
  if(!sent.ok){console.error('Resend error',sent.status,await sent.text());return json(502,{error:'We could not send the confirmation email. Please try again.'})}
  return json(202,{message:'Check your inbox and click the confirmation link. The link expires in 7 days.'});
};
