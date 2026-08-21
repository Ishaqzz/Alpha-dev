/**
 * SecureDeleteModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-platform modal that challenges the user with biometrics (if enabled)
 * or a 4-digit PIN before allowing a destructive action.
 *
 * Usage:
 *   <SecureDeleteModal
 *     visible={showModal}
 *     actionLabel="Delete Bill BILL-0012"
 *     onVerified={() => { /* perform the delete *\/ }}
 *     onCancel={() => setShowModal(false)}
 *   />
 */
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  hasPinSet,
  getStoredPin,
  getBiometricsEnabled,
} from '@/utils/authStorage';

const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

type Props = {
  visible: boolean;
  /** Short description displayed in the modal, e.g. "Delete Bill BILL-0012" */
  actionLabel: string;
  /** Called after the user is successfully verified */
  onVerified: () => void;
  /** Called when the user cancels or verification fails */
  onCancel: () => void;
};

export default function SecureDeleteModal({
  visible,
  actionLabel,
  onVerified,
  onCancel,
}: Props) {
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [hasBio, setHasBio] = useState(false);
  const [noPinSet, setNoPinSet] = useState(false);
  const [error, setError] = useState('');

  // When modal opens: check PIN + biometric state, auto-try biometrics
  useEffect(() => {
    if (!visible) {
      setPin('');
      setError('');
      setChecking(false);
      return;
    }
    (async () => {
      setChecking(true);
      const pinExists = await hasPinSet();
      if (!pinExists) {
        setNoPinSet(true);
        setChecking(false);
        return;
      }
      setNoPinSet(false);

      const bioEnabled = await getBiometricsEnabled();
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const canUseBio = bioEnabled && hasHardware && isEnrolled;
      setHasBio(canUseBio);

      if (canUseBio) {
        // Auto-trigger biometrics prompt
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: actionLabel,
          cancelLabel: 'Use PIN instead',
          disableDeviceFallback: true,
        });
        if (result.success) {
          setChecking(false);
          onVerified();
          return;
        }
      }
      setChecking(false);
    })();
  }, [visible]);

  const handlePinConfirm = async () => {
    if (pin.length !== 4) {
      setError('PIN must be exactly 4 digits.');
      return;
    }
    setChecking(true);
    setError('');
    const stored = await getStoredPin();
    if (pin === stored) {
      setChecking(false);
      onVerified();
    } else {
      setChecking(false);
      setPin('');
      setError('Incorrect PIN. Please try again.');
    }
  };

  const handleBioRetry = async () => {
    setChecking(true);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: actionLabel,
      cancelLabel: 'Use PIN instead',
      disableDeviceFallback: true,
    });
    setChecking(false);
    if (result.success) {
      onVerified();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Red accent top bar */}
          <View style={styles.dangerAccent} />

          {/* Icon + title */}
          <View style={styles.iconRow}>
            <MaterialCommunityIcons name="shield-lock" size={28} color="#EF4444" />
          </View>
          <Text style={styles.title}>Secure Delete</Text>
          <Text style={styles.actionLabel} numberOfLines={2}>{actionLabel}</Text>

          {noPinSet ? (
            <>
              <Text style={styles.errorText}>
                No Admin PIN is configured.{'\n'}
                Set a PIN in Admin Settings first.
              </Text>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText}>OK</Text>
              </TouchableOpacity>
            </>
          ) : checking ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#EF4444" />
              <Text style={styles.loadingText}>Verifying…</Text>
            </View>
          ) : (
            <>
              {/* PIN input */}
              <Text style={styles.pinLabel}>ENTER 4-DIGIT ADMIN PIN</Text>
              <TextInput
                style={styles.pinInput}
                value={pin}
                onChangeText={(t) => {
                  setError('');
                  setPin(t.replace(/[^0-9]/g, '').slice(0, 4));
                }}
                placeholder="• • • •"
                placeholderTextColor="#6B7280"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                autoFocus
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* Biometrics retry */}
              {hasBio && (
                <TouchableOpacity
                  style={styles.bioBtn}
                  onPress={handleBioRetry}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="fingerprint" size={18} color="#DEB841" />
                  <Text style={styles.bioBtnText}>Use Biometrics Instead</Text>
                </TouchableOpacity>
              )}

              {/* Confirm / Cancel */}
              <View style={styles.buttonsRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, pin.length !== 4 && styles.confirmBtnDisabled]}
                  onPress={handlePinConfirm}
                  disabled={pin.length !== 4}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.confirmBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    paddingBottom: 24,
  },
  dangerAccent: {
    height: 4,
    backgroundColor: '#DEB841', // Brand Gold
  },
  iconRow: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  title: {
    fontFamily: systemFont,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  actionLabel: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  pinLabel: {
    fontFamily: systemFont,
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 10,
  },
  pinInput: {
    fontFamily: systemFont,
    height: 52,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    marginHorizontal: 24,
    paddingHorizontal: 20,
    fontSize: 24,
    color: '#111827',
    fontWeight: '900',
    letterSpacing: 12,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  errorText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  bioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
  },
  bioBtnText: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '700',
    color: '#DEB841',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  loadingText: {
    fontFamily: systemFont,
    fontSize: 14,
    color: '#9CA3AF',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 24,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '800',
    color: '#4B5563',
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#DEB841', // Brand Gold
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmBtnDisabled: {
    backgroundColor: '#FBBF24',
    opacity: 0.6,
  },
  confirmBtnText: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

