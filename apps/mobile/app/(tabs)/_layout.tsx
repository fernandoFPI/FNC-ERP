import { Tabs } from 'expo-router'
import { View, Text } from 'react-native'
import { SyncStatusBar } from '@/components/SyncStatusBar'

function TabIcon({ label, active }: { label: string; active: boolean }) {
  const icons: Record<string, string> = {
    Attendance: '⏱',
    Approvals: '✓',
    Projects: '📋',
    Leave: '📅',
    Equipment: '🔧',
  }
  return (
    <Text style={{ fontSize: 20, opacity: active ? 1 : 0.5 }}>
      {icons[label] ?? '●'}
    </Text>
  )
}

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <SyncStatusBar />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#1a3c5e',
          tabBarInactiveTintColor: '#9ca3af',
          tabBarStyle: { borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: 'white' },
        }}
      >
        <Tabs.Screen
          name="attendance"
          options={{
            title: 'Attendance',
            tabBarIcon: ({ focused }) => <TabIcon label="Attendance" active={focused} />,
          }}
        />
        <Tabs.Screen
          name="approvals"
          options={{
            title: 'Approvals',
            tabBarIcon: ({ focused }) => <TabIcon label="Approvals" active={focused} />,
          }}
        />
        <Tabs.Screen
          name="projects"
          options={{
            title: 'Projects',
            tabBarIcon: ({ focused }) => <TabIcon label="Projects" active={focused} />,
          }}
        />
        <Tabs.Screen
          name="leave"
          options={{
            title: 'Leave',
            tabBarIcon: ({ focused }) => <TabIcon label="Leave" active={focused} />,
          }}
        />
        <Tabs.Screen
          name="equipment"
          options={{
            title: 'Equipment',
            tabBarIcon: ({ focused }) => <TabIcon label="Equipment" active={focused} />,
          }}
        />
      </Tabs>
    </View>
  )
}
