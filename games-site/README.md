# Proto's Game Hub
Welcome to Proto's Game Hub!
This project serves as both a preservation and work sample project for myself, and will prioritise recreating various games and experiences that are fully downloadable for offline use, host fully cached webpages, and are as small in size as I can get them. 

# Technical Jargon
This project uses a React, Vite, HTML, Javascript framework with Proggressive Web App implementations to install and run games from mobile or via laptop or PC. 
Src contains the Home and About pages as well as the Game Page router, and all games are kept in the games folder, each possessing an index, one or more mid files, and the javascript itself. 
The game router is in data under games.js, and the midi player is in public. 

# Current Status
The project currently hosts:
- Big Worm
- Chess
- Flip A Coin
- Roll Dice
- Demolition
- DontLu
- Lil Shooter
- Clock's Out
- Pocket Balls
- Five Dice
- Who Put All These Bombs Everywhere?
- Connect N

# Local Installation and Running
```
git clone https://github.com/protoozone/Proto-GHUB.git
cd Proto-GHUB/games-site
npm install
npm run dev
```

# Self-Hosting
```
npm run build
npx serve dist
(or) 
Vercel
(or anything else you're comfortable using)
```

# Roadmap
Up next for implementation:
- More rule and handicap varieties for chess
- Konkey Dong
- Polished balls on a table with pockets
- A man shaped like a puc, call him puc man
- Connecting between 3 and 5 things

And for future plans, we have: 
- A bunch of small fellas shooting each other
- Make many jumps to scale a tower
- Punch your way through an alley
- With this amount of bullets, this place might be hell
- This tower really needs some defending
- Cards by yourself
- Big words daily
- Roguelike (not lite)
- A bunch of marbles entering side pockets
- A bunch of tokens entering my pockets
- Bankruptcy
- Polished tokens on a table with pockets and some white dust
- Settlers of alarm
- Checkers but Chinese
- Sparrow

# License
This project is licensed under the GNU General Public License v3.0.

You are free to use, modify, and self-host this project. 
The only restriction is that you may not privatise it or use it 
for commercial purposes. Any derivative work must remain open 
source under the same license.

See LICENSE for details.


# 0.2 Patch Notes (common game name in brackets)
- Added 5 dice (Yahtzee)
- Added DontLu (Ludo)
- Added Clock's Out [this one's an original]
- Added Little Shooter (Space Invaders)
- Added Demolition (Brick Breaker)

# 0.3 Patch Notes 
- Added Who Put All These Bombs Everywhere? (Minesweeper)
- Added Connect N (Tic Tac Toe and Gomoku)
- Still having issues with Pocket Balls (Pool)
- Puckman is actually kinda complicated (Pacman)