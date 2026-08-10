import { Link } from "react-router-dom"
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const styles = `
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-height: 100vh;

    background-color: #0a0520;
    background-image:
        linear-gradient(rgba(80, 0, 200, 0.4) 1px, transparent 1px),
        linear-gradient(90deg, rgba(80, 0, 200, 0.4) 1px, transparent 1px);
    background-size: 36px 36px;
  }

  .hub-page {
    display: flex;
    flex-direction: row;
    min-height: 100vh;
    width: 100%;
    background: #08041a;
  }

  /* ── Dark centre ── */
  .hub-mid {
    flex: 1;
    background: #08041a;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1.5rem 3rem;
    text-align: center;

    margin: 0 -1px;
  }

  /* ── Title ── */
  .hub-title-wrap {
    position: relative;
    display: inline-block;
    line-height: 1;
    transform: skewX(-14deg);
    margin-bottom: 1.5rem;
  }

  .hub-title-shadow,
  .hub-title-base,
  .hub-title-outline {
    font-family: Impact, 'Arial Black', sans-serif;
    letter-spacing: -0.5px;
    font-size: clamp(2.8rem, 6vw, 5.5rem);
    font-style: italic;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    line-height: 1;
    display: block;
    white-space: nowrap;
  }

  .hub-title-shadow {
    position: absolute;
    top: 0; left: 0;
    z-index: 1;
    color: #06011f;
    transform: translate(5px, 6px);
  }

  .hub-title-base {
    position: relative;
    z-index: 2;
    background: linear-gradient(
      to bottom,
      #c084f5 0%,
      #1a1a8c 17%,
      #00bcd4 33%,
      #b0f0ff 50%,
      #1a1a8c 50%,
      #00bcd4 75%,
      #b0f0ff 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .hub-title-outline {
    position: absolute;
    top: 0; left: 0;
    z-index: 3;
    -webkit-text-stroke: 0.5px rgba(255, 255, 255, 0.85);
    -webkit-text-fill-color: transparent;
    color: transparent;
  }

  /* ── Body text ── */
  .hub-mid p {
    color: rgba(220, 210, 255, 0.85);
    line-height: 1.7;
    margin: 0 0 1rem;
  }

  /* ── Game cards ── */
  .row {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 16px;
    width: 100%;
  }

  .column {
    flex: 0 0 160px;
  }

  .game-card {
    background: rgba(14, 8, 40, 0.85);
    border: 1px solid rgba(0, 188, 212, 0.3);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .game-card-art {
    width: 100%;
    aspect-ratio: 1;
    background: rgba(26, 26, 140, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    color: rgba(150, 130, 200, 0.6);
    padding: 8px;
    text-align: center;
  }

  .game-card-art img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .game-card-actions {
    display: flex;
    width: 100%;
    border-top: 1px solid rgba(0, 188, 212, 0.2);
  }

  .game-card-actions a,
  .game-card-actions button {
    flex: 1;
    padding: 8px 4px;
    font-size: 0.7rem;
    text-align: center;
    color: #b0f0ff;
    text-decoration: none;
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
    line-height: 1.3;
    font-family: inherit;
  }

  .game-card-actions a:hover,
  .game-card-actions button:hover {
    background: rgba(0, 188, 212, 0.12);
  }

  .game-card-actions .divider {
    width: 1px;
    background: rgba(0, 188, 212, 0.2);
    flex-shrink: 0;
  }

  .coming-soon-card {
    background: rgba(14, 8, 40, 0.5);
    border: 1px solid rgba(80, 0, 200, 0.2);
    border-radius: 10px;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(150, 130, 200, 0.35);
    font-size: 0.75rem;
  }
`

const GameCard = ({ to, name, artSrc }) => (
  <div className="game-card">
    <div className="game-card-art">
      {artSrc
        ? <img src={artSrc} alt={name} onError={e => { e.target.style.display = 'none'; e.target.parentNode.querySelector('span').style.display = 'block' }} />
        : null
      }
      <span style={{ display: artSrc ? 'none' : 'block' }}>{name}</span>
    </div>
    <div className="game-card-actions">
      <Link to={to}>Play on Web</Link>
      <div className="divider" />
      <button onClick={() => {
        if (window.matchMedia('(display-mode: standalone)').matches) {
          window.location.href = to
        } else {
          alert('This feature is yet to be added.')
        }
      }}>Play Local</button>
    </div>
  </div>
)

