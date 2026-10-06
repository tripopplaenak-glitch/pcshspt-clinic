/**
 * =======================================================================
 *  ระบบตารางสอนเสริมคลินิกวิชาการ — โรงเรียนวิทยาศาสตร์จุฬาภรณราชวิทยาลัย ปทุมธานี
 *  Google Apps Script Backend (API สำหรับเชื่อมต่อเว็บไซต์)
 * =======================================================================
 * 
 * วิธีการนำไปใช้งาน:
 * 1. เปิด Google Sheets ใหม่ (ตั้งชื่อ เช่น "ระบบคลินิกวิชาการ PCCPT")
 * 2. ไปที่เมนู "ส่วนขยาย" (Extensions) → "Apps Script"
 * 3. ลบโค้ดเดิมใน Code.gs ทั้งหมด แล้ว Copy โค้ดทั้งหมดในไฟล์นี้ไปวาง
 * 4. กดปุ่ม "บันทึก" (รูปแผ่นดิสก์ หรือ Ctrl + S)
 * 5. กดปุ่ม "ทำให้ใช้งานได้" (Deploy) มุมขวาบน → เลือก "การทำให้ใช้งานได้รายการใหม่" (New deployment)
 * 6. เลือกประเภท: "เว็บแอป" (Web app)
 *    - คำอธิบาย: ระบบคลินิกวิชาการ v1
 *    - ดำเนินการในฐานะ: "ฉัน" (Me)
 *    - ผู้ที่มีสิทธิ์เข้าถึง: "ทุกคน" (Anyone) ** สำคัญมาก ต้องเลือกทุกคน **
 * 7. กด "ทำให้ใช้งานได้" (Deploy) แล้วให้สิทธิ์การเข้าถึง (Authorize access)
 * 8. คัดลอก "URL ของเว็บแอป" (Web App URL) ที่ลงท้ายด้วย /exec ไปใส่ในระบบ Admin ของเว็บไซต์
 * =======================================================================
 */

const SHEET_NAMES = {
  SETTINGS:      'Settings',
  TEACHERS:      'Teachers',
  STUDENTS:      'Students',
  STAFF:         'Staff',
  WEEKS:         'Weeks',
  CLINICS:       'Clinics',
  ATTENDANCE:    'Attendance',
  DUTY:          'DutyStaff',
  ANNOUNCEMENTS: 'Announcements'
};

