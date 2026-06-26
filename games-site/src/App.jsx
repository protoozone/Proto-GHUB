import { BrowserRouter, Routes, Route } from "react-router-dom"
import Home from "./pages/Home"
import GameLoader from "./pages/games/GameLoader"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/games/:gameId" element={<GameLoader />} />
      </Routes>
    </BrowserRouter>
  )
}