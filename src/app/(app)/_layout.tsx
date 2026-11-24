import { Redirect, Stack } from 'expo-router';
import { useAccountFromLink, useAppGuard, useEndAddingOutsideAuth, useFeatureRedirect } from '@/lib/authGuard';
import { View } from 'react-native';

import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';
import { WorkspaceSetupGate } from '@/hooks/useWorkspaceSetup';
import { useTheme } from '@/theme/ThemeProvider';

/** Every signed-in screen, with the bottom bar drawn over all of them. */
export default function AppLayout() {
  const { colors } = useTheme();
  const guard = useAppGuard();
  const featureRedirect = useFeatureRedirect();
  useEndAddingOutsideAuth();
  useAccountFromLink();
  if (guard.redirect) return <Redirect href={guard.redirect} />;
  if (!guard.ready) return null;
  if (featureRedirect) return <Redirect href={featureRedirect} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
      <FloatingTabBar />
      <WorkspaceSetupGate />
    </View>
  );
}
