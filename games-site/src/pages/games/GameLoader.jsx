import { useParams } from "react-router-dom"

export default function GameLoader() {
  const { gameId } = useParams()

  return (
    <iframe
      src={`/games/${gameId}/index.html`}
      width="100%"
      height="600px"
      title={gameId}
    />
  )
}