// ============================================================
//  db.js  — Firebase Firestore Database Service & Local Fallback
//  คลินิกวิชาการ PCCPT
// ============================================================

// ─── Firebase SDK imports (CDN via HTML, so globals are available)
let db = null;

function initDB() {
  if (typeof firebase !== 'undefined' && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY') {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    return true;
  }
  // Use localStorage fallback for demo / before Firebase setup
  console.warn('[DB] Firebase not configured. Using localStorage fallback.');
  return false;
}

// ─── LOCALSTORAGE FALLBACK DB ─────────────────────────────
class LocalDB {
  static get(key)        { try { return JSON.parse(localStorage.getItem('pccpt_' + key)) || null; } catch { return null; } }
  static set(key, value) { localStorage.setItem('pccpt_' + key, JSON.stringify(value)); }
  static getList(key)    { return LocalDB.get(key) || []; }
  static setList(key, list) { LocalDB.set(key, list); }
  static nextId(key)     { const n = (LocalDB.get('__id_' + key) || 0) + 1; LocalDB.set('__id_' + key, n); return String(n); }

  // Teachers
  static getTeachers()            {
    const list = LocalDB.getList('teachers');
    // Ensure all have subject_group
    return list.map(t => ({
      ...t,
      subject_group: t.subject_group || t.department || 'วิทยาศาสตร์และเทคโนโลยี'
    }));
  }
  static saveTeacher(t)           {
    const list = LocalDB.getList('teachers');
    const idx = list.findIndex(x => String(x.id) === String(t.id));
    if (idx >= 0) list[idx] = t;
    else { t.id = LocalDB.nextId('teacher'); list.push(t); }
    LocalDB.setList('teachers', list);
    return t;
  }
  static deleteTeacher(id)        { LocalDB.setList('teachers', LocalDB.getList('teachers').filter(x => String(x.id) !== String(id))); }
  static importTeachers(arr)      {
    const cur = LocalDB.getList('teachers');
    arr.forEach(t => {
      const existing = cur.find(x => x.name === t.name);
      if (existing) {
        Object.assign(existing, t);
      } else {
        t.id = LocalDB.nextId('teacher');
        cur.push(t);
      }
    });
    LocalDB.setList('teachers', cur);
  }

  // Staff (เจ้าหน้าที่)
  static getStaff()               { return LocalDB.getList('staff'); }
  static saveStaff(s)             {
    const list = LocalDB.getStaff();
    const idx = list.findIndex(x => String(x.id) === String(s.id));
    if (idx >= 0) list[idx] = s;
    else { s.id = LocalDB.nextId('staff'); list.push(s); }
    LocalDB.setList('staff', list);
    return s;
  }
  static deleteStaff(id)          { LocalDB.setList('staff', LocalDB.getStaff().filter(x => String(x.id) !== String(id))); }

  // Students
  static normalizeStudentCode(code) {
    if (code === undefined || code === null) return '';
    let str = String(code).trim();
    if (!str) return '';
    if (/^\d+$/.test(str) && str.length < 5) {
      str = str.padStart(5, '0');
    }
    return str;
  }
  static getStudents()            {
    const list = LocalDB.getList('students');
    return list.map(s => ({
      ...s,
      dormitory: (!s.dormitory || s.dormitory === 'none') ? 'D1' : s.dormitory,
      studentCode: LocalDB.normalizeStudentCode(s.studentCode)
    }));
  }
  static saveStudent(s)           {
    if (s.studentCode !== undefined) s.studentCode = LocalDB.normalizeStudentCode(s.studentCode);
    const list = LocalDB.getStudents();
    const idx = list.findIndex(x => String(x.id) === String(s.id));
    if (idx >= 0) list[idx] = s;
    else { s.id = LocalDB.nextId('student'); list.push(s); }
    LocalDB.setList('students', list);
    return s;
  }
  static deleteStudent(id)        { LocalDB.setList('students', LocalDB.getStudents().filter(x => String(x.id) !== String(id))); }
  static importStudents(arr)      {
    const cur = LocalDB.getStudents();
    arr.forEach(s => {
      if (s.studentCode !== undefined) s.studentCode = LocalDB.normalizeStudentCode(s.studentCode);
      const idx = cur.findIndex(x => x.studentCode && x.studentCode === s.studentCode);
      if (idx >= 0) {
        cur[idx] = { ...cur[idx], ...s };
      } else {
        s.id = LocalDB.nextId('student');
        cur.push(s);
      }
    });
    LocalDB.setList('students', cur);
  }

