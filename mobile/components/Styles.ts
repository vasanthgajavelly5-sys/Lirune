import { StyleSheet, ViewStyle } from 'react-native';

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  safeArea: {
    flex: 1,
  } as ViewStyle,
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  spaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as ViewStyle,
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  } as ViewStyle,
});