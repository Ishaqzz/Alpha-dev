import { useRef } from 'react';
import { PanResponder } from 'react-native';
import { useNavigation } from 'expo-router';
import { DrawerNavigationProp } from 'expo-router/drawer';

/**
 * useDrawerSwipeGesture
 * ─────────────────────────────────────────────────────────────────────────────
 * Attaches a PanResponder to the screen's root View so that:
 *  • Swiping RIGHT from the left edge  → opens the drawer
 *  • Swiping LEFT  (any position)      → closes the drawer (native behaviour)
 *
 * Usage:
 *   const swipeHandlers = useDrawerSwipeGesture();
 *   return <View style={styles.root} {...swipeHandlers}>...</View>;
 *
 * NOTE: Uses navigation.openDrawer() directly via DrawerNavigationProp to
 * avoid importing from @react-navigation/native, which is blocked in SDK 56.
 */
export function useDrawerSwipeGesture() {
  // DrawerNavigationProp exposes openDrawer() / closeDrawer() natively
  const navigation = useNavigation<DrawerNavigationProp<any>>();

  const panResponder = useRef(
    PanResponder.create({
      // Never steal the initial press — buttons and inputs still work normally
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,

      // Claim the responder only when:
      //   1. The gesture started within 40 px of the left edge
      //   2. The swipe is moving rightward (dx > 0)
      //   3. Horizontal delta clearly outweighs vertical (avoids false triggers during scroll)
      onMoveShouldSetPanResponder: (evt, gs) => {
        const originX = evt.nativeEvent.pageX - gs.dx; // where the finger first landed
        return (
          originX < 40 &&                          // started near the left edge
          gs.dx > 8 &&                             // moved right at least 8 px
          Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 // horizontal bias
        );
      },
      onMoveShouldSetPanResponderCapture: () => false,

      // Open the drawer when the swipe distance is at least 30 px rightward
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 30) {
          navigation.openDrawer();
        }
      },

      onPanResponderTerminate: () => {},
    })
  ).current;

  return panResponder.panHandlers;
}
