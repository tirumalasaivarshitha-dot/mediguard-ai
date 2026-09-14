import { useEffect, useState } from 'react'
import { getConnectionState, subscribeConnection, connectRealtime } from '@/services/realtime'
import type { ConnectionState } from '@/types'

export function useConnection() {
  const [state, setState] = useState<ConnectionState>(getConnectionState)

  useEffect(() => {
    connectRealtime()
    return subscribeConnection(setState)
  }, [])

  return state
}
