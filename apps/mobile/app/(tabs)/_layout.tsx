import { Tabs } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';

export default function TabsLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' }}>
        <ActivityIndicator color="#E11D48" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#E11D48',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: { backgroundColor: '#111827', borderTopColor: '#1F2937' },
        headerStyle: { backgroundColor: '#111827' },
        headerTintColor: '#F9FAFB',
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transações' }} />
      <Tabs.Screen name="accounts" options={{ title: 'Contas' }} />
      <Tabs.Screen name="cards" options={{ title: 'Cartões' }} />
      <Tabs.Screen name="settings" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
