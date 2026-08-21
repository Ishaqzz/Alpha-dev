/**
 * authStorage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised helpers for PIN and biometric settings stored via
 * expo-secure-store.  All SecureStore keys live here so they never drift
 * out of sync between screens.
 */

import * as SecureStore from 'expo-secure-store';

// ── Storage keys ──────────────────────────────────────────────────────────────
export const KEYS = {
  PIN:              'alpha_admin_pin',
  BIOMETRICS_ENABLED: 'alpha_biometrics_enabled',
} as const;

// ── PIN helpers ───────────────────────────────────────────────────────────────

/** Returns the stored PIN string, or null if no PIN has been set. */
export async function getStoredPin(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.PIN);
  } catch {
    return null;
  }
}

/**
 * Persists a new 4-digit PIN.
 * Throws if SecureStore fails so the caller can surface the error.
 */
export async function setStoredPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.PIN, pin);
}

/** Deletes the stored PIN entirely. */
export async function deleteStoredPin(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEYS.PIN);
  } catch {
    // already gone — not an error
  }
}

/** Returns true when a PIN has been previously saved. */
export async function hasPinSet(): Promise<boolean> {
  const pin = await getStoredPin();
  return pin !== null && pin.length === 4;
}

// ── Biometric preference helpers ──────────────────────────────────────────────

/** Returns the saved biometric-unlock preference (defaults to false). */
export async function getBiometricsEnabled(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(KEYS.BIOMETRICS_ENABLED);
    return val === 'true';
  } catch {
    return false;
  }
}

/** Persists the biometric-unlock preference. */
export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEYS.BIOMETRICS_ENABLED, enabled ? 'true' : 'false');
}
