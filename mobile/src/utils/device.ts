import { getStoredDeviceId, setStoredDeviceId } from './secureStorage';

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const existing = await getStoredDeviceId();
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }

  // Generate a stable unique device id
  const randomPart1 = Math.random().toString(36).substring(2, 12);
  const randomPart2 = Math.random().toString(36).substring(2, 12);
  const newDeviceId = `and_${Date.now()}_${randomPart1}${randomPart2}`.slice(0, 36);

  await setStoredDeviceId(newDeviceId);
  cachedDeviceId = newDeviceId;
  return newDeviceId;
}
