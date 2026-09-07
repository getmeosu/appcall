import {test,expect} from 'bun:test';
import {sendSmtpEmail,isSmtpConfigured} from './smtp';
test('API key configured route cannot be switched by smtpHost',()=>expect(isSmtpConfigured({apiKey:'stored-key',smtpHost:'attacker.test'})).toBe(false));
test('SMTP rejects injected header and prohibited port before connect',async()=>{
 for(const extra of [{subject:'hi\r\nBcc: victim@test.com'},{to:'a@test.com\r\nDATA'},{smtpHost:'127.0.0.1'},{smtpPort:80}]){
  let calls=0;await expect(sendSmtpEmail({smtpHost:'smtp.example.com',smtpPort:465,from:'a@test.com',to:'b@test.com',...extra},{connect:async()=>{calls++;throw Error('called');}})).rejects.toBeDefined();expect(calls).toBe(0);
 }
});
test('SMTP never authenticates without TLS',async()=>{
 const writes:string[]=[];const replies=['220 ready','250 AUTH LOGIN'];
 await expect(sendSmtpEmail({smtpHost:'smtp.example.com',from:'a@test.com',to:'b@test.com',smtpUser:'user',smtpPassword:'pass'},{connect:async()=>({write:s=>{writes.push(s)},read:async()=>replies.shift()??'250 ok',close(){}})})).rejects.toBeDefined();expect(writes.some(s=>s.includes('AUTH LOGIN'))).toBe(false);
});
test('SMTP deadline closes a stalled socket',async()=>{
 let closed=false;
 await expect(sendSmtpEmail({smtpHost:'smtp.example.com',smtpPort:465,from:'a@test.com',to:'b@test.com'},{timeoutMs:5,connect:async()=>({write(){},read:()=>new Promise(()=>{}),close(){closed=true}})})).rejects.toMatchObject({code:'OPERATION_TIMEOUT'});expect(closed).toBe(true);
});
import {sendEmail as sendBrevo} from '../brevo/src/actions';
import {sendMail as sendSendgrid} from '../sendgrid/src/actions';
import {sendEmail as sendResend} from '../resend/src/emails';
test('Brevo, Sendgrid and Resend keep stored API-key route despite smtpHost',async()=>{
 for(const [send,extra] of [[sendBrevo,{sender:{email:'a@test.com'},to:[{email:'b@test.com'}]}],[sendSendgrid,{from:{email:'a@test.com'},to:[{email:'b@test.com'}]}],[sendResend,{from:'a@test.com',to:['b@test.com']}]] as const){
  let socketCalls=0,fetchCalls=0;
  await send({...extra,subject:'hello',text:'body',apiKey:'stored-key',smtpHost:'attacker.example.com',__connect:async()=>{socketCalls++;throw Error('must not dispatch')},fetch:async()=>{fetchCalls++;return Response.json({id:'id',messageId:'id'},{status:send===sendSendgrid?202:201});}});
  expect(socketCalls).toBe(0);expect(fetchCalls).toBe(1);
 }
});