// ─── GET REQUEST (อ่านข้อมูล) ──────────────────────────────────────────
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getAllData';

    if (action === 'ping') {
      return jsonResponse({ success: true, message: 'Google Sheets Connected Successfully!', time: new Date() });
    }

    if (action === 'getAllData') {
      const data = {
        teachers:      getSheetData(SHEET_NAMES.TEACHERS),
        students:      getSheetData(SHEET_NAMES.STUDENTS),
        staff:         getSheetData(SHEET_NAMES.STAFF),
        weeks:         getSheetData(SHEET_NAMES.WEEKS),
        clinics:       getSheetData(SHEET_NAMES.CLINICS),
        attendance:    getSheetData(SHEET_NAMES.ATTENDANCE),
        duty:          getSheetData(SHEET_NAMES.DUTY),
        announcements: getSheetData(SHEET_NAMES.ANNOUNCEMENTS),
        settings:      getSettingsData()
      };
      return jsonResponse({ success: true, data: data });
    }

    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ─── POST REQUEST (บันทึก / อัปเดตข้อมูล) ──────────────────────────────
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    const action = payload.action;

    // 1. ซิงค์ข้อมูลทั้งหมดในคราวเดียว (Sync All)
    if (action === 'syncAll' && payload.data) {
      const d = payload.data;
      if (d.teachers)      setSheetData(SHEET_NAMES.TEACHERS, d.teachers);
      if (d.students)      setSheetData(SHEET_NAMES.STUDENTS, d.students);
      if (d.staff)         setSheetData(SHEET_NAMES.STAFF, d.staff);
      if (d.weeks)         setSheetData(SHEET_NAMES.WEEKS, d.weeks);
      if (d.clinics)       setSheetData(SHEET_NAMES.CLINICS, d.clinics);
      if (d.attendance)    setSheetData(SHEET_NAMES.ATTENDANCE, d.attendance);
      if (d.duty)          setSheetData(SHEET_NAMES.DUTY, d.duty);
      if (d.announcements) setSheetData(SHEET_NAMES.ANNOUNCEMENTS, d.announcements);
      if (d.settings)      saveSettingsData(d.settings);

      return jsonResponse({ success: true, message: 'All data synced successfully' });
    }

    // 2. บันทึกข้อมูลเฉพาะตารางคลินิก
    if (action === 'saveClinics' && payload.clinics) {
      setSheetData(SHEET_NAMES.CLINICS, payload.clinics);
      return jsonResponse({ success: true, message: 'Clinics updated' });
    }

    // บันทึกสัปดาห์
    if (action === 'saveWeeks' && payload.weeks) {
      setSheetData(SHEET_NAMES.WEEKS, payload.weeks);
      return jsonResponse({ success: true, message: 'Weeks updated' });
    }

    // 3. บันทึกการเช็คชื่อ
    if (action === 'saveAttendance' && payload.attendance) {
      setSheetData(SHEET_NAMES.ATTENDANCE, payload.attendance);
      return jsonResponse({ success: true, message: 'Attendance updated' });
    }

    // 4. บันทึกรายชื่อนักเรียน
    if (action === 'saveStudents' && payload.students) {
      setSheetData(SHEET_NAMES.STUDENTS, payload.students);
      return jsonResponse({ success: true, message: 'Students updated' });
    }

    // 5. บันทึกครู
    if (action === 'saveTeachers' && payload.teachers) {
      setSheetData(SHEET_NAMES.TEACHERS, payload.teachers);
      return jsonResponse({ success: true, message: 'Teachers updated' });
    }

    // บันทึกเจ้าหน้าที่
    if (action === 'saveStaff' && payload.staff) {
      setSheetData(SHEET_NAMES.STAFF, payload.staff);
      return jsonResponse({ success: true, message: 'Staff updated' });
    }

    // 6. บันทึกเวรเจ้าหน้าที่
    if (action === 'saveDuty' && payload.duty) {
      setSheetData(SHEET_NAMES.DUTY, payload.duty);
      return jsonResponse({ success: true, message: 'Duty updated' });
    }

    // 7. บันทึกการตั้งค่า
    if (action === 'saveSettings' && payload.settings) {
      saveSettingsData(payload.settings);
      return jsonResponse({ success: true, message: 'Settings updated' });
    }

    return jsonResponse({ success: false, error: 'Invalid action or payload' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ─── HELPER FUNCTIONS ──────────────────────────────────────────────────
function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function getSheetData(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd');
      }
      // ลองแปลง JSON string ถ้ามีเก็บไว้ เช่น array หรือ object
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try { val = JSON.parse(val); } catch(e) {}
      }
      obj[h] = val;
    });
    return obj;
  });
}

function setSheetData(sheetName, dataArray) {
  if (!Array.isArray(dataArray)) return;
  const sheet = getOrCreateSheet(sheetName);
  sheet.clear();

  if (dataArray.length === 0) return;

  // รวบรวม Header ทั้งหมด
  const headersSet = new Set();
  dataArray.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(k => headersSet.add(k));
    }
  });
  const headers = Array.from(headersSet);
  if (headers.length === 0) return;

  // จัดเตรียมแถวข้อมูล
  const rows = [headers];
  dataArray.forEach(item => {
    const row = headers.map(h => {
      let val = item[h];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      // ถ้ารหัสประจำตัวนักเรียนมี 0 ด้านหน้า ให้บังคับเป็น Text เพื่อไม่ให้ 0 หายใน Sheets
      if (h === 'studentCode') return "'" + String(val);
      return val;
    });
    rows.push(row);
  });

  const range = sheet.getRange(1, 1, rows.length, headers.length);
  range.setValues(rows);

  // ตกแต่งหัวตารางให้อ่านง่าย
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a365d');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

function getSettingsData() {
  const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) return {};
  const values = sheet.getRange(1, 1, lastRow, 2).getValues();
  const settings = {};
  values.forEach(r => {
    if (r[0]) {
      let val = r[1];
      if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
        try { val = JSON.parse(val); } catch(e) {}
      }
      settings[r[0]] = val;
    }
  });
  return settings;
}

function saveSettingsData(settingsObj) {
  const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);
  sheet.clear();
  const rows = Object.entries(settingsObj).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]);
  if (rows.length > 0) {
    sheet.getRange(1, 1, rows.length, 2).setValues(rows);
    sheet.getRange(1, 1, rows.length, 1).setFontWeight('bold');
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
