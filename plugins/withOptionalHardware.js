/**
 * Marks hardware features as optional so Google Play doesn't hide the app from tablets,
 * Chromebooks and other large-screen devices.
 *
 * Android infers "required" features from permissions and settings: the portrait lock implies
 * android.hardware.screen.portrait, network/Wi-Fi permissions imply android.hardware.wifi, CAMERA
 * implies a camera, RECORD_AUDIO a microphone. None of them is essential here (camera is only
 * for scanning an Access ID QR code, the mic only for voice notes), so declare them
 * required="false". An explicit <uses-feature> overrides the implied one.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = [
  'android.hardware.screen.portrait',
  'android.hardware.wifi',
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.microphone',
];

module.exports = function withOptionalHardware(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    const features = (manifest['uses-feature'] = manifest['uses-feature'] || []);
    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find((f) => f.$?.['android:name'] === name);
      const attrs = { 'android:name': name, 'android:required': 'false', 'tools:replace': 'android:required' };
      if (existing) existing.$ = { ...existing.$, ...attrs };
      else features.push({ $: attrs });
    }
    return cfg;
  });
};
