// ============================================================
//  firebase-config.js  — Firebase Configuration
//  คลินิกวิชาการ PCCPT
// ============================================================
// IMPORTANT: Replace with YOUR Firebase project credentials
// Get them from: https://console.firebase.google.com/
// Project Settings → General → Your apps → Web app → SDK setup

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ─── SUPABASE REALTIME CONFIGURATION
const SUPABASE_CONFIG = {
  url: 'https://tzxhffzlblkehyzmggdu.supabase.co',
  anonKey: 'sb_publishable_UnAxE0Dr5Z6fGf1zo-nd2g_QKqXOIc9'
};

// ─── LOCAL AUTH (No Firebase Auth needed — we use simple password check)
const AUTH_CREDENTIALS = {
  teacher: {
    username: 'teacher',
    password: '98765432',
    role: 'teacher',
    displayName: 'ครูผู้สอน'
  },
  admin: {
    username: 'admin',
    password: 'Admin',
    role: 'admin',
    displayName: 'ผู้ดูแลระบบ'
  }
};

// ─── APP CONSTANTS
const APP_CONFIG = {
  schoolName: 'โรงเรียนวิทยาศาสตร์จุฬาภรณราชวิทยาลัย ปทุมธานี',
  schoolShort: 'ว.จ.ป.',
  semester: 1,
  academicYear: 2569,
  logo: 'assets/logo.png',
  dormitories: [
    { id: 'D1', name: 'D1 บัวอุบล', gender: 'ญ' },
    { id: 'D2', name: 'D2 บุษกร', gender: 'ญ' },
    { id: 'D3', name: 'D3 บัวชมพู', gender: 'ญ' },
    { id: 'D4', name: 'D4 นิลกมล', gender: 'ช' },
    { id: 'D5', name: 'D5 โกเมน', gender: 'ช' },
    { id: 'D6', name: 'D6 นิลปัทม์', gender: 'ช' }
  ],
  grades: ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'],
  gradeIds: [1, 2, 3, 4, 5, 6],
  gradeRooms: {
    1: 4, // ม.1 มี 4 ห้อง (ห้อง 1–4)
    2: 4, // ม.2 มี 4 ห้อง (ห้อง 1–4)
    3: 4, // ม.3 มี 4 ห้อง (ห้อง 1–4)
    4: 6, // ม.4 มี 6 ห้อง (ห้อง 1–6)
    5: 6, // ม.5 มี 6 ห้อง (ห้อง 1–6)
    6: 6  // ม.6 มี 6 ห้อง (ห้อง 1–6)
  },
  days: ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'],
  dayShort: ['จ', 'อ', 'พ', 'พฤ', 'ศ'],
  defaultTime: { start: '18:30', end: '20:30' },
  subjectGroups: [
    'คณิตศาสตร์',
    'วิทยาศาสตร์และเทคโนโลยี',
    'ภาษาต่างประเทศ',
    'ภาษาไทย',
    'สังคมศึกษา ศาสนา และวัฒนธรรม',
    'สุขศึกษาและพลศึกษา',
    'ศิลปะ',
    'การงานอาชีพ'
  ]
};

// Helper: Get room numbers for a given grade
function getRoomsForGrade(grade) {
  const g = Number(grade);
  const count = APP_CONFIG.gradeRooms[g] || (g <= 3 ? 4 : 6);
  const rooms = [];
  for (let i = 1; i <= count; i++) rooms.push(i);
  return rooms;
}

// Global Date & Week Helpers
function parseDateSafe(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  let str = String(dateInput).trim();
  if (!str || str.startsWith('NaN')) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(str + 'T00:00:00');
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function toYMD(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    val = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  }
  const dt = parseDateSafe(val);
  if (!dt) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cleanWeekNum(val, label, fallbackIdx) {
  if (typeof val === 'number' && !isNaN(val) && val > 0 && val < 100) return val;
  if (typeof val === 'string' && /^\d+$/.test(val.trim())) return parseInt(val.trim(), 10);
  if (label) {
    const m = String(label).match(/สัปดาห์ที่\s*(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return fallbackIdx || 1;
}

// ─── DORMITORY DIRECTORY & OFFICIAL NAMES (6 หอพัก)
const DORM_MAP = {
  'D1': 'D1 บัวอุบล',
  'D2': 'D2 บุษกร',
  'D3': 'D3 บัวชมพู',
  'D4': 'D4 นิลกมล',
  'D5': 'D5 โกเมน',
  'D6': 'D6 นิลปัทม์'
};

function formatDormitory(dorm) {
  if (!dorm || dorm === 'none') return '–';
  const raw = String(dorm).trim();
  if (DORM_MAP[raw]) return DORM_MAP[raw];
  const code = raw.slice(0, 2).toUpperCase();
  if (DORM_MAP[code]) return DORM_MAP[code];
  if (raw.includes('บัวอุบล')) return 'D1 บัวอุบล';
  if (raw.includes('บุษกร'))  return 'D2 บุษกร';
  if (raw.includes('บัวชมพู') || raw.includes('โกมุท')) return 'D3 บัวชมพู';
  if (raw.includes('นิลกมล')  || raw.includes('สัตตบรรณ')) return 'D4 นิลกมล';
  if (raw.includes('โกเมน')   || raw.includes('สัตตบงกช')) return 'D5 โกเมน';
  if (raw.includes('นิลปัทม์') || raw.includes('นิลุบล')) return 'D6 นิลปัทม์';
  return raw;
}

// Helper: Format clinic time nicely with fallback to standard evening clinic time (18:30–20:30 น.)
function formatClinicTime(timeStr) {
  if (!timeStr || timeStr === 'undefined' || timeStr === 'null') return '18:30–20:30 น.';
  let t = String(timeStr).trim();
  if (!t || t === '–' || t === '-') return '18:30–20:30 น.';
  if (!t.endsWith('น.') && !t.endsWith('น')) {
    return `${t} น.`;
  }
  return t;
}

