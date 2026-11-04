const { randomUUID } = require('node:crypto');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  if (req.headers.origin && req.headers.origin !== `https://${req.headers.host}`) return res.status(403).json({error:'Invalid origin'});
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(503).json({error:'Counters are not configured'});
  let id = (req.headers.cookie || '').match(/(?:^|;\s*)draft_visitor=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if (!id) { id=randomUUID(); res.setHeader('Set-Cookie',`draft_visitor=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`); }
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const action=req.method==='POST'?body.action:'read';
  if (!['read','view','like','unlike'].includes(action)) return res.status(400).json({error:'Invalid action'});
  if(action==='view' && !/^[a-f0-9-]{36}$/.test(body.session||'')) return res.status(400).json({error:'Invalid session'});
  const script=`if ARGV[1] == 'view' then if redis.call('SET', KEYS[3], '1', 'NX', 'EX', 86400) then redis.call('INCR',KEYS[1]) end elseif ARGV[1] == 'like' then redis.call('SADD',KEYS[2],ARGV[2]) elseif ARGV[1] == 'unlike' then redis.call('SREM',KEYS[2],ARGV[2]) end return {tonumber(redis.call('GET',KEYS[1]) or '0'),redis.call('SCARD',KEYS[2]),redis.call('SISMEMBER',KEYS[2],ARGV[2])}`;
  try {
    const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',script,'3','portfolio:draft:views','portfolio:draft:likes',`portfolio:draft:session:${id}:${body.session||'read'}`,action,id]),signal:AbortSignal.timeout(5000)});
    const data=await response.json();if(!response.ok||data.error||!Array.isArray(data.result)) throw new Error('Counter request failed');
    const [views,likes,liked]=data.result;return res.status(200).json({views,likes,liked:Boolean(liked)});
  } catch(error) {console.error('Draft counters unavailable');return res.status(503).json({error:'Counters temporarily unavailable'});}
};
