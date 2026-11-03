import { Camera } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';

export interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

export async function requestLiveStreamPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return true;

  // Camera
  const cameraStatus = await Camera.getCameraPermissionsAsync();
  let cameraGranted = cameraStatus.granted;

  if (!cameraGranted && cameraStatus.canAskAgain) {
    const res = await Camera.requestCameraPermissionsAsync();
    cameraGranted = res.granted;
  }

  // Microphone
  const micStatus = await Camera.getMicrophonePermissionsAsync();
  let micGranted = micStatus.granted;

  if (!micGranted && micStatus.canAskAgain) {
    const res = await Camera.requestMicrophonePermissionsAsync();
    micGranted = res.granted;
  }

  if (!cameraGranted || !micGranted) {
    Alert.alert(
      'Permissions Required',
      'Live streaming requires camera and microphone permissions. Please enable them in system settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }

  return true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

