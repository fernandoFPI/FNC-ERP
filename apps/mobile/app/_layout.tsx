import { Stack } from 'expo-router'
import { useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
import { randomUUID } from 'expo-crypto'
import { syncEngine } from '@/sync/SyncEngine'

export default function RootLayout() {
  useEffect(() => {
    void (async () => {
      let deviceId = await SecureStore.getItemAsync('device_id')
      if (!deviceId) {
        deviceId = randomUUID()
        await SecureStore.setItemAsync('device_id', deviceId)
      }
      await syncEngine.initialize(deviceId)
    })()

    return () => syncEngine.destroy()
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="material-issue" options={{ presentation: 'modal', headerShown: true, title: 'Material Issue' }} />
      <Stack.Screen name="usage-log" options={{ presentation: 'modal', headerShown: true, title: 'Daily Usage Log' }} />
      <Stack.Screen name="condition-report" options={{ presentation: 'modal', headerShown: true, title: 'Condition Report' }} />
    </Stack>
  )
}
