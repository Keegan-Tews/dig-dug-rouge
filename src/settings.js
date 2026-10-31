// Player settings that persist between visits (sound, music, screen shake).

const KEY = 'tunnelpop_settings';

export const DEFAULT_SETTINGS = { sound: true, music: true, shake: true };

export function loadSettings(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, settings) {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); settings still apply this session.
  }
}
