import { useParams } from "react-router-dom"
export default function GameLoader() {
  const { gameId } = useParams()
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