  // Clinics (schedule slots)
  static getClinics()             {
    return LocalDB.getList('clinics').map(c => ({
      ...c,
      time: c.time || '18:30–20:30'
    }));
  }
  static saveClinic(c)            {
    c.time = c.time || '18:30–20:30';
    const list = LocalDB.getList('clinics');
    const idx = list.findIndex(x => String(x.id) === String(c.id));
    if (idx >= 0) list[idx] = c;
    else { c.id = LocalDB.nextId('clinic'); list.push(c); }
    LocalDB.setList('clinics', list);
    LocalDB.ensureWeeksForClinics();
    return c;
  }
  static deleteClinic(id)         { LocalDB.setList('clinics', LocalDB.getClinics().filter(x => String(x.id) !== String(id))); }
  static getClinicsByWeek(weekId) {
    const weeks = LocalDB.getWeeks();
    const targetWeek = weeks.find(w => w.weekId === weekId || String(w.id) === String(weekId));
    return LocalDB.getClinics().filter(c => {
      if (c.weekId === weekId || String(c.weekId) === String(weekId)) return true;
      if (targetWeek && targetWeek.weekId && c.weekId === targetWeek.weekId) return true;
      if (targetWeek && c.date && targetWeek.startDate && targetWeek.endDate) {
        const cDate = String(c.date).slice(0, 10);
        const sDate = String(targetWeek.startDate).slice(0, 10);
        const eDate = String(targetWeek.endDate).slice(0, 10);
        return cDate >= sDate && cDate <= eDate;
      }
      return false;
    });
  }
  static getClinicsByGradeAndWeek(grade, weekId) {
    const list = LocalDB.getClinicsByWeek(weekId);
    return list.filter(c => Number(c.grade) === Number(grade));
  }

  // Attendance
  static getAttendance() {
    const raw = LocalDB.getList('attendance').filter(x => !String(x.id || '').startsWith('demo_'));
    const students = LocalDB.getStudents();
    const clinics = LocalDB.getClinics();
    const stuMap = Object.fromEntries(students.map(s => [String(s.id), s]));
    const cliMap = Object.fromEntries(clinics.map(c => [String(c.id), c]));

    return raw.map(a => {
      const s = stuMap[String(a.studentId)] || {};
      const c = cliMap[String(a.clinicId)] || {};
      return {
        ...a,
        studentName: a.studentName || s.name || '–',
        studentCode: a.studentCode || s.studentCode || '',
        grade: a.grade || s.grade || c.grade || 1,
        room: a.room || s.room || '–',
        number: a.number || s.number || '–',
        dormitory: a.dormitory || s.dormitory || 'D1',
        subject: a.subject || c.subject || c.subjectName || '–',
        teacherId: a.teacherId || c.teacherId || ''
      };
    });
  }
  static saveAttendance(a) {
    const list = LocalDB.getList('attendance');
    const idx = list.findIndex(x => String(x.id) === String(a.id));
    if (idx >= 0) list[idx] = a;
    else { a.id = LocalDB.nextId('att'); list.push(a); }
    LocalDB.setList('attendance', list);
    return a;
  }
  static deleteAttendance(id) {
    LocalDB.setList('attendance', LocalDB.getList('attendance').filter(x => String(x.id) !== String(id)));
  }
  static getAttByDate(date) {
    const dStr = toYMD(date);
    return LocalDB.getAttendance().filter(x => toYMD(x.date) === dStr);
  }
  static getAttByClinic(clinicId) {
    const fromAtt = LocalDB.getAttendance().filter(a => String(a.clinicId) === String(clinicId));
    if (fromAtt.length) return fromAtt;
    const c = LocalDB.getClinics().find(x => String(x.id) === String(clinicId));
    if (c && Array.isArray(c.studentList) && c.studentList.length) {
      return c.studentList;
    }
    return [];
  }
  static setAttendanceForClinic(clinicId, records) {
    const list = LocalDB.getList('attendance').filter(x => String(x.clinicId) !== String(clinicId));
    let nextIdNum = (LocalDB.get('__id_att') || 0);
    records.forEach(r => {
      nextIdNum++;
      if (!r.id) r.id = 'att_' + nextIdNum;
      list.push(r);
    });
    LocalDB.set('__id_att', nextIdNum);
    LocalDB.setList('attendance', list);
    return records;
  }

