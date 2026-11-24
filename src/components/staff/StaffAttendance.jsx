import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { syncStationDataToCloud } from '../../services/supabaseSyncService';
import { db } from '../../db/database';
import {
  UserCheck,
  Plus,
  Trash2,
  Printer,
  Save,
  Calendar as CalendarIcon,
  UserPlus,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock,
  Briefcase,
  Users,
  Sun,
  Moon,
  Eye,
  Info,
  CreditCard,
  Receipt,
  DollarSign,
  Calculator,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle,
  AlertCircle,
  Phone,
  MapPin,
  FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import NumericInput from '../common/NumericInput';

// Streamlined 3 active statuses: P (Present), HD (Half Day), - (Unmarked)
const STATUS_OPTIONS = [
  { code: 'P', label: 'Present', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200' },
  { code: 'HD', label: 'Half Day', bg: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200' },
  { code: '-', label: 'Unmarked', bg: 'bg-white text-slate-400 border-slate-200 hover:border-slate-400' }
];

const getStatusStyle = (status) => {
  switch (status) {
    case 'P':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200';
    case 'HD':
      return 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200';
    default:
      return 'bg-white text-slate-400 border-slate-200 hover:border-slate-400';
  }
};

const INITIAL_ROSTER = [];

const getDaysInMonth = (yearMonthStr) => {
  const [y, m] = (yearMonthStr || '').split('-');
  return new Date(parseInt(y, 10) || 2026, parseInt(m, 10) || 8, 0).getDate();
};

export default function StaffAttendance() {
  const { currentUser } = useAuth();
  const { selectedDate, showToast, stationProfile } = useApp();
  const [loading, setLoading] = useState(true);

  // Month-Year Filter
  const [selectedYearMonth, setSelectedYearMonth] = useState(() => {
    const d = new Date(selectedDate || Date.now());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Staff Roster Array
  const [roster, setRoster] = useState([]);

  // Attendance Dictionary: { [empId]: { [dayNum]: { dayShift: 'P'|'HD'|'-', nightShift: 'P'|'HD'|'-' } } }
  const [attendanceMap, setAttendanceMap] = useState(() => {
    try {
      const d = new Date(selectedDate || Date.now());
      const curYearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const savedMonthly = localStorage.getItem(`staff_monthly_attendance_${curYearMonth}`);
      if (savedMonthly) {
        const parsed = JSON.parse(savedMonthly);
        if (parsed && typeof parsed === 'object') return parsed;
      }

      const savedAll = localStorage.getItem('pump_attendance_records');
      if (savedAll) {
        const allRecords = JSON.parse(savedAll);
        const map = {};
        Object.keys(allRecords).forEach(empId => {
          map[empId] = {};
          const empDates = allRecords[empId] || {};
          Object.keys(empDates).forEach(dateStr => {
            if (dateStr.startsWith(curYearMonth)) {
              const dayNum = parseInt(dateStr.split('-')[2], 10);
              const val = empDates[dateStr];
              if (typeof val === 'object' && val !== null) {
                map[empId][dayNum] = {
                  dayShift: val.dayShift || (val.status === 'PRESENT' ? 'P' : (val.status === 'HALF_DAY' ? 'HD' : '-')),
                  nightShift: val.nightShift || '-'
                };
              } else if (typeof val === 'string') {
                const s = val === 'PRESENT' || val === 'P' ? 'P' : (val === 'HALF_DAY' || val === 'HD' ? 'HD' : '-');
                map[empId][dayNum] = { dayShift: s, nightShift: '-' };
              }
            }
          });
        });
        if (Object.keys(map).length > 0) return map;
      }
    } catch (e) {
      console.warn('Error reading initial attendance records:', e);
    }
    return {};
  });

  // Staff Advances Dictionary: { [empId]: [ { id, date, amount, description } ] }
  const [advancesMap, setAdvancesMap] = useState(() => {
    try {
      const d = new Date(selectedDate || Date.now());
      const curYearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const savedAdv = localStorage.getItem(`staff_advances_${curYearMonth}`);
      if (savedAdv) return JSON.parse(savedAdv) || {};
    } catch (e) {}
    return {};
  });

  // Employee Udhar-Jama Modal State
  const [selectedEmpDetail, setSelectedEmpDetail] = useState(null);

  // Modal State for Adding New Employee
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    mobile: '',
    aadhaarNumber: '',
    address: '',
    openingBalance: 0,
    salaryType: 'daily', // 'daily' or 'monthly'
    dailyRate: '',
    monthlySalary: ''
  });

  const daysInMonth = useMemo(() => getDaysInMonth(selectedYearMonth), [selectedYearMonth]);

  const [yStr, mStr] = (selectedYearMonth || '').split('-');
  const selYear = parseInt(yStr, 10) || new Date().getFullYear();
  const selMonthIndex = (parseInt(mStr, 10) || (new Date().getMonth() + 1)) - 1;
  const monthName = new Date(selYear, selMonthIndex, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    loadAttendanceSheet();
  }, [selectedYearMonth]);

  // Master persistent save helper across LocalStorage and IndexedDB
  const persistAttendanceState = async (updatedMap = attendanceMap, updatedRoster = roster, updatedAdvMap = advancesMap) => {
    try {
      // 1. Merge date-wise into master pump_attendance_records
      let masterRecords = {};
      try {
        const saved = localStorage.getItem('pump_attendance_records');
        if (saved) masterRecords = JSON.parse(saved) || {};
      } catch (e) {}

      try {
        const dbAll = await db.settings.get('pump_attendance_records');
        if (dbAll && dbAll.data && typeof dbAll.data === 'object') {
          masterRecords = { ...dbAll.data, ...masterRecords };
        }
      } catch (e) {}

      Object.keys(updatedMap).forEach(empId => {
        if (!masterRecords[empId]) masterRecords[empId] = {};
        const monthDays = updatedMap[empId] || {};
        Object.keys(monthDays).forEach(dayNum => {
          const dateStr = `${selectedYearMonth}-${String(dayNum).padStart(2, '0')}`;
          const val = monthDays[dayNum];
          const dayShift = typeof val === 'object' ? val.dayShift : val;
          const nightShift = typeof val === 'object' ? val.nightShift : '-';
          const isPresent = dayShift === 'P' || nightShift === 'P';
          const isHalfDay = dayShift === 'HD' || nightShift === 'HD';
          masterRecords[empId][dateStr] = {
            dayShift: dayShift || '-',
            nightShift: nightShift || '-',
            status: isPresent ? 'PRESENT' : (isHalfDay ? 'HALF_DAY' : 'UNMARKED')
          };
        });
      });

      localStorage.setItem('pump_attendance_records', JSON.stringify(masterRecords));
      localStorage.setItem(`staff_monthly_attendance_${selectedYearMonth}`, JSON.stringify(updatedMap));
      localStorage.setItem(`staff_attendance_map_${selectedYearMonth}`, JSON.stringify(updatedMap));
      if (Array.isArray(updatedRoster) && updatedRoster.length > 0) {
        localStorage.setItem('staff_roster', JSON.stringify(updatedRoster));
      }
      if (updatedAdvMap) {
        localStorage.setItem(`staff_advances_${selectedYearMonth}`, JSON.stringify(updatedAdvMap));
      }

      await db.settings.put({
        key: 'pump_attendance_records',
        data: masterRecords,
        updatedAt: new Date().toISOString()
      });
      await db.settings.put({
        key: `staff_monthly_attendance_${selectedYearMonth}`,
        data: updatedMap,
        updatedAt: new Date().toISOString()
      });
      await db.settings.put({
        key: `staff_attendance_map_${selectedYearMonth}`,
        data: updatedMap,
        updatedAt: new Date().toISOString()
      });
      if (Array.isArray(updatedRoster) && updatedRoster.length > 0) {
        await db.settings.put({
          key: 'staff_roster',
          data: updatedRoster,
          updatedAt: new Date().toISOString()
        });
      }
      if (updatedAdvMap) {
        await db.settings.put({
          key: `staff_advances_${selectedYearMonth}`,
          data: updatedAdvMap,
          updatedAt: new Date().toISOString()
        });
      }

      // Supabase Cloud Attendance & Roster Sync
      if (currentUser?.id) {
        syncStationDataToCloud(currentUser.id, {
          staffRoster: updatedRoster,
          lastAttendanceSavedAt: new Date().toISOString()
        }).catch(err => console.warn('Supabase cloud attendance sync error:', err));
      }
    } catch (err) {
      console.error('Error auto-persisting attendance:', err);
    }
  };

  const loadAttendanceSheet = async () => {
    setLoading(true);
    try {
      // 1. Load Roster
      const rosterRec = await db.settings.get('staff_roster');
      const savedRoster = localStorage.getItem('staff_roster');
      if (rosterRec && Array.isArray(rosterRec.data) && rosterRec.data.length > 0) {
        setRoster(rosterRec.data);
      } else if (savedRoster) {
        try {
          const parsed = JSON.parse(savedRoster);
          if (Array.isArray(parsed) && parsed.length > 0) setRoster(parsed);
          else setRoster(INITIAL_ROSTER);
        } catch (e) { setRoster(INITIAL_ROSTER); }
      } else {
        setRoster(INITIAL_ROSTER);
        localStorage.setItem('staff_roster', JSON.stringify(INITIAL_ROSTER));
        await db.settings.put({
          key: 'staff_roster',
          data: INITIAL_ROSTER,
          updatedAt: new Date().toISOString()
        });
      }

      // 2. Comprehensive Dual-Shift Attendance Load: Layer A (pump_attendance_records) + Layer B (monthly)
      let resolvedMap = {};

      let allRecords = {};
      try {
        const lsAll = localStorage.getItem('pump_attendance_records');
        if (lsAll) allRecords = JSON.parse(lsAll) || {};
      } catch (e) {}

      try {
        const dbAll = await db.settings.get('pump_attendance_records');
        if (dbAll && dbAll.data && typeof dbAll.data === 'object') {
          allRecords = { ...dbAll.data, ...allRecords };
        }
      } catch (e) {}

      // Hydrate month days from allRecords
      Object.keys(allRecords).forEach(empId => {
        if (!resolvedMap[empId]) resolvedMap[empId] = {};
        const empDates = allRecords[empId] || {};
        Object.keys(empDates).forEach(dateStr => {
          if (dateStr.startsWith(selectedYearMonth)) {
            const dayNum = parseInt(dateStr.split('-')[2], 10);
            const val = empDates[dateStr];
            if (typeof val === 'object' && val !== null) {
              resolvedMap[empId][dayNum] = {
                dayShift: val.dayShift || (val.status === 'PRESENT' ? 'P' : (val.status === 'HALF_DAY' ? 'HD' : '-')),
                nightShift: val.nightShift || '-'
              };
            } else if (typeof val === 'string') {
              const s = val === 'PRESENT' || val === 'P' ? 'P' : (val === 'HALF_DAY' || val === 'HD' ? 'HD' : '-');
              resolvedMap[empId][dayNum] = { dayShift: s, nightShift: '-' };
            }
          }
        });
      });

      // Layer B: Check staff_monthly_attendance_${selectedYearMonth} in LocalStorage & DB
      try {
        const lsMonth = localStorage.getItem(`staff_monthly_attendance_${selectedYearMonth}`);
        if (lsMonth) {
          const parsedMonth = JSON.parse(lsMonth);
          if (parsedMonth && typeof parsedMonth === 'object') {
            Object.keys(parsedMonth).forEach(empId => {
              resolvedMap[empId] = { ...(resolvedMap[empId] || {}), ...(parsedMonth[empId] || {}) };
            });
          }
        }
      } catch (e) {}

      try {
        const attRec = (await db.settings.get(`staff_monthly_attendance_${selectedYearMonth}`)) ||
                       (await db.settings.get(`staff_attendance_map_${selectedYearMonth}`));
        if (attRec && attRec.data && typeof attRec.data === 'object') {
          Object.keys(attRec.data).forEach(empId => {
            resolvedMap[empId] = { ...(resolvedMap[empId] || {}), ...(attRec.data[empId] || {}) };
          });
        }
      } catch (e) {}

      setAttendanceMap(resolvedMap);

      // 3. Load Advances Map for selected month
      let resolvedAdv = {};
      try {
        const lsAdv = localStorage.getItem(`staff_advances_${selectedYearMonth}`);
        if (lsAdv) resolvedAdv = JSON.parse(lsAdv) || {};
      } catch (e) {}
      try {
        const advRec = await db.settings.get(`staff_advances_${selectedYearMonth}`);
        if (advRec && advRec.data && typeof advRec.data === 'object') {
          resolvedAdv = { ...advRec.data, ...resolvedAdv };
        }
      } catch (e) {}
      setAdvancesMap(resolvedAdv);
    } catch (err) {
      console.error('Error loading staff attendance sheet:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSheet = async (updatedMap = attendanceMap, updatedRoster = roster, updatedAdvMap = advancesMap) => {
    try {
      await persistAttendanceState(updatedMap, updatedRoster, updatedAdvMap);
      showToast(`Saved 2-Shift Hajri Patrak & Khata for ${monthName}!`, 'success');
    } catch (err) {
      showToast('Error saving attendance sheet: ' + err.message, 'error');
    }
  };

  // Helper to extract day object safely
  const getDayObject = (empId, dayNum) => {
    const raw = attendanceMap[empId]?.[dayNum];
    if (!raw) return { dayShift: '-', nightShift: '-' };
    if (typeof raw === 'string') {
      const sanitized = (raw === 'P' || raw === 'HD') ? raw : '-';
      return { dayShift: sanitized, nightShift: '-' };
    }
    const ds = (raw.dayShift === 'P' || raw.dayShift === 'HD') ? raw.dayShift : '-';
    const ns = (raw.nightShift === 'P' || raw.nightShift === 'HD') ? raw.nightShift : '-';
    return { dayShift: ds, nightShift: ns };
  };

  // Streamlined Click Cycle: Unmarked (-) -> Present (P) -> Half Day (HD) -> Unmarked (-)
  const cycleShiftStatus = (currentStatus) => {
    if (currentStatus === '-') return 'P';
    if (currentStatus === 'P') return 'HD';
    return '-';
  };

  const handleCycleShiftStatus = (empId, dayNum, shiftKey) => {
    const currentDayObj = getDayObject(empId, dayNum);
    const currentVal = currentDayObj[shiftKey] || '-';
    const nextVal = cycleShiftStatus(currentVal);

    const updatedDayObj = {
      ...currentDayObj,
      [shiftKey]: nextVal
    };

    const updatedMap = {
      ...attendanceMap,
      [empId]: {
        ...(attendanceMap[empId] || {}),
        [dayNum]: updatedDayObj
      }
    };

    setAttendanceMap(updatedMap);
    persistAttendanceState(updatedMap, roster, advancesMap);
  };

  // Bulk Action: Mark All Staff Present for a specific shift on day X
  const handleMarkAllShiftPresent = (dayNum, shiftKey) => {
    const updatedMap = { ...attendanceMap };
    roster.forEach(emp => {
      const cur = getDayObject(emp.id, dayNum);
      if (!updatedMap[emp.id]) updatedMap[emp.id] = {};
      updatedMap[emp.id][dayNum] = {
        ...cur,
        [shiftKey]: 'P'
      };
    });
    setAttendanceMap(updatedMap);
    persistAttendanceState(updatedMap, roster, advancesMap);
    showToast(`Marked all staff PRESENT for Day ${dayNum} (${shiftKey === 'dayShift' ? 'Day Shift ☀️' : 'Night Shift 🌙'})!`, 'info');
  };

  // Add Employee Handler
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmployee.name.trim()) return;

    const isMonthly = newEmployee.salaryType === 'monthly';
    const mSalary = parseFloat(newEmployee.monthlySalary) || 0;
    const dRate = parseFloat(newEmployee.dailyRate) || (isMonthly && daysInMonth > 0 ? Number((mSalary / daysInMonth).toFixed(2)) : 500);

    const empObj = {
      id: `emp-${Date.now()}`,
      name: newEmployee.name.trim(),
      mobile: newEmployee.mobile.trim(),
      aadhaarNumber: newEmployee.aadhaarNumber.trim(),
      address: newEmployee.address.trim(),
      openingBalance: parseFloat(newEmployee.openingBalance) || 0,
      salaryType: newEmployee.salaryType || 'daily',
      dailyRate: dRate,
      monthlySalary: mSalary || (dRate * daysInMonth)
    };

    const updatedRoster = [...roster, empObj];
    setRoster(updatedRoster);
    setShowAddModal(false);
    setNewEmployee({
      name: '',
      mobile: '',
      aadhaarNumber: '',
      address: '',
      openingBalance: 0,
      salaryType: 'daily',
      dailyRate: '',
      monthlySalary: ''
    });

    await db.settings.put({
      key: 'staff_roster',
      data: updatedRoster,
      updatedAt: new Date().toISOString()
    });

    showToast(`Added ${empObj.name} to Staff Roster!`, 'success');
  };

  // Update Salary Type for an Employee
  const handleSalaryTypeChange = (empId, typeVal) => {
    const updatedRoster = roster.map(emp => {
      if (emp.id === empId) {
        return { ...emp, salaryType: typeVal };
      }
      return emp;
    });
    setRoster(updatedRoster);
  };

  // Update Daily Rate for an Employee
  const handleDailyRateChange = (empId, rateVal) => {
    const num = parseFloat(rateVal) || 0;
    const updatedRoster = roster.map(emp => emp.id === empId ? { ...emp, dailyRate: num } : emp);
    setRoster(updatedRoster);
  };

  // Update Monthly Salary for an Employee
  const handleMonthlySalaryChange = (empId, salaryVal) => {
    const num = parseFloat(salaryVal) || 0;
    const updatedRoster = roster.map(emp => emp.id === empId ? { ...emp, monthlySalary: num } : emp);
    setRoster(updatedRoster);
  };

  // Delete Employee Handler
  const handleDeleteEmployee = async (empId) => {
    const updatedRoster = roster.filter(emp => emp.id !== empId);
    setRoster(updatedRoster);
    await db.settings.put({
      key: 'staff_roster',
      data: updatedRoster,
      updatedAt: new Date().toISOString()
    });
    showToast('Removed employee from Hajri Patrak roster', 'info');
  };

  // Staff Udhar (Advance) Handlers
  const handleAddAdvanceRow = (empId) => {
    const list = advancesMap[empId] || [];
    const todayStr = selectedDate || new Date().toISOString().split('T')[0];
    const newAdv = {
      id: `adv-${Date.now()}`,
      date: todayStr,
      amount: 0,
      description: ''
    };
    const updatedMap = {
      ...advancesMap,
      [empId]: [...list, newAdv]
    };
    setAdvancesMap(updatedMap);
  };

  const handleAdvanceChange = (empId, index, field, value) => {
    const list = [...(advancesMap[empId] || [])];
    const item = { ...list[index] };
    if (field === 'amount') {
      item.amount = value === '' ? 0 : (parseFloat(value) || 0);
    } else {
      item[field] = value;
    }
    list[index] = item;
    const updatedMap = {
      ...advancesMap,
      [empId]: list
    };
    setAdvancesMap(updatedMap);
  };

  const handleDeleteAdvanceRow = (empId, index) => {
    const list = (advancesMap[empId] || []).filter((_, i) => i !== index);
    const updatedMap = {
      ...advancesMap,
      [empId]: list
    };
    setAdvancesMap(updatedMap);
  };

  const handleSaveModalAndClose = () => {
    handleSaveSheet(attendanceMap, roster, advancesMap);
    setSelectedEmpDetail(null);
  };

  // Streamlined Dual-Shift Summary per Employee & Automated Settlement Calculation
  const getEmployeeStats = (emp) => {
    let dayP = 0, dayHD = 0;
    let nightP = 0, nightHD = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const obj = getDayObject(emp.id, d);
      if (obj.dayShift === 'P') dayP++;
      else if (obj.dayShift === 'HD') dayHD++;

      if (obj.nightShift === 'P') nightP++;
      else if (obj.nightShift === 'HD') nightHD++;
    }

    // 1. Calculate Attendance Units (Shift Units)
    const dayUnits = dayP + (dayHD * 0.5);
    const nightUnits = nightP + (nightHD * 0.5);
    const totalShiftsWorked = dayUnits + nightUnits;
    const paidDays = totalShiftsWorked;

    // 2. Calculate Gross Salary (Jama Credit)
    let grossSalary = 0;
    let effectiveDailyRate = 0;
    let effectiveRateLabel = '';

    if (emp.salaryType === 'monthly') {
      const fixedMonthly = parseFloat(emp.monthlySalary) || 0;
      effectiveDailyRate = daysInMonth > 0 ? (fixedMonthly / daysInMonth) : 0;
      grossSalary = totalShiftsWorked * effectiveDailyRate;
      effectiveRateLabel = `₹${effectiveDailyRate.toFixed(2)}/shift (₹${fixedMonthly}/mo ÷ ${daysInMonth}d)`;
    } else {
      effectiveDailyRate = parseFloat(emp.dailyRate) || 0;
      grossSalary = totalShiftsWorked * effectiveDailyRate;
      effectiveRateLabel = `₹${effectiveDailyRate}/shift`;
    }

    // 3. Sum Advances (Udhar Debit) including Opening Balance
    const empAdvances = advancesMap[emp.id] || [];
    const openingBal = parseFloat(emp.openingBalance) || 0;
    const totalAdvance = openingBal + empAdvances.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

    // 4. Final Net Settlement (Net Balance = Total Jama - Total Udhar)
    const netPayableSalary = grossSalary - totalAdvance;

    return {
      dayP, dayHD, dayUnits,
      nightP, nightHD, nightUnits,
      totalShiftsWorked,
      paidDays,
      effectiveDailyRate,
      effectiveRateLabel,
      grossSalary,
      openingBal,
      totalAdvance,
      netPayableSalary
    };
  };

  // Calculate Daily Present Staff for Column Footer (Day Shift & Night Shift)
  const getDailyShiftTotals = (dayNum) => {
    let dayTotal = 0;
    let nightTotal = 0;

    roster.forEach(emp => {
      const obj = getDayObject(emp.id, dayNum);
      if (obj.dayShift === 'P') dayTotal += 1;
      else if (obj.dayShift === 'HD') dayTotal += 0.5;

      if (obj.nightShift === 'P') nightTotal += 1;
      else if (obj.nightShift === 'HD') nightTotal += 0.5;
    });

    return { dayTotal, nightTotal };
  };

  const getDailyTotalPresent = (dayNum) => {
    const totals = getDailyShiftTotals(dayNum);
    return totals.dayTotal + totals.nightTotal;
  };

  // Monthly Grand Totals for Main Table Footer
  const totalMonthlyShifts = useMemo(() => {
    return roster.reduce((sum, emp) => sum + getEmployeeStats(emp).totalShiftsWorked, 0);
  }, [roster, attendanceMap, daysInMonth]);

  const totalMonthlyGross = useMemo(() => {
    return roster.reduce((sum, emp) => sum + getEmployeeStats(emp).grossSalary, 0);
  }, [roster, attendanceMap, daysInMonth]);

  const totalMonthlyAdvance = useMemo(() => {
    return roster.reduce((sum, emp) => sum + getEmployeeStats(emp).totalAdvance, 0);
  }, [roster, advancesMap]);

  const totalMonthlySalaryPayout = useMemo(() => {
    return roster.reduce((sum, emp) => sum + getEmployeeStats(emp).netPayableSalary, 0);
  }, [roster, attendanceMap, advancesMap, daysInMonth]);

  const availableMonths = useMemo(() => {
    const list = [];
    const now = new Date();
    const curYear = now.getFullYear();
    for (let y = curYear - 1; y <= curYear + 1; y++) {
      for (let m = 0; m < 12; m++) {
        const val = `${y}-${String(m + 1).padStart(2, '0')}`;
        const label = new Date(y, m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
        list.push({ val, label });
      }
    }
    return list;
  }, []);

  // Printable PDF 2-Shift & Khata Hajri Patrak Generator
  const handlePrintPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(stationProfile?.fuelStationName || 'SHITAL PETROL PUMP', pageWidth / 2, 10, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`STAFF HAJRI PATRAK & ADVANCE KHATA REGISTER — (${monthName.toUpperCase()})`, pageWidth / 2, 15, { align: 'center' });

      const headCols = ['#', 'STAFF NAME & MOBILE', 'RATE'];
      for (let d = 1; d <= daysInMonth; d++) {
        headCols.push(String(d));
      }
      headCols.push('SHIFTS', 'GROSS (Rs.)', 'ADV (Rs.)', 'NET SALARY (Rs.)');

      const tableRows = roster.map((emp, i) => {
        const stats = getEmployeeStats(emp);
        const rateLabel = emp.salaryType === 'monthly'
          ? `Rs.${emp.monthlySalary || 0}/mo`
          : `Rs.${emp.dailyRate || 0}/day`;

        const row = [i + 1, `${emp.name}\n(Ph: ${emp.mobile || 'N/A'})`, rateLabel];

        for (let d = 1; d <= daysInMonth; d++) {
          const obj = getDayObject(emp.id, d);
          row.push(`D:${obj.dayShift}\nN:${obj.nightShift}`);
        }

        row.push(
          stats.totalShiftsWorked.toFixed(1),
          `Rs. ${stats.grossSalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
          `Rs. ${stats.totalAdvance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
          `Rs. ${stats.netPayableSalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
        );
        return row;
      });

      // Footer Row
      const footRow = ['TOTALS', '-', '-'];
      for (let d = 1; d <= daysInMonth; d++) {
        const totals = getDailyShiftTotals(d);
        footRow.push(`D:${totals.dayTotal}\nN:${totals.nightTotal}`);
      }
      footRow.push(
        totalMonthlyShifts.toFixed(1),
        `Rs. ${totalMonthlyGross.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        `Rs. ${totalMonthlyAdvance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        `Rs. ${totalMonthlySalaryPayout.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
      );
      tableRows.push(footRow);

      autoTable(doc, {
        startY: 20,
        head: [headCols],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6, halign: 'center' },
        styles: { fontSize: 5.5, cellPadding: 1, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 7 },
          1: { cellWidth: 30, halign: 'left', fontStyle: 'bold' },
          2: { cellWidth: 15 }
        }
      });

      doc.save(`STAFF_HAJRI_KHATA_${selectedYearMonth}.pdf`);
      showToast('Generated Printable Hajri & Khata PDF!', 'success');
    } catch (err) {
      showToast('Error generating PDF: ' + err.message, 'error');
    }
  };

  // Printable Individual Staff Udhar-Jama Khata Slip PDF Generator (Consolidated Monthly Jama)
  const handlePrintKhataSlip = (emp) => {
    try {
      const stats = getEmployeeStats(emp);
      const empAdvances = advancesMap[emp.id] || [];
      const netBalance = stats.netPayableSalary;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(stationProfile?.fuelStationName || 'SHITAL PETROL PUMP', pageWidth / 2, 12, { align: 'center' });

      doc.setFontSize(11);
      doc.text(`STAFF UDHAR-JAMA KHATA SLIP — (${monthName.toUpperCase()})`, pageWidth / 2, 18, { align: 'center' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Staff Name: ${emp.name}  |  Mobile: ${emp.mobile || 'N/A'}  |  Basis: ${emp.salaryType || 'daily'} (${stats.effectiveRateLabel})`, 14, 25);

      // Jama Consolidated Table Body
      const jamaBody = [
        ['Day Shifts (6 AM - 6 PM)', `${stats.dayUnits.toFixed(1)} units`, `Rs. ${stats.effectiveDailyRate.toFixed(0)}`, `Rs. ${(stats.dayUnits * stats.effectiveDailyRate).toLocaleString('en-IN')}`],
        ['Night Shifts (6 PM - 6 AM)', `${stats.nightUnits.toFixed(1)} units`, `Rs. ${stats.effectiveDailyRate.toFixed(0)}`, `Rs. ${(stats.nightUnits * stats.effectiveDailyRate).toLocaleString('en-IN')}`],
        ['TOTAL JAMA (EARNED SALARY)', `${stats.totalShiftsWorked.toFixed(1)} shifts`, '-', `Rs. ${stats.grossSalary.toLocaleString('en-IN')}`]
      ];

      // Udhar Table Body
      const udharBody = [];
      if (stats.openingBal > 0) {
        udharBody.push(['Opening Bal', '-', `Rs. ${stats.openingBal.toLocaleString('en-IN')}`, 'Previous Carryforward']);
      }
      empAdvances.forEach((adv, idx) => {
        udharBody.push([idx + 1, adv.date, `Rs. ${parseFloat(adv.amount || 0).toLocaleString('en-IN')}`, adv.description || '-']);
      });
      if (udharBody.length === 0) udharBody.push(['-', '-', 'Rs. 0', 'No advance entries recorded']);
      udharBody.push(['TOTAL UDHAR (ADVANCE)', '', `Rs. ${stats.totalAdvance.toLocaleString('en-IN')}`, '']);

      doc.setFont('helvetica', 'bold');
      doc.text('🟢 JAMA (EARNED SALARY CREDIT):', 14, 33);
      autoTable(doc, {
        startY: 35,
        head: [['PARTICULARS (MONTHLY SHIFTS)', 'TOTAL UNITS', 'RATE (Rs.)', 'EARNED (Rs.)']],
        body: jamaBody,
        theme: 'grid',
        headStyles: { fillColor: [4, 120, 87], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8 }
      });

      const nextY = doc.lastAutoTable.finalY + 8;
      doc.text('🔴 UDHAR (ADVANCE DEBIT):', 14, nextY);
      autoTable(doc, {
        startY: nextY + 2,
        head: [['#', 'DATE', 'AMOUNT (Rs.)', 'REASON']],
        body: udharBody,
        theme: 'grid',
        headStyles: { fillColor: [190, 18, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8 }
      });

      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      if (netBalance >= 0) {
        doc.setTextColor(4, 120, 87);
        doc.text(`NET PAYABLE TO STAFF (CHUKTI RAKAM): Rs. ${netBalance.toLocaleString('en-IN')}`, 14, finalY);
      } else {
        doc.setTextColor(190, 18, 60);
        doc.text(`EXCESS ADVANCE OWED BY STAFF (BAKI UDHAR): Rs. ${Math.abs(netBalance).toLocaleString('en-IN')}`, 14, finalY);
      }

      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('Staff Signature: ______________________', 14, finalY + 18);
      doc.text('Manager Signature: ______________________', pageWidth - 80, finalY + 18);

      doc.save(`KHATA_SLIP_${emp.name.replace(/\s+/g, '_')}_${selectedYearMonth}.pdf`);
      showToast(`Generated Khata Slip PDF for ${emp.name}!`, 'success');
    } catch (err) {
      showToast('Error printing Khata Slip: ' + err.message, 'error');
    }
  };

  if (loading) return <div className="p-8 text-center text-sm font-semibold text-slate-400">Loading Staff Hajri Patrak & Advance Register...</div>;

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="p-4 space-y-3.5 animate-fadeIn bg-[#0c121d] min-h-screen select-text font-sans text-slate-200">
      {/* Top Action & Month Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-[#121927] p-3 rounded-xl border border-[#1e293b] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-xs text-slate-100 tracking-wide">Staff Hajri Patrak & Udhar-Jama Settlement</span>
          </div>

          {/* Month Selector Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#0e1420] border border-[#1b2537] rounded-lg px-2.5 py-1 text-xs text-slate-300">
            <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 text-xs">Month:</span>
            <select
              value={selectedYearMonth}
              onChange={(e) => setSelectedYearMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m.val} value={m.val}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white shadow-xs transition-all active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add Staff Employee</span>
          </button>

          <button type="button"
            onClick={handlePrintPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all active:scale-95 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Print PDF</span>
          </button>

          <button type="button"
            onClick={() => handleSaveSheet()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Sheet</span>
          </button>
        </div>
      </div>

      {/* STREAMLINED STATUS LEGEND BADGES BAR */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-500 uppercase text-[11px] flex items-center gap-1">
            <span>SHIFT LEGEND:</span>
            <span className="text-amber-600 font-bold">☀️ DAY (6AM-6PM)</span>
            <span className="text-slate-400">|</span>
            <span className="text-indigo-600 font-bold">🌙 NIGHT (6PM-6AM)</span>
          </span>
          <span className="text-slate-300 mx-1">|</span>
          {STATUS_OPTIONS.map((st) => (
            <span
              key={st.code}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-black border ${st.bg}`}
            >
              <strong className="font-mono">{st.code}</strong>
              <span className="font-sans font-semibold text-[10px]">({st.label})</span>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs font-mono font-bold text-slate-700">
          <span>Staff: <strong className="text-blue-600 font-black">{roster.length}</strong></span>
          <span className="text-slate-300">|</span>
          <span>Net Salary Payout: <strong className="text-emerald-700 font-black">₹ {totalMonthlySalaryPayout.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></span>
        </div>
      </div>

      {/* TRADITIONAL 31-DAY DUAL-SHIFT HAJRI PATRAK MATRIX TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-4 space-y-4">
        <div className="w-full overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
          <table className="w-full border-collapse text-left font-sans text-xs">
            {/* Table Header */}
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                <th className="sticky left-0 z-20 bg-slate-50 px-3 py-3 w-12 min-w-[48px] max-w-[48px] text-center font-mono border-r border-slate-200">#</th>
                <th className="sticky left-12 z-20 bg-slate-50 px-4 py-3 w-[180px] min-w-[180px] max-w-[180px] border-r border-slate-200">
                  STAFF NAME & ROLE
                </th>
                <th className="sticky left-[228px] z-20 bg-slate-50 px-3 py-3 w-[140px] min-w-[110px] max-w-[140px] text-right border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                  SALARY RATE
                </th>

                {/* Day 1 to 31 Sub-headers */}
                {daysArray.map((dayNum) => {
                  const d = new Date(selYear, selMonthIndex, dayNum);
                  const dayAbbr = d.toLocaleString('en-US', { weekday: 'narrow' });
                  const isSunday = d.getDay() === 0;

                  return (
                    <th
                      key={dayNum}
                      className={`px-1 py-2 w-10 min-w-[40px] border-r border-slate-200 text-center ${
                        isSunday ? 'bg-rose-50 text-rose-700 font-bold' : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between px-0.5">
                        <span className="font-mono text-xs font-black">{dayNum}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">{dayAbbr}</span>
                      </div>
                      <div className="flex items-center justify-center gap-0.5 border-t border-slate-200 pt-0.5 mt-0.5 text-[8px] font-normal text-slate-400">
                        <button
                          type="button"
                          onClick={() => handleMarkAllShiftPresent(dayNum, 'dayShift')}
                          title={`Click to mark all staff PRESENT for Day Shift ☀️ on Day ${dayNum}`}
                          className="hover:text-amber-500 cursor-pointer"
                        >
                          ☀️
                        </button>
                        <span>|</span>
                        <button
                          type="button"
                          onClick={() => handleMarkAllShiftPresent(dayNum, 'nightShift')}
                          title={`Click to mark all staff PRESENT for Night Shift 🌙 on Day ${dayNum}`}
                          className="hover:text-indigo-500 cursor-pointer"
                        >
                          🌙
                        </button>
                      </div>
                    </th>
                  );
                })}

                {/* 5 Automated Summary Columns */}
                <th className="px-3 py-3 min-w-[80px] text-center bg-slate-50 border-r border-slate-200 font-mono text-slate-700 font-bold" title="1. TOTAL SHIFTS: Sum of P (1.0) and HD (0.5) from Day and Night shifts">TOTAL SHIFTS</th>
                <th className="px-3 py-3 min-w-[90px] text-right bg-slate-50 border-r border-slate-200 font-mono text-slate-700 font-bold" title="2. GROSS SALARY (JAMA / CREDIT): Total Shifts × Rate">JAMA</th>
                <th className="px-3 py-3 min-w-[90px] text-right bg-slate-50 border-r border-slate-200 font-mono text-slate-700 font-bold" title="3. ADVANCE TAKEN (UDHAR / DEBIT): Live sum of Khata register">ADVANCE</th>
                <th className="px-3 py-3 min-w-[100px] text-right bg-slate-50 border-r border-slate-200 font-mono text-slate-700 font-bold" title="4. NET PAYABLE (NET BALANCE): Total Jama - Total Udhar">BALANCE</th>
                <th className="px-3 py-3 min-w-[80px] text-center bg-slate-50 text-slate-700 font-bold">ACTION</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 font-semibold select-text">
              {roster.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 8} className="p-8 text-center text-slate-400 font-mono">
                    No staff employees in roster. Click <strong>"+ Add Staff Employee"</strong> to build your Hajri Patrak.
                  </td>
                </tr>
              ) : (
                roster.map((emp, idx) => {
                  const stats = getEmployeeStats(emp);

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                      {/* SR # */}
                      <td className="p-2 text-center bg-white font-mono font-extrabold text-slate-700 border-r border-slate-300 w-12 min-w-[48px] max-w-[48px] sticky left-0 z-10 group-hover:bg-slate-50">
                        {idx + 1}
                      </td>

                      {/* Employee Name & Mobile (Sticky Column - Clickable for Udhar-Jama Modal) */}
                      <td className="p-2 border-r border-slate-300 sticky left-12 bg-white group-hover:bg-slate-50 z-10 w-[180px] min-w-[180px] max-w-[180px]">
                        <div
                          onClick={() => setSelectedEmpDetail(emp)}
                          className="font-extrabold text-slate-900 text-xs truncate hover:text-orange-600 cursor-pointer flex items-center gap-1.5 group/name"
                          title="Click to open Udhar-Jama Debit-Credit Ledger"
                        >
                          <span className="group-hover/name:underline truncate">{emp.name}</span>
                          <CreditCard className="w-3.5 h-3.5 text-orange-500 shrink-0 opacity-80 group-hover/name:opacity-100" />
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{emp.mobile || 'No Mobile'}</span>
                        </div>
                      </td>

                      {/* Salary Type & Rate Selector & Input */}
                      <td className="p-1.5 border-r border-slate-300 text-right w-[140px] min-w-[140px] max-w-[140px] sticky left-[228px] bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                        <div className="flex items-center gap-1 justify-end">
                          <select
                            value={emp.salaryType || 'daily'}
                            onChange={(e) => handleSalaryTypeChange(emp.id, e.target.value)}
                            className="bg-slate-100 border border-slate-300 rounded px-1 py-0.5 text-[10px] font-bold text-slate-700 outline-none cursor-pointer"
                            title="Switch Salary Basis (Daily Wage vs Monthly Fixed)"
                          >
                            <option value="daily">/Day</option>
                            <option value="monthly">/Month</option>
                          </select>

                          {emp.salaryType === 'monthly' ? (
                            <input
                              type="number"
                              step="100"
                              value={emp.monthlySalary || ''}
                              onChange={(e) => handleMonthlySalaryChange(emp.id, e.target.value)}
                              className="w-16 bg-white border border-slate-300 rounded px-1 py-0.5 text-right font-mono text-xs font-bold text-emerald-800 outline-none focus:border-blue-600 select-text"
                              placeholder="18000"
                              title="Fixed Monthly Salary (₹)"
                            />
                          ) : (
                            <input
                              type="number"
                              step="10"
                              value={emp.dailyRate || ''}
                              onChange={(e) => handleDailyRateChange(emp.id, e.target.value)}
                              className="w-14 bg-white border border-slate-300 rounded px-1 py-0.5 text-right font-mono text-xs font-bold text-slate-900 outline-none focus:border-blue-600 select-text"
                              placeholder="600"
                              title="Daily Salary Wage Rate (₹)"
                            />
                          )}
                        </div>
                      </td>

                      {/* Day 1 to 31 Dual-Shift Cells (Stacked ☀️ Day & 🌙 Night Buttons) */}
                      {daysArray.map((dayNum) => {
                        const dayObj = getDayObject(emp.id, dayNum);

                        return (
                          <td key={dayNum} className="p-1 w-10 min-w-[40px] border border-slate-200 text-center align-middle">
                            <div className="flex flex-col gap-0.5 items-center justify-center">
                              {/* Day Shift Badge (6 AM - 6 PM) */}
                              <button
                                type="button"
                                title={`Day Shift (6 AM - 6 PM) - Day ${dayNum}: ${dayObj.dayShift || '-'}`}
                                onClick={() => handleCycleShiftStatus(emp.id, dayNum, 'dayShift')}
                                className={`w-full py-0.5 px-0.5 rounded text-[10px] font-extrabold flex items-center justify-center gap-0.5 border transition-all cursor-pointer select-none active:scale-95 ${getStatusStyle(dayObj.dayShift)}`}
                              >
                                <span className="text-[9px]">☀️</span>
                                <span>{dayObj.dayShift || '-'}</span>
                              </button>

                              {/* Night Shift Badge (6 PM - 6 AM) */}
                              <button
                                type="button"
                                title={`Night Shift (6 PM - 6 AM) - Day ${dayNum}: ${dayObj.nightShift || '-'}`}
                                onClick={() => handleCycleShiftStatus(emp.id, dayNum, 'nightShift')}
                                className={`w-full py-0.5 px-0.5 rounded text-[10px] font-extrabold flex items-center justify-center gap-0.5 border transition-all cursor-pointer select-none active:scale-95 ${getStatusStyle(dayObj.nightShift)}`}
                              >
                                <span className="text-[9px]">🌙</span>
                                <span>{dayObj.nightShift || '-'}</span>
                              </button>
                            </div>
                          </td>
                        );
                      })}

                      {/* 1. TOTAL SHIFTS */}
                      <td className="px-3 py-2 text-center font-bold text-slate-800 border-r border-slate-200 min-w-[80px]">
                        {stats.totalShiftsWorked.toFixed(1)}
                      </td>
                      
                      {/* 2. JAMA (₹) */}
                      <td className="px-3 py-2 text-right font-semibold text-emerald-600 border-r border-slate-200 min-w-[90px]">
                        ₹{stats.grossSalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>

                      {/* 3. ADVANCE (₹) */}
                      <td
                        onClick={() => setSelectedEmpDetail(emp)}
                        className="px-3 py-2 text-right font-semibold text-red-600 border-r border-slate-200 min-w-[90px] cursor-pointer hover:bg-red-50/60 transition-colors"
                        title="Click to view Udhar-Jama Ledger"
                      >
                        ₹{stats.totalAdvance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>

                      {/* 4. BALANCE (₹) */}
                      <td className="px-3 py-2 text-right font-bold text-slate-900 border-r border-slate-200 min-w-[100px] bg-amber-50/50">
                        ₹{stats.netPayableSalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2 text-center min-w-[80px]">
                        <button type="button"
                          onClick={() => handleDeleteEmployee(emp.id)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Remove Employee"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Table Footer - Locked to the Grid */}
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td
                  colSpan={3}
                  className="sticky left-0 z-20 bg-slate-100 px-4 py-3 text-left border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.05)]"
                >
                  <span className="font-extrabold text-slate-900 text-xs sm:text-sm tracking-wider uppercase">
                    DAILY TOTAL PRESENT STAFF
                  </span>
                </td>
                {daysArray.map((day) => (
                  <td
                    key={day}
                    className="px-2 py-3 w-10 min-w-[40px] text-center font-extrabold text-slate-900 text-xs border-r border-slate-200 bg-slate-100"
                  >
                    {getDailyTotalPresent(day)}
                  </td>
                ))}
                {/* Blank/summary alignment for Total Shifts, Jama, Advance, Balance, Actions */}
                <td colSpan={5} className="bg-slate-100"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* CLASSIC INDIAN EXCEL-STYLE "UDHAR - JAMA" LEDGER WORKSPACE MODAL */}
      {selectedEmpDetail && (() => {
        const stats = getEmployeeStats(selectedEmpDetail);
        const empAdvances = advancesMap[selectedEmpDetail.id] || [];
        const netBalance = stats.netPayableSalary; // Net Balance = Total Jama - Total Udhar

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn select-text">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 w-full max-w-5xl space-y-4 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
              
              {/* Modal Top Header Bar */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-slate-900 text-amber-400">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <span>{selectedEmpDetail.name}</span>
                      {selectedEmpDetail.mobile && (
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span>{selectedEmpDetail.mobile}</span>
                        </span>
                      )}
                    </h3>
                    <div className="text-xs text-slate-500 font-semibold flex items-center gap-2 mt-0.5">
                      <span>Month: <strong className="text-slate-800 font-bold">{monthName}</strong></span>
                      <span className="text-slate-300">|</span>
                      <span>Salary Rate: <strong className="text-slate-800 font-mono font-bold">{stats.effectiveRateLabel}</strong></span>
                      {selectedEmpDetail.address && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span>Address: <strong className="text-slate-700">{selectedEmpDetail.address}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrintKhataSlip(selectedEmpDetail)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Print Khata Slip</span>
                  </button>
                  <button type="button"
                    onClick={() => setSelectedEmpDetail(null)}
                    className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* 2-COLUMN SPLIT SCREEN: LEFT = 🟢 JAMA (CREDIT) | RIGHT = 🔴 UDHAR (DEBIT) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-y-auto min-h-0">
                
                {/* 🟢 LEFT SIDE: JAMA (EARNED SALARY / CREDIT) CONSOLIDATED SHIFT TABLE */}
                <div className="bg-emerald-50/30 border border-emerald-200/80 rounded-2xl p-3.5 space-y-3 flex flex-col min-h-0">
                  <div className="flex items-center justify-between bg-emerald-100/70 p-2.5 rounded-xl border border-emerald-200 shrink-0">
                    <div className="flex items-center gap-2">
                      <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
                      <h4 className="font-extrabold text-xs text-emerald-950 uppercase tracking-wide">
                        🟢 JAMA (EARNED SALARY / CREDIT)
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono font-extrabold text-emerald-800 bg-emerald-200/60 px-2.5 py-0.5 rounded-md">
                      {stats.totalShiftsWorked.toFixed(1)} Total Shifts
                    </span>
                  </div>

                  {/* Consolidated Jama Shift Summary Table Container */}
                  <div className="overflow-x-auto rounded-xl border border-emerald-200/90 shadow-2xs bg-white flex-1">
                    <table className="w-full text-left border-collapse font-sans text-xs">
                      <thead>
                        <tr className="bg-emerald-100/90 text-emerald-950 text-[11px] font-extrabold uppercase tracking-wider border-b border-emerald-200">
                          <th className="p-2.5 border-r border-emerald-200">PARTICULARS (MONTHLY SHIFTS)</th>
                          <th className="p-2.5 border-r border-emerald-200 text-center w-24 font-mono">TOTAL UNITS</th>
                          <th className="p-2.5 border-r border-emerald-200 text-right w-24 font-mono">RATE (₹)</th>
                          <th className="p-2.5 text-right w-28 font-mono">TOTAL EARNED (₹)</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-emerald-100 font-semibold select-text">
                        {/* Row 1: ☀️ Day Shifts */}
                        <tr className="hover:bg-emerald-50/50 transition-colors">
                          <td className="p-2.5 border-r border-emerald-100 text-slate-900 font-bold flex items-center gap-2">
                            <span>☀️ Day Shifts (6 AM – 6 PM)</span>
                            {stats.dayHD > 0 && (
                              <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1 rounded border border-amber-200">
                                ({stats.dayHD} HD)
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-mono font-extrabold text-blue-900 border-r border-emerald-100">
                            {stats.dayUnits.toFixed(1)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-600 border-r border-emerald-100">
                            ₹ {stats.effectiveDailyRate.toFixed(0)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-extrabold text-emerald-950">
                            ₹ {(stats.dayUnits * stats.effectiveDailyRate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                        </tr>

                        {/* Row 2: 🌙 Night Shifts */}
                        <tr className="hover:bg-emerald-50/50 transition-colors">
                          <td className="p-2.5 border-r border-emerald-100 text-slate-900 font-bold flex items-center gap-2">
                            <span>🌙 Night Shifts (6 PM – 6 AM)</span>
                            {stats.nightHD > 0 && (
                              <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1 rounded border border-amber-200">
                                ({stats.nightHD} HD)
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-mono font-extrabold text-indigo-900 border-r border-emerald-100">
                            {stats.nightUnits.toFixed(1)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-600 border-r border-emerald-100">
                            ₹ {stats.effectiveDailyRate.toFixed(0)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-extrabold text-emerald-950">
                            ₹ {(stats.nightUnits * stats.effectiveDailyRate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                        </tr>

                        {/* Row 3: ⭐ Total Monthly Shifts Worked */}
                        <tr className="bg-emerald-100/40 font-bold">
                          <td className="p-2.5 border-r border-emerald-200 text-emerald-950 font-black flex items-center gap-1.5">
                            <span>⭐ Total Monthly Shifts Worked</span>
                          </td>
                          <td className="p-2.5 text-center font-mono font-black text-blue-950 border-r border-emerald-200 text-sm">
                            {stats.totalShiftsWorked.toFixed(1)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-400 border-r border-emerald-200">—</td>
                          <td className="p-2.5 text-right font-mono font-black text-emerald-950 text-sm">
                            ₹ {stats.grossSalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Jama Total Footer */}
                  <div className="bg-emerald-100/80 border border-emerald-300 rounded-xl p-2.5 flex items-center justify-between shrink-0 font-mono">
                    <span className="font-extrabold text-xs text-emerald-950 uppercase font-sans">
                      TOTAL JAMA (CREDIT):
                    </span>
                    <span className="text-base font-black text-emerald-700">
                      ₹ {stats.grossSalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>

                {/* 🔴 RIGHT SIDE: UDHAR (ADVANCE / DEBIT) TABLE */}
                <div className="bg-rose-50/30 border border-rose-200/80 rounded-2xl p-3.5 space-y-3 flex flex-col min-h-0">
                  <div className="flex items-center justify-between bg-rose-100/70 p-2.5 rounded-xl border border-rose-200 shrink-0">
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="w-4 h-4 text-rose-700" />
                      <h4 className="font-extrabold text-xs text-rose-950 uppercase tracking-wide">
                        🔴 UDHAR (ADVANCE / DEBIT)
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddAdvanceRow(selectedEmpDetail.id)}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3 py-1 rounded-lg shadow-xs transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Udhar</span>
                    </button>
                  </div>

                  {/* Udhar Table Container */}
                  <div className="overflow-x-auto rounded-xl border border-rose-200/90 shadow-2xs bg-white flex-1 min-h-[220px]">
                    <table className="w-full text-left border-collapse font-sans text-xs">
                      <thead>
                        <tr className="bg-rose-100/90 text-rose-950 text-[11px] font-extrabold uppercase tracking-wider border-b border-rose-200">
                          <th className="p-2 border-r border-rose-200 w-8 text-center font-mono">#</th>
                          <th className="p-2 border-r border-rose-200 w-28">DATE</th>
                          <th className="p-2 border-r border-rose-200 text-right w-28">AMOUNT (₹)</th>
                          <th className="p-2 border-r border-rose-200">REASON / DETAILS</th>
                          <th className="p-2 text-center w-10">ACT</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-rose-100 font-semibold select-text">
                        {/* Optional Opening Balance Carryforward Row */}
                        {stats.openingBal > 0 && (
                          <tr className="bg-amber-50/60 font-bold border-b border-rose-200">
                            <td className="p-1.5 text-center font-mono font-bold text-amber-800 border-r border-rose-200">★</td>
                            <td className="p-1 border-r border-rose-200 font-mono text-xs text-slate-700">Opening Bal</td>
                            <td className="p-1 border-r border-rose-200 text-right font-mono font-black text-rose-700">
                              ₹ {stats.openingBal.toLocaleString('en-IN')}
                            </td>
                            <td className="p-1 border-r border-rose-200 text-slate-600 text-xs italic">Previous Month Carryforward</td>
                            <td className="p-1 text-center text-slate-400">—</td>
                          </tr>
                        )}

                        {empAdvances.length === 0 && stats.openingBal === 0 ? (
                          <tr>
                            <td colSpan="5" className="p-6 text-center text-rose-400 font-mono text-xs">
                              No Udhar (Advances) taken in {monthName}. Click <strong>"+ Add Udhar"</strong> to record.
                            </td>
                          </tr>
                        ) : (
                          empAdvances.map((adv, aIdx) => (
                            <tr key={adv.id || aIdx} className="hover:bg-rose-50/50 transition-colors">
                              <td className="p-1.5 text-center bg-rose-50/40 font-mono font-extrabold text-rose-800 border-r border-rose-200">
                                {aIdx + 1}
                              </td>
                              <td className="p-1 border-r border-rose-200">
                                <input
                                  type="date"
                                  value={adv.date}
                                  onChange={(e) => handleAdvanceChange(selectedEmpDetail.id, aIdx, 'date', e.target.value)}
                                  className="w-full bg-white border border-rose-200 rounded px-1.5 py-0.5 font-mono text-xs font-bold text-slate-900 outline-none focus:border-rose-500 select-text"
                                />
                              </td>
                              <td className="p-1 border-r border-rose-200 text-right">
                                <NumericInput
                                  step="10"
                                  value={adv.amount}
                                  onChange={(v) => handleAdvanceChange(selectedEmpDetail.id, aIdx, 'amount', v)}
                                  className="w-full bg-white text-rose-950 font-mono font-extrabold border border-rose-200 rounded px-1.5 py-0.5 text-right text-xs outline-none focus:border-rose-500 shadow-2xs"
                                  placeholder="0.00"
                                />
                              </td>
                              <td className="p-1 border-r border-rose-200">
                                <input
                                  type="text"
                                  value={adv.description}
                                  onChange={(e) => handleAdvanceChange(selectedEmpDetail.id, aIdx, 'description', e.target.value)}
                                  placeholder="e.g. Festival advance, Medical, Fuel"
                                  className="w-full bg-white border border-rose-200 rounded px-1.5 py-0.5 text-slate-900 font-medium text-xs outline-none focus:border-rose-500 select-text"
                                />
                              </td>
                              <td className="p-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAdvanceRow(selectedEmpDetail.id, aIdx)}
                                  className="p-1 rounded text-rose-400 hover:text-rose-700 hover:bg-rose-100 transition-colors"
                                  title="Delete Udhar Entry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Udhar Total Footer */}
                  <div className="bg-rose-100/80 border border-rose-300 rounded-xl p-2.5 flex items-center justify-between shrink-0 font-mono">
                    <span className="font-extrabold text-xs text-rose-950 uppercase font-sans">
                      TOTAL UDHAR (DEBIT):
                    </span>
                    <span className="text-base font-black text-rose-700">
                      ₹ {stats.totalAdvance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>

              </div>

              {/* 🧮 BOTTOM FINAL SETTLEMENT BANNER (NET BALANCE HISAAB) */}
              <div className={`p-4 rounded-2xl border-2 transition-all shrink-0 ${
                netBalance >= 0 
                  ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950 shadow-xs' 
                  : 'bg-rose-50/90 border-rose-400 text-rose-950 shadow-xs'
              }`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs uppercase tracking-wide font-sans">
                        {netBalance >= 0 ? '🟢 NET PAYABLE TO STAFF (CHUKTI RAKAM):' : '🔴 EXCESS ADVANCE OWED BY STAFF (BAKI UDHAR):'}
                      </span>
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        netBalance >= 0 ? 'bg-emerald-200/80 text-emerald-900 border border-emerald-300' : 'bg-rose-200/80 text-rose-900 border border-rose-300'
                      }`}>
                        {netBalance >= 0 ? 'Pump will pay employee' : 'Staff owes money to pump'}
                      </span>
                    </div>

                    <div className="text-xs font-mono font-semibold text-slate-700">
                      Formula: Total Jama (₹ {stats.grossSalary.toLocaleString('en-IN')}) - Total Udhar (₹ {stats.totalAdvance.toLocaleString('en-IN')})
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`font-mono text-2xl font-black ${
                      netBalance >= 0 ? 'text-emerald-900' : 'text-rose-700'
                    }`}>
                      ₹ {Math.abs(netBalance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase font-sans">
                      {netBalance >= 0 ? 'Final Payout Amount' : 'Outstanding Recovery Balance'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Bottom Action Buttons Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3 shrink-0">
                <button
                  type="button"
                  onClick={() => handlePrintKhataSlip(selectedEmpDetail)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs transition-all active:scale-95 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>Print Khata Slip (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveModalAndClose}
                  className="bg-slate-900 text-white hover:bg-slate-800 px-6 py-2.5 rounded-xl text-xs font-extrabold shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Save & Close</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal to Add New Employee */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-lg space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-extrabold text-slate-900">Add Staff Employee to Roster</h3>
              </div>
              <button type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleAddEmployee(e); }} className="space-y-3.5 text-xs font-semibold">
              {/* Employee Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Employee Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                  placeholder="e.g. Ramesh Shinde"
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Grid for Mobile & Aadhaar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Employee Mobile Number *
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={newEmployee.mobile}
                    onChange={(e) => setNewEmployee({ ...newEmployee, mobile: e.target.value.replace(/\D/g, '') })}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-white text-slate-900 font-mono border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Employee Aadhaar Number
                  </label>
                  <input
                    type="text"
                    maxLength={12}
                    value={newEmployee.aadhaarNumber}
                    onChange={(e) => setNewEmployee({ ...newEmployee, aadhaarNumber: e.target.value.replace(/\D/g, '') })}
                    placeholder="12-digit Aadhaar Number"
                    className="w-full bg-white text-slate-900 font-mono border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Employee Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Employee Address
                </label>
                <input
                  type="text"
                  value={newEmployee.address}
                  onChange={(e) => setNewEmployee({ ...newEmployee, address: e.target.value })}
                  placeholder="e.g. House No, Village/Town, District"
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Opening Balance */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Opening Balance (₹) [Advance / Udhar Carryforward]
                </label>
                <input
                  type="number"
                  value={newEmployee.openingBalance || ''}
                  onChange={(e) => setNewEmployee({ ...newEmployee, openingBalance: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="w-full bg-white text-slate-900 font-mono border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-right"
                />
              </div>

              {/* Salary Basis Selector Option */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1 font-bold">
                  Salary Calculation Basis *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewEmployee({ ...newEmployee, salaryType: 'daily' })}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      newEmployee.salaryType === 'daily'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    📅 Daily Wage (₹ / Day)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEmployee({ ...newEmployee, salaryType: 'monthly' })}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      newEmployee.salaryType === 'monthly'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    🏢 Fixed Monthly (₹ / Month)
                  </button>
                </div>
              </div>

              {/* Conditional Rate or Monthly Salary Input */}
              {newEmployee.salaryType === 'monthly' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fixed Monthly Salary (₹ / Month) *</label>
                  <input
                    type="number"
                    required
                    step="100"
                    placeholder="e.g. 18000"
                    value={newEmployee.monthlySalary}
                    onChange={(e) => setNewEmployee({ ...newEmployee, monthlySalary: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono text-emerald-700 font-bold focus:border-blue-600"
                  />
                  <span className="text-[10px] text-slate-500 font-normal block mt-1">
                    Per-day rate will be calculated automatically based on total days ({daysInMonth} days) in {monthName}.
                  </span>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Daily Salary Wage Rate (₹ / Day) *</label>
                  <input
                    type="number"
                    required
                    step="10"
                    placeholder="e.g. 600"
                    value={newEmployee.dailyRate}
                    onChange={(e) => setNewEmployee({ ...newEmployee, dailyRate: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono text-emerald-700 font-bold focus:border-blue-600"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white font-bold shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  Add Employee to Roster
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
