import { Alert } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

interface ShareWhatsAppParams {
  imageUri: string;
  customerPhone: string;
  messageText: string;
}

export const shareInvoiceToWhatsApp = async ({ imageUri, customerPhone, messageText }: ShareWhatsAppParams) => {
  try {
    if (!customerPhone) {
      throw new Error("Customer phone number is required.");
    }

    // Clean phone number: remove non-digits
    let cleanedPhone = customerPhone.replace(/\D/g, '');
    
    // If it's a 10 digit Indian number, prefix with '91'
    if (cleanedPhone.length === 10) {
      cleanedPhone = '91' + cleanedPhone;
    }

    const isExpoGo = 
      Constants.appOwnership === 'expo' || 
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
      
    if (isExpoGo) {
      // In Expo Go, we cannot use react-native-share to attach images directly.
      // Fallback to standard WhatsApp deep link which goes to the exact chat, 
      // but without the image attached.
      const { Linking } = require('react-native');
      const url = `whatsapp://send?phone=${cleanedPhone}&text=${encodeURIComponent(messageText)}`;
      try {
        await Linking.openURL(url);
        return true;
      } catch (err) {
        Alert.alert('WhatsApp Error', 'Could not open WhatsApp. Please ensure it is installed on your device.');
        return false;
      }
    }

    // Dynamically require react-native-share to prevent Expo Go from crashing on startup
    let Share;
    try {
      Share = require('react-native-share').default;
    } catch (importError) {
      Alert.alert(
        'Development Build Required', 
        'Direct WhatsApp sharing requires custom native code that is not available in Expo Go. Please build the APK to test this feature.'
      );
      return false;
    }

    const shareOptions = {
      title: 'Share Invoice',
      url: imageUri,
      type: 'image/jpeg',
      message: messageText,
      social: Share.Social.WHATSAPP,
      whatsAppNumber: cleanedPhone, // Add country code-prefixed number here
      filename: `invoice_${Date.now()}`, // Helpful for Android to handle the file
    };

    try {
      await Share.shareSingle(shareOptions as any);
    } catch (err: any) {
      // Fallback to WhatsApp Business if standard WhatsApp is not installed or fails
      if (err?.message?.includes('not installed') || err?.message?.includes('app not installed')) {
        shareOptions.social = Share.Social.WHATSAPPBUSINESS;
        await Share.shareSingle(shareOptions as any);
      } else {
        throw err;
      }
    }
    return true;
  } catch (error: any) {
    // If user cancelled, it's not a real error.
    if (error?.message === 'User did not share') {
      return false;
    }
    console.error('Error sharing to WhatsApp:', error);
    Alert.alert('WhatsApp Error', 'Could not open WhatsApp. Ensure it is installed on your device.');
    return false;
  }
};
