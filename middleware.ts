import { next } from '@vercel/functions';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const config = { matcher: ['/owting-case-study', '/owting-case-study.html', '/owting-case-study/:path*'] };
const COOKIE = '__Host-owting-access';
const WEEK = 60 * 60 * 24 * 7;
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};
function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function sign(expiry: string, secret: string, hash: string) {
  return createHmac('sha256', secret).update('owting:' + expiry + ':' + hash).digest('hex');
}
function gate(error = '', status = 401) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Protected Case Study | Heather Davies</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&display=swap"><style>*{box-sizing:border-box}body{margin:0;color:#151515;background:#fff;font:400 16px/1.6 Montserrat,Arial,sans-serif}header{padding:30px max(24px,8vw)}a{color:inherit;text-decoration:none}main{width:min(100% - 48px,440px);margin:clamp(60px,13vh,150px) auto}svg{width:32px;height:32px;margin-bottom:24px}h1{font-size:32px;line-height:1.2;letter-spacing:-.04em;font-weight:500;margin:0 0 20px}p{color:#666;margin:0 0 30px}label{display:block;font-size:14px;margin-bottom:8px}input,button{width:100%;min-height:52px;font:inherit;border-radius:8px}input{padding:12px 14px;border:1px solid #aaa}input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #3861d9;outline-offset:3px}button{border:0;background:#151515;color:#fff;margin-top:16px;cursor:pointer}.error{color:#a52626;font-size:14px;margin:12px 0 0}.contact{font-size:14px;margin-top:24px}.contact a{text-decoration:underline}</style></head><body><header><a href="/">Back to portfolio</a></header><main><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><h1>Owting case study</h1><p>This project is password protected. Enter the password to view the full case study.</p><form method="post" action="/owting-case-study"><label for="password">Password</label><input type="password" id="password" name="password" autocomplete="current-password" required maxlength="256" ${error ? 'aria-invalid="true" aria-describedby="error"' : ''}><button type="submit">View case study</button>${error ? '<p class="error" id="error" role="alert">' + error + '</p>' : ''}</form><p class="contact">Need access? <a href="mailto:heathbardesign@gmail.com">Contact Heather</a></p></main></body></html>`, { status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}
export default async function middleware(request: Request) {
  const hash = process.env.OWTING_PASSWORD_SHA256;
  const secret = process.env.OWTING_SESSION_SECRET;
  if (!hash || !secret) return gate('Access is temporarily unavailable. Please contact Heather.', 503);
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) return gate('Please try again from this page.', 403);
    if (Number(request.headers.get('content-length') || 0) > 2048) return gate('Please enter a shorter password.', 400);
    let password: FormDataEntryValue | null;
    try { password = (await request.formData()).get('password'); } catch { return gate('Please enter your password.', 400); }
    if (typeof password !== 'string' || password.length > 256 || !equal(createHash('sha256').update(password).digest('hex'), hash)) return gate('That password is incorrect. Please try again.');
    const expiry = String(Math.floor(Date.now() / 1000) + WEEK);
    return new Response(null, { status: 303, headers: { ...headers, Location: '/owting-case-study', 'Set-Cookie': `${COOKIE}=${expiry}.${sign(expiry, secret, hash)}; Path=/; Max-Age=${WEEK}; HttpOnly; Secure; SameSite=Lax` } });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD, POST' } });
  const cookie = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
  const [expiry, signature, extra] = cookie.split('.');
  const now = Math.floor(Date.now() / 1000);
  if (!extra && /^\d{10}$/.test(expiry || '') && Number(expiry) > now && Number(expiry) <= now + WEEK && equal(signature || '', sign(expiry, secret, hash))) return next({ headers });
  return gate();
}
