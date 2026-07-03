import { useParams, useNavigate } from "react-router-dom"
import { useEffect } from "react"

export default function GameLoader() {
  const { gameId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    function handleMessage(e) {
      if (e.data === 'returnToHub') {
        navigate('/')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [navigate])

  return (
    <iframe
      src={`/games/${gameId}/index.html`}
      style={{
        width: '100%',
        height: '100dvh',
        border: 'none',
        display: 'block',
      }}
      title={gameId}
    />
  )
}