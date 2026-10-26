import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { vendorApi } from './api';

/**
 * Lets the vendor choose a photo and uploads it to the public image bucket.
 * Resolves to the key to save plus a URI to preview with, or null if they
 * cancelled or the upload failed (the failure has already been shown to them).
 */
export async function pickVendorImage(
  kind: 'logo' | 'listing',
): Promise<{ key: string; previewUri: string } | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Allow photo library access to choose an image.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    // The server accepts up to 5 MB; compressing keeps phone-camera photos well under that.
    quality: 0.7,
    allowsEditing: true,
    aspect: kind === 'logo' ? [1, 1] : [4, 3],
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  try {
    const { key, publicUrl } = await vendorApi.uploadImage(kind, { uri: asset.uri, mimeType: asset.mimeType });
    return { key, previewUri: publicUrl ?? asset.uri };
  } catch (err: any) {
    Alert.alert('Upload failed', err?.message ?? 'Could not upload the image. Please try again.');
    return null;
  }
}
