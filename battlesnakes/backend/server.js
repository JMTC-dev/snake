const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const port = process.env.PORT || 3000;
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- Game Related ---
let gameState = 'lobby'; // Possible states: 'lobby', 'ingame'
let currentGamemode = 'competitive'; // 'competitive' or 'cooperative'
let activeGamemode = 'competitive'; // Gamemode for the currently active game session
let teamScore = 0; // Used in cooperative mode

const players = {}; // Store player states, keyed by socket.id
const gridSize = 20; // This might be deprecated if client gridSize is fully dynamic. Server uses fixed tile counts.
const FIXED_TILE_COUNT_X = 40;
const FIXED_TILE_COUNT_Y = 30;

let food = { x: -1, y: -1, color: 'red' }; // Initial food state

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Sets up a player object for the lobby state
function initializeLobbyPlayer(socketId) {
    players[socketId] = {
        id: socketId,
        color: getRandomColor(),
        isReady: false,
        score: 0,
        // Game-specific properties like x, y, body, dx, dy will be added by setupPlayerForGame()
    };
    return players[socketId];
}

// Sets up/resets a player's snake for starting a game
function setupPlayerForGame(player) {
    // Ensure new players don't spawn on top of each other (basic check)
    let startX, startY, collision;
    const existingPlayerPositions = Object.values(players).filter(p => p.x !== undefined).map(p => ({x: p.x, y: p.y}));

    do {
        collision = false;
        startX = Math.floor(Math.random() * FIXED_TILE_COUNT_X);
        startY = Math.floor(Math.random() * FIXED_TILE_COUNT_Y);
        for (const pos of existingPlayerPositions) {
            if (pos.x === startX && pos.y === startY) {
                collision = true;
                break;
            }
        }
    } while (collision);

    player.x = startX;
    player.y = startY;
    player.body = [{ x: startX, y: startY }]; // Start with 1 segment, can grow
    // Initial body with 3 segments for consistency with previous logic:
    // player.body = [{ x: startX, y: startY }, { x: startX - 1, y: startY }, { x: startX - 2, y: startY }];
    // Ensure initial segments are within bounds if starting near edge, or simplify to 1 segment.
    // For simplicity, let's ensure body segments are added safely:
    let currentX = startX;
    for (let i = 1; i < 3; i++) { // Add 2 more segments
        if (currentX -1 >= 0) { // Check boundary before adding
            player.body.push({x: currentX -1, y: startY});
            currentX--;
        } else { // If at edge, try adding other way or stop
            break;
        }
    }

    player.dx = 1; // Initial direction: right
    player.dy = 0;
    player.score = 0;
    player.isAlive = true; // Player starts alive
    // player.isReady remains as is, or could be reset if needed after game starts
}

function spawnFood() {
    let onSnake;
    do {
        onSnake = false;
        food.x = Math.floor(Math.random() * FIXED_TILE_COUNT_X);
        food.y = Math.floor(Math.random() * FIXED_TILE_COUNT_Y);

        for (const playerId in players) {
            const player = players[playerId];
            if (player.isAlive && player.body) {
                for (const segment of player.body) {
                    if (segment.x === food.x && segment.y === food.y) {
                        onSnake = true;
                        break;
                    }
                }
            }
            if (onSnake) break;
        }
    } while (onSnake);
    console.log(`Food spawned at {x: ${food.x}, y: ${food.y}}`);
}

function checkAllPlayersReady() {
    if (Object.keys(players).length === 0) return false; // No players to start
    // For testing, let's allow 1 player to start. For a real game, might be Object.keys(players).length < 2
    if (Object.keys(players).length < 1) return false;

    return Object.values(players).every(player => player.isReady);
}

