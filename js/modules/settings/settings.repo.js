import { get, put } from '../../db/idb.js';
import { DEFAULT_SETTINGS } from '../../db/schema.js';

export async function getSettings() {
  const record = await get('meta', 'settings');
  return { ...DEFAULT_SETTINGS, ...record?.value };
}

export async function updateSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await put('meta', { key: 'settings', value: settings });
  return settings;
}