  // Duty Staff (เจ้าหน้าที่ประจำวัน)
  static getDutyStaffMap() {
    return LocalDB.get('duty_by_date') || {};
  }
  static setDutyStaffMap(map) {
    LocalDB.set('duty_by_date', map);
  }
  static getDutyStaffForWeek(weekId) {
    const w = LocalDB.getWeeks().find(x => x.weekId === weekId || String(x.id) === String(weekId));
    return w?.dutyStaff || {};
  }
  static saveDutyStaffForWeek(weekId, dutyObj) {
    const weeks = LocalDB.getWeeks();
    const idx = weeks.findIndex(x => x.weekId === weekId || String(x.id) === String(weekId));
    if (idx >= 0) {
      weeks[idx].dutyStaff = dutyObj;
      LocalDB.setList('weeks', weeks);
      if (weeks[idx].startDate) {
        const dutyMap = LocalDB.getDutyStaffMap();
        for (let i = 0; i < 5; i++) {
          const baseD = (typeof parseDateSafe === 'function' ? parseDateSafe(weeks[idx].startDate) : null) || new Date(weeks[idx].startDate);
          const d = new Date(baseD);
          d.setDate(d.getDate() + i);
          const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (dutyObj[i] !== undefined) {
            dutyMap[dStr] = dutyObj[i];
          }
        }
        LocalDB.setDutyStaffMap(dutyMap);
      }
    }
    return dutyObj;
  }

  // Weeks
  static getWeeks()               {
    LocalDB.ensureWeeksForClinics();
    return LocalDB.getList('weeks');
  }
  static saveWeek(w)              {
    const list = LocalDB.getWeeks();
    const idx = list.findIndex(x => String(x.id) === String(w.id));
    if (idx >= 0) list[idx] = w;
    else { w.id = LocalDB.nextId('week'); list.push(w); }
    LocalDB.setList('weeks', list);
    return w;
  }
  static deleteWeek(id)           { LocalDB.setList('weeks', LocalDB.getWeeks().filter(x => String(x.id) !== String(id))); }