export default function Home() {
  const navigate = useNavigate()
  useEffect(() => {
    if (window.location.search.includes('from_game=true')) {
      navigate('/', { replace: true })
    }
  }, [])

  return (
    <>
      <style>{styles}</style>
      <div className="hub-page">

        {/* Left tron wall */}
        <div className="tron-wall tron-wall-left" />

        {/* Dark centre */}
        <div className="hub-mid">
          <br />
          <h1 className="hub-title-wrap" aria-label="Proto's Gaming Hub">
            <span className="hub-title-shadow" aria-hidden="true">Proto's Gaming Hub</span>
            <span className="hub-title-base" aria-hidden="true">Proto's Gaming Hub</span>
            <span className="hub-title-outline" aria-hidden="true">Proto's Gaming Hub</span>
          </h1>
          <br />
          <p>
            Welcome to my gaming hub. Here, I host several classic game <br />
            spinoff's so I don't get sued by big board game and so you <br />
            can enjoy the classics anytime anywhere you want.
          </p>
          <br />
          <p>
            If you have any suggestions for improvements, please feel <br />
            free to leave a comment via my Kofi on: https://ko-fi.com/protozone 
          </p>
          <br />
          <p>
            This site will never host ads, or charge for content. If you'd <br />
            like to install a copy of the source code yourself, feel free to <br />
            do so via the following github link: <br />
            https://github.com/protoozone/Proto-GHUB/tree/main/games-site
          </p>
          <br />
          <p>
            Donations are entirely optional, so only feel free to if you have <br /> 
            the means and enjoy. 
          </p>
          <br /><br />
          <div className="row">
            <div className="column"><GameCard to="/games/Big_Worm" name="Big Worm" artSrc="/assets/big_worm.png" /></div>
            <div className="column"><GameCard to="/games/Copyright_Free_Chess_TM" name="Copyright Free Chess (tm)" artSrc="/assets/chess.png" /></div>
            <div className="column"><GameCard to="/games/Flip_A_Coin" name="Flip A Coin" artSrc="/assets/flip_a_coin.png" /></div>
            <div className="column"><GameCard to="/games/Rolling_Dice" name="Roll Dice" artSrc="/assets/rolling_dice.png" /></div>
          </div>
          <div className="row">
            <div className="column"><GameCard to="/games/Demolition" name="Demolition" artSrc="/assets/demolition.png" /></div>
            <div className="column"><GameCard to="/games/DontLu" name="DontLu" artSrc="/assets/'dontlu'.png" /></div>
            <div className="column"><GameCard to="/games/Lil_Shooter" name="Lil Shooter" artSrc="/assets/'lilshooter'.png" /></div>
            <div className="column"><GameCard to="/games/Clocks_Out" name="Clock's Out" artSrc="/assets/'clocksout'.png" /></div>
          </div>
          <div className="row">
            <div className="column"><div className="coming-soon-card">Coming Soon</div></div>
            <div className="column"><GameCard to="/games/Five_Dice" name="Five Dice" artSrc="/assets/'fivedice'.png" /></div>
            <div className="column"><GameCard to="/games/Who_Put_All_These_Bombs_Everywhere" name="Who Put All These Bombs Everywhere?!" artSrc="/assets/'wpatbe'.png" /></div>
            <div className="column"><div className="coming-soon-card">Coming Soon</div></div>
          </div>
          <div className="row">
            <div className="column"><GameCard to="/games/Connect_N" name="Connect N" artSrc="/assets/'connectN'.png" /></div>
            <div className="column"><div className="coming-soon-card">Coming Soon</div></div>
            <div className="column"><div className="coming-soon-card">Coming Soon</div></div>
            <div className="column"><div className="coming-soon-card">Coming Soon</div></div>
          </div>
        </div>

        {/* Right tron wall */}
        <div className="tron-wall tron-wall-right" />

      </div>
    </>
  )
}