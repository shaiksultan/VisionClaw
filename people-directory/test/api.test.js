const test = require("node:test");
const assert = require("node:assert/strict");
const { openDatabase, startServer } = require("../server");

test("people and projects CRUD", async t => {
  const db = openDatabase(":memory:");
  const server = await startServer({ port: 0, db });
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, options={}) => fetch(base+url, { headers:{"content-type":"application/json"}, ...options });
  let response = await request("/api/people", { method:"POST", body:JSON.stringify({ name:"Aisha Khan", title:"Designer", consent:true }) });
  assert.equal(response.status, 201); const person = await response.json(); assert.equal(person.name, "Aisha Khan"); assert.equal(person.consent, true);
  response = await request(`/api/people/${person.id}/projects`, { method:"POST", body:JSON.stringify({ name:"Atlas", status:"Active" }) });
  assert.equal(response.status, 201);
  response = await request(`/api/people/${person.id}`); const detail = await response.json(); assert.equal(detail.projects.length, 1); assert.equal(detail.projects[0].name, "Atlas");
  response = await request("/api/lookup?name=Aisha"); const lookup = await response.json(); assert.match(lookup.spoken_summary, /Current projects: Atlas/);
  response = await request(`/api/people/${person.id}`, { method:"DELETE" }); assert.equal(response.status, 200);
  response = await request(`/api/people/${person.id}`); assert.equal(response.status, 404);
});

test("validates required fields", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/people`, { method:"POST", headers:{"content-type":"application/json"}, body:"{}" });
  assert.equal(response.status, 400);
});

test("voice enrollment stores a consented person, image, and project", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  const payload = { name:"Omar Ali", company:"Acme", title:"Engineer", photo:"data:image/jpeg;base64,YWJj", consentConfirmed:true, projects:[{name:"Lab Robot"}] };
  let response = await fetch(`${base}/api/enroll`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload) });
  assert.equal(response.status, 201); const person = await response.json();
  assert.equal(person.consent, true); assert.equal(person.company, "Acme"); assert.equal(person.projects[0].name, "Lab Robot");
  response = await fetch(`${base}/api/enroll`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload) });
  assert.equal(response.status, 409);
});

test("voice enrollment requires consent and a photo", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(`${base}/api/enroll`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({name:"No Consent"}) });
  assert.equal(response.status, 400);
  response = await fetch(`${base}/api/enroll`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({name:"No Photo",consentConfirmed:true}) });
  assert.equal(response.status, 400);
});

test("stores and updates supported profile video", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  const video = "data:video/mp4;base64,YWJj";
  let response = await fetch(`${base}/api/people`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({name:"Video Person",video}) });
  assert.equal(response.status, 201);
  const person = await response.json();
  assert.equal(person.video, video);
  response = await fetch(`${base}/api/people/${person.id}`, { method:"PUT", headers:{"content-type":"application/json"}, body:JSON.stringify({...person,video:""}) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).video, "");
});

test("rejects unsupported video data", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/people`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({name:"Bad Video",video:"data:video/avi;base64,YWJj"}) });
  assert.equal(response.status, 400);
});

test("lists demo agents", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/demos`);
  assert.equal(response.status, 200);
  const demos = await response.json();
  assert.equal(demos.length, 7);
  assert.match(demos[1].example, /Packet Core Upgrade validation procedure/);
  assert.equal(demos[3].id, "mobile-ps");
  assert.equal(demos[6].id, "ab-twin");
  assert.ok(demos.every(d => !(d.tags || []).some(t => /visionclaw|hermes/i.test(t))));
});

test("inventory lookup returns spoken summary", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/inventory/lookup?q=5G`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.spoken_summary, /5G test phone/);
});

