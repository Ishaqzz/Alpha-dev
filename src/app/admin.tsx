import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { useNavigation } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useDrawerSwipeGesture } from '@/hooks/useDrawerSwipeGesture';
import Header from '@/components/Header';
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  getStoredPin,
  setStoredPin,
  deleteStoredPin,
  hasPinSet,
  getBiometricsEnabled,
  setBiometricsEnabled,
} from '@/utils/authStorage';

const { width } = Dimensions.get('window');

// ── Web Fallback Font for Symmetrical Browser Display ──
const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

export default function AdminScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const swipeHandlers = useDrawerSwipeGesture();

  // Form State
  const [managerName, setManagerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // ── Security & PIN state ──────────────────────────────────────────────────
  const [pinExists, setPinExists] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);

  // PIN form fields
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

  // Load store settings + security state on mount
  const loadSecurityState = useCallback(async () => {
    const [hasPIN, bioEnabled, hasBio] = await Promise.all([
      hasPinSet(),
      getBiometricsEnabled(),
      LocalAuthentication.hasHardwareAsync(),
    ]);
    setPinExists(hasPIN);
    setBiometricsEnabledState(bioEnabled);
    setBiometricsAvailable(hasBio);
  }, []);

  useEffect(() => {
    // ── Real-time listener for store settings ─────────────────────────────
    // onSnapshot fires immediately with the current value, then on every
    // subsequent Firestore write — so the admin form always reflects the
    // latest backend state without a manual refresh.
    const settingsRef = doc(db, 'settings', 'store_config');
    const unsubscribeSettings = onSnapshot(
      settingsRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setManagerName(data.manager_name || '');
          setContactNumber(data.manager_phone || '');
          setStoreAddress(data.store_address || '');
          setGstNumber(data.gst_number || '');
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('Settings listener error:', error);
        setIsLoading(false);
      }
    );

    loadSecurityState();

    return () => {
      unsubscribeSettings(); // clean up when screen unmounts
    };
  }, [loadSecurityState]);

  // Dynamic Live Time state
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSaveSettings = async () => {
    if (isSavingSettings) return;
    try {
      setIsSavingSettings(true);
      const docRef = doc(db, 'settings', 'store_config');
      await setDoc(docRef, {
        manager_name: managerName,
        manager_phone: contactNumber,
        store_address: storeAddress,
        gst_number: gstNumber,
        updated_at: serverTimestamp(), // ← timestamp so other clients know when it changed
      }, { merge: true });
      // The onSnapshot listener will instantly reflect the saved values back —
      // no need to manually re-read the document.
      Alert.alert('✓ Saved', 'Store settings updated successfully. Changes are live.');
    } catch (error) {
      Alert.alert('Error', 'Failed to update settings. Please check your connection.');
      console.error('Save settings error:', error);
    } finally {
      setIsSavingSettings(false);
    }
  };


  // ── PIN handlers ────────────────────────────────────────────────────────────

  /** Validates a value is exactly 4 numeric digits. */
  const isValidPin = (value: string) => /^\d{4}$/.test(value);

  const handleSetOrChangePin = async () => {
    // If a PIN already exists, verify the current PIN first
    if (pinExists) {
      if (!isValidPin(currentPin)) {
        Alert.alert('Invalid PIN', 'Current PIN must be a 4-digit number.');
        return;
      }
      const stored = await getStoredPin();
      if (stored !== currentPin) {
        Alert.alert('Incorrect PIN', 'The current PIN you entered is wrong. Please try again.');
        return;
      }
    }

    if (!isValidPin(newPin)) {
      Alert.alert('Invalid PIN', 'New PIN must be exactly 4 digits (numbers only).');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('PIN Mismatch', 'New PIN and Confirm PIN do not match. Please try again.');
      return;
    }

    try {
      setPinSaving(true);
      await setStoredPin(newPin);
      setPinExists(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      Alert.alert('Success', pinExists ? 'PIN changed successfully!' : 'PIN set successfully!');
    } catch {
      Alert.alert('Error', 'Failed to save PIN. Please try again.');
    } finally {
      setPinSaving(false);
    }
  };

  const handleRemovePin = async () => {
    if (pinExists) {
      if (!isValidPin(currentPin)) {
        Alert.alert('PIN Required', 'Please enter your current PIN in the field above to remove it.');
        return;
      }
      const stored = await getStoredPin();
      if (stored !== currentPin) {
        Alert.alert('Incorrect PIN', 'The current PIN you entered is wrong.');
        return;
      }
    }

    Alert.alert(
      'Remove PIN',
      'Are you sure you want to remove the admin PIN? This will disable PIN protection.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteStoredPin();
            // Also disable biometrics when PIN is removed
            await setBiometricsEnabled(false);
            setPinExists(false);
            setBiometricsEnabledState(false);
            setCurrentPin('');
            setNewPin('');
            setConfirmPin('');
            Alert.alert('Removed', 'PIN has been removed successfully.');
          },
        },
      ]
    );
  };

  const handleBiometricsToggle = async (value: boolean) => {
    if (value) {
      // Biometrics can only be enabled when a PIN exists
      if (!pinExists) {
        Alert.alert(
          'PIN Required',
          'Please set a PIN first before enabling biometric unlock.'
        );
        return;
      }
      // Check if enrolled biometrics are available
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert(
          'No Biometrics Enrolled',
          'No fingerprint or face data is enrolled on this device. Please set up biometrics in your device settings first.'
        );
        return;
      }
    }
    await setBiometricsEnabled(value);
    setBiometricsEnabledState(value);
  };

  // Helper formatting for Live Clock
  const formatTime = (date: Date) => {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let seconds = date.getSeconds();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    const secondsStr = seconds < 10 ? '0' + seconds : seconds;
    return `${hours}:${minutesStr}:${secondsStr} ${ampm}`;
  };

  const formatDate = (date: Date) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  return (
    <View style={styles.root} {...swipeHandlers}>
      {/* ── Global Header Component ── */}
      <Header />

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#B45309" />
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {/* ── Gold Accent Header Banner & Profile Section ── */}
        <View style={styles.profileHeaderCard}>
          <View style={styles.goldBanner} />
          
          <View style={styles.avatarRow}>
            {/* Overlapping Profile Avatar */}
            <View style={styles.overlappingAvatarContainer}>
              <Image
                source={require('../../assets/images/logo.jpeg')}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            </View>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.saveSettingsBtn, isSavingSettings && { opacity: 0.7 }]}
                onPress={handleSaveSettings}
                disabled={isSavingSettings}
                activeOpacity={0.8}
              >
                {isSavingSettings ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveSettingsBtnText}>Save Settings</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Profile Name & Subtitle Info */}
          <View style={styles.profileMetaInfo}>
            <Text style={styles.profileName}>{managerName.toUpperCase()}</Text>
            <Text style={styles.profileSubtitle}>STORE MANAGER @ ALPHA SPORTS WEAR</Text>
          </View>
        </View>

        {/* ── Store Management Form Card ── */}
        <View style={styles.formCard}>
          <Text style={styles.formCardTitle}>STORE MANAGEMENT</Text>
          
          {/* Responsive Inputs: Stack on narrow, inline on wide */}
          <View style={styles.inputsResponsiveRow}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Store Manager Name</Text>
              <TextInput
                style={styles.textInput}
                value={managerName}
                onChangeText={setManagerName}
                placeholder="Enter Manager Name"
              />
            </View>

            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Contact Number</Text>
              <TextInput
                style={styles.textInput}
                value={contactNumber}
                onChangeText={setContactNumber}
                placeholder="Enter Contact Number"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.fullWidthInputCol}>
            <Text style={styles.inputLabel}>Store Address / Details</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              value={storeAddress}
              onChangeText={setStoreAddress}
              placeholder="Enter Store Address"
              multiline={true}
              numberOfLines={3}
            />
          </View>

          <View style={[styles.fullWidthInputCol, { marginTop: 16 }]}>
            <Text style={styles.inputLabel}>GST Number (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={gstNumber}
              onChangeText={setGstNumber}
              placeholder="Enter GST Number"
              autoCapitalize="characters"
            />
          </View>
        </View>

        {/* ── System Status Card ── */}
        <View style={styles.statusCard}>
          <View style={styles.statusCardTopBorder} />
          
          <View style={styles.statusHeaderRow}>
            <Text style={styles.statusTitle}>SYSTEM STATUS</Text>
            
            <View style={styles.connectionIndicatorRow}>
              <View style={styles.greenDot} />
              <Text style={styles.connectionText}>Connected to Firebase</Text>
            </View>
          </View>

          {/* Dynamic Clock Row */}
          <View style={styles.clockResponsiveRow}>
            <View style={styles.clockCol}>
              <Text style={styles.clockLabel}>CURRENT DATE</Text>
              <Text style={styles.clockValue}>{formatDate(currentTime)}</Text>
            </View>
            
            <View style={[styles.clockCol, styles.clockRightCol]}>
              <Text style={styles.clockLabel}>CURRENT TIME</Text>
              <Text style={styles.clockValue}>{formatTime(currentTime)}</Text>
            </View>
          </View>
        </View>

        {/* ── Security & PIN Management Card ── */}
        <View style={styles.securityCard}>
          <View style={styles.securityCardTopBorder} />

          {/* Section Header */}
          <View style={styles.securityHeaderRow}>
            <MaterialCommunityIcons name="shield-lock" size={18} color="#DEB841" />
            <Text style={styles.securityTitle}>SECURITY & PIN MANAGEMENT</Text>
          </View>

          {/* PIN status badge */}
          <View style={styles.pinStatusRow}>
            <View style={[styles.pinStatusBadge, pinExists ? styles.pinStatusActive : styles.pinStatusInactive]}>
              <MaterialCommunityIcons
                name={pinExists ? 'lock-check' : 'lock-open-outline'}
                size={13}
                color={pinExists ? '#065F46' : '#92400E'}
              />
              <Text style={[styles.pinStatusText, pinExists ? styles.pinStatusActiveText : styles.pinStatusInactiveText]}>
                {pinExists ? 'PIN Active' : 'No PIN Set'}
              </Text>
            </View>
          </View>

          {/* Current PIN field — only shown if a PIN already exists */}
          {pinExists && (
            <View style={styles.pinFieldGroup}>
              <Text style={styles.pinFieldLabel}>Current PIN</Text>
              <TextInput
                style={styles.pinInput}
                value={currentPin}
                onChangeText={(t) => setCurrentPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="Enter current 4-digit PIN"
                placeholderTextColor="#6B7280"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
            </View>
          )}

          {/* New PIN */}
          <View style={styles.pinFieldGroup}>
            <Text style={styles.pinFieldLabel}>{pinExists ? 'New 4-Digit PIN' : 'Set 4-Digit PIN'}</Text>
            <TextInput
              style={styles.pinInput}
              value={newPin}
              onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="Enter new 4-digit PIN"
              placeholderTextColor="#6B7280"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
          </View>

          {/* Confirm PIN */}
          <View style={styles.pinFieldGroup}>
            <Text style={styles.pinFieldLabel}>Confirm New PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={confirmPin}
              onChangeText={(t) => setConfirmPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="Re-enter new 4-digit PIN"
              placeholderTextColor="#6B7280"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
          </View>

          {/* Save / Change PIN button */}
          <TouchableOpacity
            style={[styles.pinActionBtn, pinSaving && styles.pinActionBtnDisabled]}
            onPress={handleSetOrChangePin}
            disabled={pinSaving}
            activeOpacity={0.8}
          >
            {pinSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialCommunityIcons name={pinExists ? 'lock-reset' : 'lock-plus'} size={16} color="#FFFFFF" />
                <Text style={styles.pinActionBtnText}>{pinExists ? 'Change PIN' : 'Set PIN'}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.securityDivider} />

          {/* Biometrics toggle — shown when hardware is available */}
          {biometricsAvailable && (
            <View style={styles.biometricsRow}>
              <View style={styles.biometricsLabelGroup}>
                <MaterialCommunityIcons name="fingerprint" size={22} color="#DEB841" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.biometricsLabel}>Biometric Quick-Unlock</Text>
                  <Text style={styles.biometricsSubLabel}>Use fingerprint / face to unlock</Text>
                </View>
              </View>
              <Switch
                value={biometricsEnabled}
                onValueChange={handleBiometricsToggle}
                trackColor={{ false: '#D1D5DB', true: '#B45309' }}
                thumbColor={biometricsEnabled ? '#DEB841' : '#FFFFFF'}
              />
            </View>
          )}

          {/* Remove PIN — destructive action, only when a PIN is set */}
          {pinExists && (
            <TouchableOpacity
              style={styles.removePinBtn}
              onPress={handleRemovePin}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={15} color="#EF4444" />
              <Text style={styles.removePinBtnText}>Remove PIN</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  profileHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  goldBanner: {
    height: 70,
    backgroundColor: '#DEB841', // Gold top bar
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: -38, // Overlap calculation
  },
  overlappingAvatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    padding: 2,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingBottom: 4,
  },
  saveSettingsBtn: {
    backgroundColor: '#DEB841', // Gold background
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    shadowColor: '#DEB841',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  saveSettingsBtnText: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  logoutBtn: {
    backgroundColor: '#FFF1F2', // Light red background
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logoutBtnText: {
    fontFamily: systemFont,
    color: '#EF4444', // Red text
    fontSize: 13,
    fontWeight: '800',
  },
  profileMetaInfo: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  profileName: {
    fontFamily: systemFont,
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.5,
  },
  profileSubtitle: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 4,
    letterSpacing: 1,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  formCardTitle: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '900',
    color: '#9CA3AF',
    letterSpacing: 1,
    marginBottom: 20,
  },
  inputsResponsiveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  inputCol: {
    flex: 1,
    minWidth: 240,
    marginBottom: 16,
  },
  fullWidthInputCol: {
    width: '100%',
    marginBottom: 8,
  },
  inputLabel: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '800',
    color: '#4B5563',
    marginBottom: 8,
  },
  textInput: {
    fontFamily: systemFont,
    height: 44,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  multilineInput: {
    height: 80,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 20,
    marginBottom: 20,
  },
  statusCardTopBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#DEB841', // Gold top accent line
  },
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
  },
  statusTitle: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '900',
    color: '#DEB841', // Gold title
    letterSpacing: 1,
  },
  connectionIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981', // Green indicator dot
  },
  connectionText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
  },
  clockResponsiveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  clockCol: {
    flex: 1,
    minWidth: 200,
  },
  clockRightCol: {
    ...Platform.select({
      web: {
        alignItems: 'flex-end',
      },
    }),
  },
  clockLabel: {
    fontFamily: systemFont,
    fontSize: 10,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 1,
    marginBottom: 6,
  },
  clockValue: {
    fontFamily: systemFont,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },

  // ── Security & PIN Management ────────────────────────────────────────────────
  securityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 20,
    marginBottom: 20,
  },
  securityCardTopBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#DEB841',
  },
  securityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  securityTitle: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '900',
    color: '#DEB841',
    letterSpacing: 1,
  },
  pinStatusRow: {
    marginBottom: 20,
  },
  pinStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pinStatusActive: {
    backgroundColor: '#D1FAE5',
  },
  pinStatusInactive: {
    backgroundColor: '#FEF3C7',
  },
  pinStatusText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '700',
  },
  pinStatusActiveText: {
    color: '#065F46',
  },
  pinStatusInactiveText: {
    color: '#92400E',
  },
  pinFieldGroup: {
    marginBottom: 14,
  },
  pinFieldLabel: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  pinInput: {
    fontFamily: systemFont,
    height: 46,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    fontSize: 18,
    color: '#111827',
    fontWeight: '700',
    letterSpacing: 6,
  },
  pinActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#B45309',
    paddingVertical: 13,
    borderRadius: 8,
    marginTop: 6,
    shadowColor: '#B45309',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  pinActionBtnDisabled: {
    opacity: 0.6,
  },
  pinActionBtnText: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  securityDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 20,
  },
  biometricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  biometricsLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  biometricsLabel: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  biometricsSubLabel: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  removePinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingVertical: 11,
    borderRadius: 8,
  },
  removePinBtnText: {
    fontFamily: systemFont,
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
  },
});