function startGame() {
    if (gameState === 'ingame') return; // Prevent starting if already in game

    console.log("Attempting to start game...");
    gameState = 'ingame';
    activeGamemode = currentGamemode; // Lock in the gamemode for this session
    teamScore = 0; // Reset team score

    Object.values(players).forEach(player => {
        setupPlayerForGame(player);
    });
    spawnFood(); // Spawn initial food

    const gameStartingData = { players, food, gamemode: activeGamemode };
    io.emit('gameStarting', gameStartingData);
    console.log(`Game started in ${activeGamemode} mode with players:`, players, "and food:", food);
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    if (gameState === 'ingame') {
        // Option 1: Reject connection
        // socket.emit('gameInProgress');
        // socket.disconnect();
        // return;

        // Option 2: Allow as observer (not implemented here)

        // Option 3: Add to lobby, they wait for next game
        console.log(`User ${socket.id} connected during active game. Will join lobby.`);
        // They will be added to players list, but won't participate until next game.
    }

    initializeLobbyPlayer(socket.id);
    // Send lobby status including current gamemode
    io.emit('lobbyUpdate', { players, gamemode: currentGamemode });

    // The old 'currentPlayers' and 'newPlayer' are replaced by 'lobbyUpdate'
    // socket.emit('currentPlayers', {players, gamemode: currentGamemode});
    // socket.broadcast.emit('newPlayer', players[socket.id]);


    socket.on('playerReadyToggle', () => {
        if (players[socket.id]) {
            players[socket.id].isReady = !players[socket.id].isReady;
            console.log(`Player ${socket.id} readiness toggled to: ${players[socket.id].isReady}`);
            io.emit('lobbyUpdate', { players, gamemode: currentGamemode });

            if (gameState === 'lobby' && checkAllPlayersReady()) {
                startGame();
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const disconnectedPlayer = players[socket.id];
        delete players[socket.id];

        if (gameState === 'lobby') {
            io.emit('lobbyUpdate', { players, gamemode: currentGamemode });
            // If the disconnected player was the last one ready, and game was about to start, this implicitly cancels.
        } else if (gameState === 'ingame') {
            io.emit('playerDisconnected', socket.id);
            // TODO: Add logic if a game should end if too few players, or if all players leave.
            // For now, game continues with remaining players. If no players left, server should eventually reset to lobby.
            if (Object.keys(players).length === 0) {
                console.log("All players disconnected from active game. Returning to lobby.");
                gameState = 'lobby';
                // Any cleanup for game state? For now, just changing state.
            }
        }
    });

    socket.on('playerDirectionChange', (directionData) => {
        if (gameState !== 'ingame' || !players[socket.id]) return; // Only process if in game and player exists

        const player = players[socket.id];
        // Basic validation: ensure dx and dy are -1, 0, or 1 and not reversing direction
        const newDx = directionData.dx;
            const newDy = directionData.dy;

            const isMovingHorizontally = player.dx !== 0;
            const isMovingVertically = player.dy !== 0;

            if (isMovingHorizontally && newDx !== 0 && player.dx === -newDx) return;
            if (isMovingVertically && newDy !== 0 && player.dy === -newDy) return;
            if ((newDx === 0 && newDy === 0) || (newDx !== 0 && newDy !== 0)) return;

            player.dx = newDx;
            player.dy = newDy;
        }
    });

    socket.on('requestChangeGamemode', () => {
        if (gameState === 'lobby') {
            currentGamemode = currentGamemode === 'competitive' ? 'cooperative' : 'competitive';
            console.log(`Gamemode changed to: ${currentGamemode} by ${socket.id}`);
            io.emit('lobbyUpdate', { players, gamemode: currentGamemode });
        }
    });

    socket.on('clientMessage', (data) => { // Example, can be removed
        console.log('Message from client (' + socket.id + '):', data);
        io.emit('serverMessage', `Server got message: ${data.message} from ${socket.id}`);
    });
});

