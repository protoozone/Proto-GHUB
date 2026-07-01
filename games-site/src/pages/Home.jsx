import { Link } from "react-router-dom"

export default function Home() {
    return (
    <>
    <br></br>
    <div id="center">
        <div>
        <h1>Proto's Gaming Hub</h1>
        <br></br>
        <p>
            Welcome to my gaming hub. Here, I host several classic game <br></br> 
            spinoff's so I don't get sued by big board game and so you <br></br>
            can enjoy the classics anytime anywhere you want. 
        </p>
        <br></br>
        <p>
            If you have any suggestions for improvements, please feel <br></br>
            free to reach out on my Twitter here: https://x.com/Protosplo
        </p>
        <br></br>
        <p>
            This site will never host ads, or charge for content. If you'd <br></br>
            like to install a copy of the source code yourself, feel free to <br></br>
            do so via the following github link: https://github.com/protoozone/Proto-GHUB/tree/main/games-site
        </p>
        <br></br>
        {/*
        <p>
            Here's also a link to my ko-fi, donations are entirely optional, <br></br>
            so only feel free to if you have the means and enjoy: <code>zzz</code>
        </p>
        */}

        <br></br>

        <div class="row">
        <div class="column"><Link to="/games/Big_Worm">Play Big Worm</Link></div>
        <div class="column"><Link to="/games/Copyright_Free_Chess_TM">Play Copyright Free Chess (tm)</Link></div>
        <div class="column"><Link to="/games/Flip_A_Coin">Flip A Coin</Link></div>
        <div class="column"><Link to="/games/Rolling_Dice">Roll Dice</Link></div>
        </div>

        <div class="row">
        <div class="column">Coming Soon</div>
        <div class="column">Coming Soon</div>
        <div class="column">Coming Soon</div>
        <div class="column">Coming Soon</div>
        </div>
        </div>
    </div>
    </>  
    )
}