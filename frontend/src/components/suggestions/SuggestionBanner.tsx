import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSuggestions, respondSuggestion } from '@/lib/api'
import { useUIStore } from '@/store/useUIStore'
import SuggestionCard from './SuggestionCard'

export default function SuggestionBanner() {
  const queryClient = useQueryClient()
  const addToast = useUIStore((s) => s.addToast)

  const { data: suggestions = [] } = useQuery({
    queryKey: ['suggestions'],
    queryFn: getSuggestions,
  })

  const pending = suggestions.filter((s) => s.status === 'pending')

  if (pending.length === 0) return null

  async function handleRespond(id: number, action: 'accept' | 'reject' | 'snooze') {
    await respondSuggestion(id, action)
    await queryClient.invalidateQueries({ queryKey: ['suggestions'] })
    const messages: Record<typeof action, string> = {
      accept: 'Dauerauftrag erstellt',
      reject: 'Vorschlag abgelehnt',
      snooze: 'Vorschlag zurückgestellt',
    }
    addToast(messages[action], 'success')
  }

  return (
    <div className="flex flex-col gap-2">
      <SuggestionCard suggestion={pending[0]} onRespond={handleRespond} />
    </div>
  )
}
