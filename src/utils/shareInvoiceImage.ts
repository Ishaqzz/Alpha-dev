import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Alert } from 'react-native';

export const shareInvoiceAsImage = async (viewShotRef: React.RefObject<any>) => {
  try {
    if (!viewShotRef.current) {
      throw new Error("Receipt view is not ready for capture.");
    }

    // Wait a brief moment to ensure layout is fully rendered
    await new Promise(resolve => setTimeout(resolve, 300));

    // Capture the view
    const uri = await captureRef(viewShotRef, {
      format: 'jpg',
      quality: 0.9,
    });

    // Check sharing availability
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      return;
    }

    // Share via native share sheet
    await Sharing.shareAsync(uri, {
      mimeType: 'image/jpeg',
      dialogTitle: 'Share Invoice',
    });
    
    return true;
  } catch (error: any) {
    console.error('Error sharing invoice as image:', error);
    Alert.alert('Share Error', error.message || 'Could not capture and share invoice.');
    return false;
  }
};