  // Auto-create/sync missing weeks if clinics exist for future/other dates
  static ensureWeeksForClinics() {
    const clinics = LocalDB.getList('clinics');
    if (!clinics || !clinics.length) return;
    const weeks = LocalDB.getList('weeks') || [];
    let updated = false;

    clinics.forEach(c => {
      if (!c.date) return;
      const cDate = toYMD(c.date);
      if (!cDate) return;
      c.date = cDate; // normalize to YYYY-MM-DD
      let match = weeks.find(w => {
        if (c.weekId && (w.weekId === c.weekId || String(w.id) === String(c.weekId))) return true;
        const s = toYMD(w.startDate);
        const e = toYMD(w.endDate);
        return s && e && cDate >= s && cDate <= e;
      });

      if (!match) {
        const d = parseDateSafe(cDate) || new Date(cDate);
        if (isNaN(d.getTime())) return;
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(d); mon.setDate(diff);
        const fri = new Date(mon); fri.setDate(mon.getDate() + 4);

        const monStr = toYMD(mon);
        const friStr = toYMD(fri);

        const existingMon = weeks.find(w => toYMD(w.startDate) === monStr);
        if (existingMon) {
          c.weekId = existingMon.weekId;
          updated = true;
        } else {
          const nextWeekNum = weeks.length + 1;
          const thaiStart = typeof formatDateThai === 'function' ? formatDateThai(monStr) : monStr;
          const thaiEnd = typeof formatDateThai === 'function' ? formatDateThai(friStr) : friStr;
          const newWeek = {
            id: LocalDB.nextId('week'),
            weekId: 'week_' + monStr,
            weekNum: nextWeekNum,
            startDate: monStr,
            endDate: friStr,
            label: `สัปดาห์ที่ ${nextWeekNum} (${thaiStart} – ${thaiEnd})`,
            noClasses: false
          };
          weeks.push(newWeek);
          c.weekId = newWeek.weekId;
          updated = true;
        }
      } else if (!c.weekId) {
        c.weekId = match.weekId;
        updated = true;
      }
    });

    if (updated) {
      weeks.sort((a, b) => (toYMD(a.startDate) || '') > (toYMD(b.startDate) || '') ? 1 : -1);
      weeks.forEach((w, idx) => { w.weekNum = cleanWeekNum(w.weekNum, w.label, idx + 1); });
      LocalDB.setList('weeks', weeks);
      LocalDB.setList('clinics', clinics);
      if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) {
        SupabaseAPI.saveDutyStaff(LocalDB.getDutyStaffMap(), weeks);
      }
    }
  }

  // Dual-position announcements: top and bottom
  static getAnnouncementsConfig() {
    const defaultCfg = {
      top: {
        active: false,
        badge: '📢 ประกาศ:',
        text: ''
      },
      bottom: {
        active: false,
        title: '📌 หมายเหตุ:',
        text: ''
      }
    };
    const stored = LocalDB.get('announcements_config');
    if (!stored) return defaultCfg;
    return {
      top: {
        active: stored.top ? (stored.top.active !== false && stored.top.active !== 'false') : defaultCfg.top.active,
        badge: (stored.top && stored.top.badge !== undefined) ? stored.top.badge : defaultCfg.top.badge,
        text: (stored.top && stored.top.text !== undefined) ? stored.top.text : defaultCfg.top.text
      },
      bottom: {
        active: stored.bottom ? (stored.bottom.active !== false && stored.bottom.active !== 'false') : defaultCfg.bottom.active,
        title: (stored.bottom && stored.bottom.title !== undefined) ? stored.bottom.title : defaultCfg.bottom.title,
        text: (stored.bottom && stored.bottom.text !== undefined) ? stored.bottom.text : defaultCfg.bottom.text
      }
    };
  }
  static saveAnnouncementsConfig(cfg) {
    LocalDB.set('announcements_config', cfg);
    return cfg;
  }

  // Announcements (legacy list support)
  static getAnnouncements()       { return LocalDB.getList('announcements'); }
  static saveAnnouncement(a)      { const list = LocalDB.getAnnouncements(); const idx = list.findIndex(x => String(x.id) === String(a.id)); if (idx >= 0) list[idx] = a; else { a.id = LocalDB.nextId('ann'); list.push(a); } LocalDB.setList('announcements', list); return a; }
  static deleteAnnouncement(id)   { LocalDB.setList('announcements', LocalDB.getAnnouncements().filter(x => String(x.id) !== String(id))); }

  // Clear all personnel (ครู, นักเรียน, เจ้าหน้าที่ และเวร)
  static clearAllPersonnel() {
    LocalDB.setList('teachers', []);
    LocalDB.setList('students', []);
    LocalDB.setList('staff', []);
    LocalDB.set('duty_by_date', {});
    LocalDB.set('duty_staff_map', {});
    const weeks = LocalDB.getWeeks();
    weeks.forEach(w => { delete w.dutyStaff; });
    LocalDB.setList('weeks', weeks);
  }
}

