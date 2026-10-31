// สำรองข้อมูลจาก Supabase แล้วเข้ารหัสด้วยรหัสผ่าน (GitHub Secret: BACKUP_PASSWORD)
// ใช้โดย .github/workflows/backup.yml — ไฟล์ผลลัพธ์กู้คืนได้ที่หน้า Admin › ตั้งค่า › "กู้คืนข้อมูลจากไฟล์สำรอง"
//
// เข้ารหัสแบบ AES-256-GCM, กุญแจจาก PBKDF2-SHA256 (ถอดรหัสในเบราว์เซอร์ด้วย WebCrypto ได้)
// repo นี้เป็นสาธารณะ → ไฟล์สำรองต้องเข้ารหัสเสมอ (ใครก็ตามที่ล็อกอิน GitHub ดาวน์โหลด artifact ได้)
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const URL_BASE = 'https://tzxhffzlblkehyzmggdu.supabase.co/rest/v1';
// คีย์สาธารณะ (publishable) — คีย์เดียวกับที่อยู่ในหน้าเว็บ อ่านได้เฉพาะข้อมูลที่เปิดให้อ่าน
const KEY = 'sb_publishable_UnAxE0Dr5Z6fGf1zo-nd2g_QKqXOIc9';
const TABLES = { weeks: 'id', clinics: 'id', teachers: 'id', students: 'id', staff: 'id', duty_staff: 'date', settings: 'key', attendance: 'id' };
const ITERATIONS = 310000;

const password = process.env.BACKUP_PASSWORD || '';
if (password.length < 8) {
  console.error('::error::ยังไม่ได้ตั้ง BACKUP_PASSWORD (อย่างน้อย 8 ตัวอักษร) ใน GitHub › Settings › Secrets and variables › Actions');
  process.exit(1);
}

async function selectAll(table, order) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL_BASE}/${table}?select=*&order=${order}&offset=${offset}&limit=1000`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const tables = {};
for (const [t, order] of Object.entries(TABLES)) tables[t] = await selectAll(t, order);
const counts = Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length]));
console.log('rows:', JSON.stringify(counts));
if (!counts.students || !counts.teachers) {
  console.error('::error::ข้อมูลนักเรียนหรือครูว่างเปล่า — ไม่บันทึกไฟล์สำรองนี้ (อาจเชื่อมต่อฐานข้อมูลผิดพลาด)');
  process.exit(1);
}

const createdAt = new Date().toISOString();
const plain = new TextEncoder().encode(JSON.stringify({ createdAt, counts, tables }));
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
const b64 = u8 => Buffer.from(u8).toString('base64');

const stamp = createdAt.slice(0, 10);
const file = `pcshspt_clinic_auto_backup_${stamp}.json`;
writeFileSync(file, JSON.stringify({
  format: 'pcshspt-clinic-backup-encrypted', version: 1, createdAt,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) },
  cipher: { name: 'AES-GCM', iv: b64(iv) },
  data: b64(cipher)
}));
console.log('wrote', file);
