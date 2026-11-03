import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_TOKEN_KEY = 'liveapp_auth_token_v1';
const DEVICE_ID_KEY = 'liveapp_device_id_v1';

export async function getSecureToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch (error) {
    console.warn('[SecureStore] Failed to read token', error);
    return null;
  }
}

export async function setSecureToken(token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch (error) {
    console.error('[SecureStore] Failed to save token', error);
  }
}

export async function removeSecureToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  } catch (error) {
    console.error('[SecureStore] Failed to remove token', error);
  }
}

export async function getStoredDeviceId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

export async function setStoredDeviceId(deviceId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  } catch (error) {
    console.warn('[SecureStore] Failed to store deviceId', error);
  }
}