test("knowledge lookup returns packet core procedure", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/knowledge/lookup?q=Packet Core Upgrade validation procedure`);
  assert.equal(response.status, 200);
  const article = await response.json();
  assert.match(article.content, /Mobile PS smoke suite/);
  assert.match(article.spoken_summary, /Packet Core Upgrade validation procedure/);
});

test("starts mobile ps test run and report", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(`${base}/api/tests/start`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ test_type:"Mobile PS", cycles:5 }) });
  assert.equal(response.status, 201);
  const run = await response.json();
  assert.equal(run.cycles_total, 5);
  assert.equal(run.cycles_completed, 5);
  response = await fetch(`${base}/api/tests/${run.id}/report`);
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.match(report.report, /Mobile PS/);
});

test("records API activity logs with device header", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-lab-device": "ray-ban", "x-lab-command": "lookup_inventory" };
  const response = await fetch(`${base}/api/inventory/lookup?q=5G`, { headers });
  assert.equal(response.status, 200);
  const logs = await (await fetch(`${base}/api/logs`)).json();
  assert.ok(logs.length >= 1);
  assert.equal(logs.at(-1).device, "ray-ban");
  assert.equal(logs.at(-1).command, "lookup_inventory");
  const status = await (await fetch(`${base}/api/agents/status`)).json();
  assert.equal(status.agents.length, 1);
  assert.equal(status.agents[0].device, "ray-ban");
});

test("auto-registers web console agent from browser requests", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${base}/api/inventory/lookup?q=5G`, { headers: { "user-agent": "Mozilla/5.0 Chrome/120" } });
  const status = await (await fetch(`${base}/api/agents/status`)).json();
  assert.equal(status.agents.length, 1);
  assert.equal(status.agents[0].device, "web");
});

test("creates remote support session", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/support/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-lab-device": "ray-ban" },
    body: JSON.stringify({ description: "Need help with MME alarm" }),
  });
  assert.equal(response.status, 201);
  const call = await response.json();
  assert.match(call.call_code, /SUP-/);
  assert.equal(call.call_phase, "waiting");
});

test("creates evidence ticket with video clip", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/tickets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      description: "Short clip of alarm banner",
      evidence_type: "video",
      video: "data:video/mp4;base64,YWJj",
    }),
  });
  assert.equal(response.status, 201);
  const ticket = await response.json();
  assert.equal(ticket.evidence_type, "video");
  const detail = await (await fetch(`${base}/api/tickets/${ticket.id}`)).json();
  assert.match(detail.video, /^data:video\/mp4;base64,/);
});

test("creates evidence ticket with screenshot", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/tickets`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-lab-device": "ray-ban", "x-lab-command": "create_evidence_ticket" },
    body: JSON.stringify({
      description: "Alarm banner on packet core screen",
      evidence_type: "screenshot",
      image: "data:image/jpeg;base64,YWJj",
    }),
  });
  assert.equal(response.status, 201);
  const ticket = await response.json();
  assert.match(ticket.ticket_code, /TKT-/);
  assert.equal(ticket.evidence_type, "screenshot");
  assert.match(ticket.spoken_summary, /Ticket TKT-/);
});

test("starts and ends vision support call with remote support ticket", async t => {
  const db = openDatabase(":memory:"); const server = await startServer({ port:0, db }); t.after(()=>{server.close();db.close()});
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(`${base}/api/support/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-lab-device": "ray-ban" },
    body: JSON.stringify({ description: "MME alarm needs remote help" }),
  });
  assert.equal(response.status, 201);
  const call = await response.json();
  assert.match(call.call_code, /SUP-/);
  response = await fetch(`${base}/api/support/sessions/${call.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ room_code: "ABC123" }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).room_code, "ABC123");
  response = await fetch(`${base}/api/support/end`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      support_call_id: call.id,
      video_frames: ["data:image/jpeg;base64,YWJj", "data:image/jpeg;base64,ZGVm"],
    }),
  });
  assert.equal(response.status, 200);
  const ended = await response.json();
  assert.equal(ended.status, "ended");
  assert.match(ended.ticket_code, /TKT-/);
});