// Game state broadcasting loop
setInterval(() => {
    if (gameState !== 'ingame') {
        return; // Don't run game logic or send updates if not in 'ingame' state
    }

    // --- Server-Side Game Logic within gameStateUpdate Interval ---

    // 1. Handle player movement
    for (const playerId in players) {
        const player = players[playerId];
        if (!player.isAlive || !player.body || player.body.length === 0) {
            continue; // Skip dead players or players not fully set up
        }
        if (player.dx === 0 && player.dy === 0 && player.isAlive) { // If stopped due to prior collision but marked alive
            // This case might occur if we only set dx/dy to 0 on collision in previous logic.
            // With isAlive, this check is more about not moving already "stopped" snakes.
        }

        const head = { ...player.body[0] };
        head.x += player.dx;
        head.y += player.dy;

        // Only update body if not collided in this step. Collision checks follow.
        // The unshift/pop will happen after collision checks.
        player.pendingHead = head; // Store potential new head
    }

    // 2. Food Consumption & Collision Checks (for each player)
    let foodEatenThisTick = false;
    for (const playerId in players) {
        const player = players[playerId];
        if (!player.isAlive || !player.pendingHead) continue;

        const head = player.pendingHead;

        // Food Consumption
        if (head.x === food.x && head.y === food.y) {
            player.score++; // Individual score always increments
            if (activeGamemode === 'cooperative') {
                teamScore++;
                console.log(`Team score is now: ${teamScore}`);
            }
            const tail = player.body[player.body.length - 1];
            player.body.push({...tail});

            foodEatenThisTick = true;
            console.log(`Player ${player.id} ate food. Individual Score: ${player.score}`);
        }

        // Wall Collision
        if (head.x < 0 || head.x >= FIXED_TILE_COUNT_X || head.y < 0 || head.y >= FIXED_TILE_COUNT_Y) {
            player.isAlive = false;
            console.log(`Player ${player.id} hit a wall.`);
        }

        // Self-Collision
        if (player.isAlive) { // Check only if still alive
            for (let i = 1; i < player.body.length; i++) {
                if (head.x === player.body[i].x && head.y === player.body[i].y) {
                    player.isAlive = false;
                    console.log(`Player ${player.id} hit self.`);
                    break;
                }
            }
        }

        // If player is alive after food and self/wall collision checks, update their body
        if (player.isAlive) {
            player.body.unshift(head); // Add new head
            // if (!foodEatenByThisPlayerThisTick) { // This needs to be player specific
            // A simpler model for growth: if food was eaten by *anyone*, the snake that ate it already added a segment.
            // The pop is skipped if that player.grewThisTick was set.
            // For now, using the "add tail segment" means pop always happens unless we add a flag.
            // Let's refine growth: if player.body[0] (old head) matched food, then this player.grew = true
            // For simplicity now: if player.body[0] (new head) lands on food, it grows.
            // The growth by adding to tail segment means the pop is fine.
            player.body.pop();

            player.x = head.x; // Update main position
            player.y = head.y;
        }
        delete player.pendingHead; // Clean up
    }

    if (foodEatenThisTick) {
        spawnFood();
    }

    // 3. Snake-vs-Snake Collisions (Only in Competitive Mode)
    if (activeGamemode === 'competitive') {
        const playerIds = Object.keys(players);
        for (let i = 0; i < playerIds.length; i++) {
            const p1Id = playerIds[i];
            const p1 = players[p1Id];
            if (!p1.isAlive || !p1.body || p1.body.length === 0) continue;

            const head1 = p1.body[0];

            for (let j = i + 1; j < playerIds.length; j++) {
                const p2Id = playerIds[j];
                const p2 = players[p2Id];
                if (!p2.isAlive || !p2.body || p2.body.length === 0) continue;

                const head2 = p2.body[0];

                // Head-to-Head
                if (head1.x === head2.x && head1.y === head2.y) {
                    p1.isAlive = false;
                    p2.isAlive = false;
                    console.log(`Players ${p1.id} and ${p2.id} head-on collision.`);
                } else {
                    // Head-to-Body (P1 head vs P2 body)
                    if (p1.isAlive) { // p1 might have died in a head-on with another snake already
                        for (let k = 0; k < p2.body.length; k++) { // Check entire body of p2
                            if (head1.x === p2.body[k].x && head1.y === p2.body[k].y) {
                                p1.isAlive = false;
                                console.log(`Player ${p1.id} hit body of ${p2.id}.`);
                                break;
                            }
                        }
                    }
                    // Head-to-Body (P2 head vs P1 body)
                    if (p2.isAlive) { // p2 might have died in a head-on or p1 hit its head
                         for (let k = 0; k < p1.body.length; k++) { // Check entire body of p1
                            if (head2.x === p1.body[k].x && head2.y === p1.body[k].y) {
                                p2.isAlive = false;
                                console.log(`Player ${p2.id} hit body of ${p1.id}.`);
                                break;
                            }
                        }
                    }
                }
            }
        }
    } // End of competitive mode collision checks

    // 4. Game Over Logic (check if game should end)
    const alivePlayersCount = Object.values(players).filter(p => p.isAlive).length;
    // In a multiplayer game, usually ends if 0 or 1 player is left.
    // If only 1 player started, game ends when they die.
    // In cooperative mode, game ends if all players are dead.
    // In competitive, game ends if 1 or 0 players are left.
    let gameShouldEnd = false;
    if (activeGamemode === 'cooperative') {
        if (alivePlayersCount === 0 && Object.keys(players).length > 0) gameShouldEnd = true;
    } else { // Competitive
        if (alivePlayersCount <= (Object.keys(players).length > 1 ? 1 : 0) && Object.keys(players).length > 0) gameShouldEnd = true;
    }

    if (gameShouldEnd) {
        console.log("Game over condition met. Mode:", activeGamemode, "Alive players:", alivePlayersCount);
        gameState = 'lobby'; // Return to lobby state
        currentGamemode = 'competitive'; // Default lobby to competitive for next round
        Object.values(players).forEach(p => {
            p.isReady = false;
        });
        // Send final game state including teamScore and mode
        io.emit('gameOverToLobby', { players, food, teamScore, gamemode: activeGamemode });
        return;
    }

    // 5. Emit updated game state (players, food, teamScore, and current gamemode)
    io.emit('gameStateUpdate', { players, food, teamScore, gamemode: activeGamemode });
}, 100); // Broadcast frequency


httpServer.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log(`Socket.IO initialized and listening for connections.`);
    console.log(`Serving files from: ${frontendPath}`);
});
