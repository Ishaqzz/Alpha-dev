import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type MaterialDatePickerProps = {
  visible: boolean;
  initialDate: string | null;
  onClose: () => void;
  onSetDate: (date: string | null) => void;
};

export default function MaterialDatePicker({
  visible,
  initialDate,
  onClose,
  onSetDate,
}: MaterialDatePickerProps) {
  // Calendar Year & Month States
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  
  // Highlighted Date State
  const [tempSelectedDate, setTempSelectedDate] = useState<string | null>(null);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Synchronize initial selection on mount/show
  useEffect(() => {
    if (visible) {
      const today = new Date();
      const activeDate = initialDate || `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
      setTempSelectedDate(activeDate);
      
      const parts = activeDate.split('/');
      if (parts.length === 3) {
        setCurrentMonth(parseInt(parts[1], 10) - 1);
        setCurrentYear(parseInt(parts[2], 10));
      }
    }
  }, [visible, initialDate]);

  if (!visible) return null;

  // ── Calendar Helpers ─────────────────────────────────────────────────────
  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const formatHeaderDate = (dateString: string | null): string => {
    if (!dateString) return 'Select Date';
    const parts = dateString.split('/');
    if (parts.length !== 3) return 'Select Date';
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    const date = new Date(y, m, d);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${weekdays[date.getDay()]}, ${d} ${months[date.getMonth()]}`;
  };

  const getHeaderYear = (dateString: string | null): string => {
    if (!dateString) return new Date().getFullYear().toString();
    const parts = dateString.split('/');
    return parts[2] || new Date().getFullYear().toString();
  };

  // Generate calendar days grid
  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const cells: { key: string; label: string; value: string | null; isFuture?: boolean }[] = [];
  
  for (let i = 0; i < firstDay; i++) {
    cells.push({ key: `empty-${i}`, label: '', value: null });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(currentYear, currentMonth, d);
    const isFuture = cellDate > today;
    cells.push({ 
      key: `day-${d}`, 
      label: `${d}`, 
      value: `${d}/${currentMonth + 1}/${currentYear}`,
      isFuture
    });
  }

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.dialogContainer}>
        {/* Header Section */}
        <View style={styles.dialogHeader}>
          <Text style={styles.dialogHeaderYear}>{getHeaderYear(tempSelectedDate)}</Text>
          <Text style={styles.dialogHeaderDate}>{formatHeaderDate(tempSelectedDate)}</Text>
        </View>

        {/* Body Section */}
        <View style={styles.dialogBody}>
          {/* Month navigation header */}
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.calNavBtn}>
              <MaterialCommunityIcons name="chevron-left" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.calendarMonthText}>
              {monthNames[currentMonth]} {currentYear}
            </Text>
            <TouchableOpacity onPress={handleNextMonth} style={styles.calNavBtn}>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Weekdays Row */}
          <View style={styles.weekDaysRow}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((wd, index) => (
              <Text key={`${wd}-${index}`} style={styles.weekDayCell}>
                {wd}
              </Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.daysGrid}>
            {cells.map((cell) => {
              const isSelected = tempSelectedDate === cell.value;
              return (
                <TouchableOpacity
                  key={cell.key}
                  style={[
                    styles.dayCellBtn,
                    isSelected && styles.dayCellBtnSelected,
                    !cell.value && styles.dayCellBtnEmpty,
                  ]}
                  disabled={!cell.value || cell.isFuture}
                  onPress={() => cell.value && setTempSelectedDate(cell.value)}
                >
                  <Text
                    style={[
                      styles.dayCellText,
                      isSelected && styles.dayCellTextSelected,
                      !cell.value && styles.dayCellTextEmpty,
                      cell.isFuture && styles.dayCellTextDisabled,
                    ]}
                  >
                    {cell.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Footer Section */}
        <View style={styles.dialogFooter}>
          <TouchableOpacity
            onPress={() => {
              setTempSelectedDate(null);
              onSetDate(null);
            }}
            style={styles.footerBtn}
          >
            <Text style={styles.footerBtnText}>CLEAR</Text>
          </TouchableOpacity>
          <View style={styles.footerRightBtns}>
            <TouchableOpacity onPress={onClose} style={styles.footerBtn}>
              <Text style={styles.footerBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSetDate(tempSelectedDate)} style={styles.footerBtn}>
              <Text style={styles.footerBtnText}>SET</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  dialogContainer: {
    width: 328,
    backgroundColor: '#2D2D2D', // Material dark dialog color
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  dialogHeader: {
    backgroundColor: '#383838', // Header dark grey background
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#212121',
  },
  dialogHeaderYear: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dialogHeaderDate: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 4,
  },
  dialogBody: {
    padding: 16,
    backgroundColor: '#2D2D2D',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  calNavBtn: {
    padding: 6,
    borderRadius: 20,
  },
  calendarMonthText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekDayCell: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellBtn: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 99, // Circle highlight
    marginVertical: 2,
  },
  dayCellBtnSelected: {
    backgroundColor: '#D0E2FF', // Light blue circle
  },
  dayCellBtnEmpty: {
    backgroundColor: 'transparent',
  },
  dayCellText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dayCellTextSelected: {
    color: '#000000', // Black text inside light blue circle
    fontWeight: '900',
  },
  dayCellTextEmpty: {
    color: 'transparent',
  },
  dayCellTextDisabled: {
    color: 'rgba(255, 255, 255, 0.2)',
  },
  dialogFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2D2D2D',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
  },
  footerRightBtns: {
    flexDirection: 'row',
    gap: 16,
  },
  footerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  footerBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DEB841', // Gold footer buttons matching theme
    letterSpacing: 0.5,
  },
});