// ─── SEED DEMO DATA (for first run) ──────────────────────
function seedDemoData() {
  // One-time auto-clear of all demo data so user starts with a 100% clean database
  if (!LocalDB.get('_cleared_all_demo_data_v4')) {
    LocalDB.setList('clinics', []);
    LocalDB.setList('teachers', []);
    LocalDB.setList('students', []);
    LocalDB.setList('staff', []);
    LocalDB.setList('attendance', []);
    LocalDB.setList('announcements', []);
    LocalDB.set('duty_by_date', {});
    LocalDB.set('duty_staff_map', {});
    LocalDB.set('duty_staff_by_week', {});
    const weeks = LocalDB.getWeeks();
    weeks.forEach(w => { delete w.dutyStaff; });
    LocalDB.setList('weeks', weeks);
    LocalDB.set('_cleared_all_demo_data_v4', true);
  }

  if (LocalDB.get('_seeded_v4')) return;

  const today = new Date();
  const monday = new Date(today);
  const dow = today.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  monday.setDate(today.getDate() + diff);

  const fmt = d => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
  };
  const thDate = d => {
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
  };

  const fri = new Date(monday); fri.setDate(monday.getDate() + 4);
  const weekId = 'week_' + fmt(monday);

  // If no weeks exist yet, create Week 1
  if (!LocalDB.getWeeks().length) {
    LocalDB.saveWeek({
      weekId,
      weekNum: 1,
      startDate: fmt(monday),
      endDate: fmt(fri),
      label: `สัปดาห์ที่ 1 (${thDate(monday)} – ${thDate(fri)})`,
      noClasses: false
    });
  }

  // All data tables are kept 100% empty for user to enter real data
  LocalDB.setList('teachers', []);
  LocalDB.setList('staff', []);
  LocalDB.setList('students', []);
  LocalDB.setList('clinics', []);
  LocalDB.setList('attendance', []);
  LocalDB.setList('announcements', []);

  LocalDB.set('_seeded_v2', true);
  LocalDB.set('_seeded_v3', true);
  LocalDB.set('_seeded_v4', true);
  console.log('[DB] Database initialized in clean mode.');
}

