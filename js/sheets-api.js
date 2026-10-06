// ============================================================
//  js/sheets-api.js — Google Sheets Sync Client
//  ระบบคลินิกวิชาการ PCCPT
// ============================================================

const SheetsAPI = {
  getUrl() {
    const local = localStorage.getItem('google_sheets_url');
    if (local && local.trim().startsWith('http')) return local.trim();
    return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.googleSheetsUrl) ? APP_CONFIG.googleSheetsUrl.trim() : '';
  },

  setUrl(url) {
    if (!url) {
      localStorage.removeItem('google_sheets_url');
    } else {
      localStorage.setItem('google_sheets_url', url.trim());
    }
  },

  isConfigured() {
    const url = this.getUrl();
    return Boolean(url && url.startsWith('http'));
  },

  // ทดสอบการเชื่อมต่อ
  async testConnection(urlToTest) {
    const url = (urlToTest || this.getUrl()).trim();
    if (!url) return { success: false, message: 'ยังไม่ได้ระบุ URL' };
    try {
      const res = await fetch(`${url}?action=ping&_t=${Date.now()}`, {
        method: 'GET',
        mode: 'cors',
        redirect: 'follow'
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return { success: false, message: 'เชื่อมต่อไม่สำเร็จ: ' + err.message };
    }
  },

  // ดึงข้อมูลทั้งหมดจาก Google Sheets มาบันทึกลง LocalDB
  async fetchAll() {
    const url = this.getUrl();
    if (!url) return false;
    try {
      const res = await fetch(`${url}?action=getAllData&_t=${Date.now()}`, {
        method: 'GET',
        mode: 'cors',
        redirect: 'follow'
      });
      const json = await res.json();
      if (!json.success || !json.data) return false;

      const d = json.data;
      const toYMD = (val) => {
        if (!val) return '';
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return val.trim();
        const dt = new Date(val);
        if (isNaN(dt.getTime())) return String(val);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      if (Array.isArray(d.teachers) && d.teachers.length) LocalDB.setList('teachers', d.teachers);
      if (Array.isArray(d.students) && d.students.length) LocalDB.setList('students', d.students);
      if (Array.isArray(d.staff) && d.staff.length) {
        LocalDB.setList('staff', d.staff);
      } else {
        const localStaff = LocalDB.getStaff();
        if (localStaff && localStaff.length) {
          this.saveStaff(localStaff);
        }
      }
      if (Array.isArray(d.weeks) && d.weeks.length) {
        const localWeeks = LocalDB.getList('weeks') || [];
        const mergedWeeks = d.weeks.map((w, idx) => {
          let duty = w.dutyStaff;
          if (typeof duty === 'string' && (duty.startsWith('{') || duty.startsWith('['))) {
            try { duty = JSON.parse(duty); } catch(e) {}
          }
          return {
            ...w,
            weekNum: cleanWeekNum(w.weekNum, w.label, idx + 1),
            startDate: toYMD(w.startDate),
            endDate: toYMD(w.endDate),
            dutyStaff: duty || w.dutyStaff || {}
          };
        });
        localWeeks.forEach(lw => {
          if (!mergedWeeks.some(mw => mw.weekId === lw.weekId || (mw.startDate === lw.startDate && mw.endDate === lw.endDate))) {
            mergedWeeks.push(lw);
          }
        });
        mergedWeeks.sort((a, b) => (a.startDate || '') > (b.startDate || '') ? 1 : -1);
        LocalDB.setList('weeks', mergedWeeks);

        // Reconstruct dutyStaffMap for day cards
        const dutyMap = LocalDB.getDutyStaffMap() || {};
        mergedWeeks.forEach(w => {
          if (w.dutyStaff && w.startDate) {
            for (let i = 0; i < 5; i++) {
              const baseD = (typeof parseDateSafe === 'function' ? parseDateSafe(w.startDate) : null) || new Date(w.startDate);
              if (baseD) {
                const dt = new Date(baseD);
                dt.setDate(dt.getDate() + i);
                const dStr = toYMD(dt);
                if (w.dutyStaff[i]) {
                  dutyMap[dStr] = w.dutyStaff[i];
                }
              }
            }
          }
        });
        LocalDB.setDutyStaffMap(dutyMap);
      }
      if (Array.isArray(d.duty) && d.duty.length) {
        const dutyMap = LocalDB.getDutyStaffMap() || {};
        d.duty.forEach(item => {
          if (item && item.date) {
            const officer = item.officer || item.name || '';
            if (officer) {
              dutyMap[toYMD(item.date)] = officer;
            }
          }
        });
        LocalDB.setDutyStaffMap(dutyMap);
      } else {
        const localDutyMap = LocalDB.getDutyStaffMap();
        if (localDutyMap && Object.keys(localDutyMap).length) {
          this.saveDutyStaff(LocalDB.getWeeks(), localDutyMap);
        }
      }
      if (Array.isArray(d.clinics)) {
        LocalDB.setList('clinics', d.clinics.map(c => ({
          ...c,
          date: toYMD(c.date)
        })));
      }
      if (Array.isArray(d.attendance)) {
        LocalDB.setList('attendance', d.attendance.map(a => ({
          ...a,
          date: toYMD(a.date)
        })));
      }
      if (Array.isArray(d.announcements))                 LocalDB.setList('announcements', d.announcements);
      if (d.settings && Object.keys(d.settings).length) {
        if (d.settings.semester || d.settings.academicYear) {
          LocalDB.set('school_settings', {
            semester: d.settings.semester || '1',
            academicYear: d.settings.academicYear || '2569'
          });
        }
        if (d.settings.announcements_config) {
          let annCfg = d.settings.announcements_config;
          if (typeof annCfg === 'string') {
            try { annCfg = JSON.parse(annCfg); } catch(e) {}
          }
          if (annCfg && (annCfg.top || annCfg.bottom)) {
            LocalDB.saveAnnouncementsConfig(annCfg);
          }
        }
      }
      return true;
    } catch (err) {
      console.warn('[SheetsAPI] fetchAll error:', err);
      return false;
    }
  },

  // ส่งข้อมูลทั้งหมดจาก LocalDB ขึ้นไปบันทึกใน Google Sheets
  async uploadAll() {
    const url = this.getUrl();
    if (!url) return { success: false, message: 'ยังไม่ได้ระบุ URL' };

    const dutyMap = LocalDB.getDutyStaffMap() || {};
    const dutyArray = Object.entries(dutyMap).map(([date, officer]) => ({ date, officer }));

    const payload = {
      action: 'syncAll',
      data: {
        teachers:      LocalDB.getTeachers(),
        students:      LocalDB.getStudents(),
        staff:         LocalDB.getStaff(),
        duty:          dutyArray,
        weeks:         (LocalDB.getWeeks() || []).map((w, idx) => ({
          ...w,
          weekNum: cleanWeekNum(w.weekNum, w.label, idx + 1),
          startDate: toYMD(w.startDate),
          endDate: toYMD(w.endDate),
          dutyStaff: w.dutyStaff ? (typeof w.dutyStaff === 'object' ? JSON.stringify(w.dutyStaff) : w.dutyStaff) : ''
        })),
        clinics:       (LocalDB.getClinics() || []).map(c => ({ ...c, date: toYMD(c.date) })),
        attendance:    (LocalDB.getAttendance() || []).map(a => ({ ...a, date: toYMD(a.date) })),
        announcements: LocalDB.getAnnouncements(),
        settings: {
          ...(LocalDB.get('school_settings') || {}),
          announcements_config: LocalDB.getAnnouncementsConfig()
        }
      }
    };

    return this.post(payload);
  },

  // ส่งข้อมูลเฉพาะส่วน
  async saveWeeks(weeks) {
    if (!this.isConfigured()) return;
    const cleaned = (weeks || []).map((w, idx) => ({
      ...w,
      weekNum: cleanWeekNum(w.weekNum, w.label, idx + 1),
      startDate: toYMD(w.startDate),
      endDate: toYMD(w.endDate)
    }));
    return this.post({ action: 'syncAll', data: { weeks: cleaned } });
  },

  async saveClinics(clinics) {
    if (!this.isConfigured()) return;
    const cleaned = (clinics || []).map(c => ({
      ...c,
      date: toYMD(c.date)
    }));
    return this.post({ action: 'saveClinics', clinics: cleaned });
  },

  async saveAttendance(attendance) {
    if (!this.isConfigured()) return;
    return this.post({ action: 'saveAttendance', attendance });
  },

  async saveStudents(students) {
    if (!this.isConfigured()) return;
    return this.post({ action: 'saveStudents', students });
  },

  async saveTeachers(teachers) {
    if (!this.isConfigured()) return;
    return this.post({ action: 'saveTeachers', teachers });
  },

  async saveStaff(staff) {
    if (!this.isConfigured()) return;
    return this.post({ action: 'syncAll', data: { staff } });
  },

  async saveDutyStaff(weeks, dutyMap) {
    if (!this.isConfigured()) return;
    const cleanedWeeks = (weeks || []).map((w, idx) => ({
      ...w,
      weekNum: cleanWeekNum(w.weekNum, w.label, idx + 1),
      startDate: toYMD(w.startDate),
      endDate: toYMD(w.endDate),
      dutyStaff: w.dutyStaff ? (typeof w.dutyStaff === 'object' ? JSON.stringify(w.dutyStaff) : w.dutyStaff) : ''
    }));
    const dutyArray = Object.entries(dutyMap || {}).map(([date, officer]) => ({ date, officer }));
    return this.post({
      action: 'syncAll',
      data: {
        staff: LocalDB.getStaff(),
        weeks: cleanedWeeks,
        duty: dutyArray
      }
    });
  },

  async saveSettings(settings) {
    if (!this.isConfigured()) return;
    return this.post({ action: 'saveSettings', settings });
  },

  async saveAnnouncementsConfig(cfg) {
    if (!this.isConfigured()) return;
    const settings = {
      ...(LocalDB.get('school_settings') || {}),
      announcements_config: cfg
    };
    return this.saveSettings(settings);
  },

  // POST request helper
  async post(bodyData) {
    const url = this.getUrl();
    if (!url) return { success: false, message: 'No Google Sheets URL' };

    try {
      const res = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(bodyData),
        redirect: 'follow'
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn('[SheetsAPI] post error:', err);
      return { success: false, message: err.message };
    }
  }
};