// ─── UNIFIED DATA API ─────────────────────────────────────
const DataService = {
  // --- Teachers ---
  async getTeachers()       { return LocalDB.getTeachers(); },
  async saveTeacher(t)      {
    const res = LocalDB.saveTeacher(t);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.saveTeacher(res);
    return res;
  },
  async deleteTeacher(id)   {
    LocalDB.deleteTeacher(id);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.deleteTeacher(id);
  },
  async importTeachers(arr) {
    LocalDB.importTeachers(arr);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.uploadAll();
  },

  // --- Staff (เจ้าหน้าที่) ---
  async getStaff()          { return LocalDB.getStaff(); },
  async saveStaff(s)        {
    const res = LocalDB.saveStaff(s);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.saveStaff(res);
    return res;
  },
  async deleteStaff(id)     {
    LocalDB.deleteStaff(id);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.deleteStaff(id);
  },

  // --- Duty Staff (เจ้าหน้าที่ประจำวัน) ---
  async getDutyStaffMap()               { return LocalDB.getDutyStaffMap(); },
  async getDutyStaffForWeek(weekId)     { return LocalDB.getDutyStaffForWeek(weekId); },
  async saveDutyStaffForWeek(weekId, d) {
    const res = LocalDB.saveDutyStaffForWeek(weekId, d);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) {
      SupabaseAPI.saveDutyStaff(LocalDB.getDutyStaffMap(), LocalDB.getWeeks());
    }
    return res;
  },

  // --- Students ---
  async getStudents()       { return LocalDB.getStudents(); },
  async saveStudent(s)      {
    const res = LocalDB.saveStudent(s);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.saveStudent(res);
    return res;
  },
  async deleteStudent(id)   {
    LocalDB.deleteStudent(id);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.deleteStudent(id);
  },
  async importStudents(arr) {
    LocalDB.importStudents(arr);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.uploadAll();
  },
  async getStudentsByGrade(grade) {
    const cleanG = String(grade).replace(/\D/g, '');
    return LocalDB.getStudents().filter(s => {
      const sG = String(s.grade).replace(/\D/g, '');
      return (sG && sG === cleanG) || Number(s.grade) === Number(grade);
    });
  },

  // --- Clinics ---
  async getClinics()        { return LocalDB.getClinics(); },
  async getClinicsByWeek(weekId) { return LocalDB.getClinicsByWeek(weekId); },
  async getClinicsByGradeAndWeek(grade, weekId) {
    return LocalDB.getClinicsByGradeAndWeek(grade, weekId);
  },
  async saveClinic(c)       {
    const res = LocalDB.saveClinic(c);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.saveClinic(res);
    return res;
  },
  async deleteClinic(id)    {
    LocalDB.deleteClinic(id);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.deleteClinic(id);
  },

  // --- Weeks ---
  async getWeeks()          { return LocalDB.getWeeks().sort((a, b) => a.startDate > b.startDate ? 1 : -1); },
  async saveWeek(w)         {
    const res = LocalDB.saveWeek(w);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.saveWeek(res);
    return res;
  },
  async deleteWeek(id)      {
    LocalDB.deleteWeek(id);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.deleteWeek(id);
  },
  async getCurrentWeek()    {
    const today = new Date().toISOString().split('T')[0];
    const weeks = LocalDB.getWeeks().sort((a, b) => a.startDate > b.startDate ? 1 : -1);
    return weeks.find(w => w.startDate <= today && w.endDate >= today) || weeks[weeks.length - 1] || null;
  },

  // --- Attendance ---
  async getAttendance()     { return LocalDB.getAttendance(); },
  async getAttByDate(date)  { return LocalDB.getAttByDate(date); },
  async getAttByClinic(clinicId) { return LocalDB.getAttByClinic(clinicId); },
  async saveAttendance(a)   {
    const res = LocalDB.saveAttendance(a);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) {
      SupabaseAPI.client?.from('attendance').upsert(SupabaseAPI.mapAttendanceToDb(res));
    }
    return res;
  },
  async deleteAttendance(id){
    const res = LocalDB.deleteAttendance(id);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) {
      SupabaseAPI.client?.from('attendance').delete().eq('id', String(id));
    }
    return res;
  },
  async setAttendanceForClinic(clinicId, records) {
    const res = LocalDB.setAttendanceForClinic(clinicId, records);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) {
      await SupabaseAPI.setAttendanceForClinic(clinicId, res || records);
    }
    return res;
  },

  // --- Announcements ---
  async getAnnouncementsConfig()  { return LocalDB.getAnnouncementsConfig(); },
  async saveAnnouncementsConfig(cfg) {
    const res = LocalDB.saveAnnouncementsConfig(cfg);
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) SupabaseAPI.saveAnnouncementsConfig(cfg);
    return res;
  },
  async getAnnouncements()  { return LocalDB.getAnnouncements().sort((a, b) => b.date > a.date ? 1 : -1); },
  async saveAnnouncement(a) { return LocalDB.saveAnnouncement(a); },
  async deleteAnnouncement(id){ return LocalDB.deleteAnnouncement(id); },

  // --- Cloud Sync Helpers ---
  async initSync() {
    if (typeof SupabaseAPI !== 'undefined' && SupabaseAPI.isConfigured()) {
      const ok = await SupabaseAPI.fetchAll();
      if (ok) return true;
    }
    return false;
  }
};
