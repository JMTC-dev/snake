// Get canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Define game parameters - Tile counts are fixed, gridSize is dynamic
const FIXED_TILE_COUNT_X = 40; // Game world is 40 tiles wide
const FIXED_TILE_COUNT_Y = 30; // Game world is 30 tiles high
let gridSize; // Size of each grid cell in pixels, will be calculated by resizeCanvas

// Initialize game elements
let localSnake;
let food;
let gameSpeed = 100; // milliseconds per game update
let gameInterval;
let socket;
const remotePlayers = {};

// UI Elements and View State
let currentView = 'lobby'; // 'lobby' or 'game'
let lobbyContainerEl;
let playerListULEl;
let readyButtonEl;
let currentModeDisplayEl; // For showing current game mode
let changeModeButtonEl;   // Button to change game mode
let gameInfoDisplayEl;    // Container for scores etc.
let teamScoreDisplayEl;   // For team score in co-op
let teamScoreValueEl;     // Span for team score value

let currentGameMode = 'competitive'; // Tracks the mode of the current/upcoming game

// Main game loop function
function gameLoop() {
    ctx.fillStyle = 'black'; // Background for the game area
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    if (gridSize > 0) { // Ensure gridSize is calculated
        ctx.strokeStyle = '#404040'; // Faint color for grid lines
        ctx.lineWidth = 1;

        for (let x = 0; x <= canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y <= canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }

    // Local snake movement (client-side prediction)
    if (localSnake && localSnake.isAlive) { // Only move if alive
        localSnake.move();
        // Client-side collision detection for immediate feedback can be added here,
        // but server state is king. Server will ultimately determine `isAlive`.
        // No more client-side food eating logic or `localSnake.grow()`
        // No more client-side `localSnake.checkCollision()` for game over alerts.
    }

    // Draw local snake (handles its own isAlive check for appearance)
    if (localSnake) {
        localSnake.draw(ctx, gridSize);
    }

    // Draw remote players (they also handle their own isAlive check)
    for (const id in remotePlayers) {
        if (remotePlayers[id]) {
            remotePlayers[id].draw(ctx, gridSize);
        }
    }

    // Draw food (based on server data, stored in global `food` object instance)
    if (food && food.x !== -1 && food.y !== -1) { // Check if food has valid position
        food.draw(ctx, gridSize);
    }
}

// Keyboard event listeners
document.addEventListener('keydown', (event) => {
    if (!localSnake || !socket || !localSnake.canChangeDirection) return;

    let newDx = localSnake.dx;
    let newDy = localSnake.dy;
    let directionChanged = false;

    switch (event.key) {
        case 'ArrowUp':
            if (localSnake.dy === 0) { newDx = 0; newDy = -1; directionChanged = true;}
            break;
        case 'ArrowDown':
            if (localSnake.dy === 0) { newDx = 0; newDy = 1; directionChanged = true;}
            break;
        case 'ArrowLeft':
            if (localSnake.dx === 0) { newDx = -1; newDy = 0; directionChanged = true;}
            break;
        case 'ArrowRight':
            if (localSnake.dx === 0) { newDx = 1; newDy = 0; directionChanged = true;}
            break;
        default:
            return; // Exit if not an arrow key
    }

    if (directionChanged) {
        localSnake.changeDirection(newDx, newDy); // Update local snake immediately
        socket.emit('playerDirectionChange', { dx: newDx, dy: newDy });
    }
});

// --- View Management ---
function showView(viewName) {
    currentView = viewName;
    if (!lobbyContainerEl || !canvas) { // Ensure elements are loaded
        console.error("Lobby or Canvas element not found for showView");
        return;
    }

    if (viewName === 'lobby') {
        lobbyContainerEl.classList.remove('hidden');
        canvas.classList.add('hidden');
        if (gameInterval) clearInterval(gameInterval);
    } else if (viewName === 'game') {
        lobbyContainerEl.classList.add('hidden');
        canvas.classList.remove('hidden');
        resizeCanvas(); // Ensure canvas is sized correctly
        // Game loop starting is handled by gameStarting event calling initializeGame
    }
}

// --- Lobby UI Update ---
function updateLobbyUI(lobbyPlayers) {
    if (!playerListULEl) return;
    playerListULEl.innerHTML = ''; // Clear existing list

    for (const id in lobbyPlayers) {
        const player = lobbyPlayers[id];
        const playerItem = document.createElement('li');
        let text;
        if (id === socket.id) {
            text = `YOU (${player.color.substring(0,7)}) - ${player.isReady ? 'Ready' : 'Not Ready'}`;
            playerItem.style.fontWeight = 'bold';
        } else {
            text = `Player ${id.substring(0, 6)}... (${player.color.substring(0,7)}) - ${player.isReady ? 'Ready' : 'Not Ready'}`;
        }
        playerItem.textContent = text;
        playerItem.style.color = player.isReady ? 'lightgreen' : 'lightcoral';
        playerListULEl.appendChild(playerItem);
    }
}


// --- Functions to initialize and start the game ---
// Modified to accept localPlayerData, allPlayersData, and game mode
function initializeGame(localPlayerData, allPlayersData, mode) {
    currentGameMode = mode; // Store the mode for this game session

    if (typeof Snake === 'undefined' || typeof Food === 'undefined') {
        console.error('Snake or Food class not defined.');
        return;
    }
    if (!localPlayerData) {
        console.error("Cannot initialize game: Local player data is missing.");
        showView('lobby'); // Go back to lobby if something is wrong
        alert("Error: Could not start game due to missing player data.");
        return;
    }

    console.log("Initializing game with local data:", localPlayerData, "and all players:", allPlayersData);

    // Initialize local snake
    localSnake = new Snake(localPlayerData.x, localPlayerData.y, localPlayerData.body.length, localPlayerData.color, localPlayerData.id, localPlayerData.isAlive);
    localSnake.body = localPlayerData.body;
    localSnake.dx = localPlayerData.dx;
    localSnake.dy = localPlayerData.dy;

    // Initialize remote players
    remotePlayers = {};
    for (const id in allPlayersData) {
        if (id === socket.id) continue;
        const playerData = allPlayersData[id];
        remotePlayers[id] = new Snake(playerData.x, playerData.y, playerData.body.length, playerData.color, playerData.id, playerData.isAlive);
        remotePlayers[id].body = playerData.body;
        remotePlayers[id].dx = playerData.dx;
        remotePlayers[id].dy = playerData.dy;
    }

    // Initialize food object if it doesn't exist, or update its position from gameStartingData
    // The actual food data comes from `gameStartingData.food` or `gameStateUpdate.food`
    if (!food) food = new Food(); // Create a food instance if one doesn't exist
    // food position will be set by gameStarting or gameStateUpdate events.
    // No client-side spawning: food.spawn(FIXED_TILE_COUNT_X, FIXED_TILE_COUNT_Y, []);

    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, gameSpeed);
    console.log("Game initialized and loop started. Local snake:", localSnake, "Remote players:", remotePlayers);
}

// --- Canvas Resize Function ---
function resizeCanvas() {
    const aspectRatio = FIXED_TILE_COUNT_X / FIXED_TILE_COUNT_Y;
    let newWidth = window.innerWidth;
    let newHeight = window.innerHeight;

    // Adjust dimensions to maintain aspect ratio
    if (newWidth / newHeight > aspectRatio) { // Window is wider than aspect ratio
        newHeight = window.innerHeight; // Maximize height
        newWidth = newHeight * aspectRatio;
    } else { // Window is taller or equal to aspect ratio
        newWidth = window.innerWidth; // Maximize width
        newHeight = newWidth / aspectRatio;
    }

    canvas.width = newWidth;
    canvas.height = newHeight;

    // Calculate new gridSize based on the actual canvas dimensions and fixed tile count
    gridSize = Math.min(newWidth / FIXED_TILE_COUNT_X, newHeight / FIXED_TILE_COUNT_Y);

    // Centering is handled by CSS (body display:flex)

    console.log(`Canvas resized: ${canvas.width}x${canvas.height}, GridSize: ${gridSize}`);
    // Game elements will be redrawn by the gameLoop.
    // If game is not running, an explicit redraw might be needed here.
}


document.addEventListener('DOMContentLoaded', () => {
    // Get UI elements
    lobbyContainerEl = document.getElementById('lobbyContainer');
    playerListULEl = document.getElementById('playerList');
    readyButtonEl = document.getElementById('readyButton');
    currentModeDisplayEl = document.getElementById('currentModeDisplay');
    changeModeButtonEl = document.getElementById('changeModeButton');
    gameInfoDisplayEl = document.getElementById('gameInfoDisplay');
    teamScoreDisplayEl = document.getElementById('teamScoreDisplay');
    teamScoreValueEl = document.getElementById('teamScoreValue');
    // canvas and ctx are already global and initialized at the top

    console.log("DOM loaded. Setting up UI and Socket.IO.");

    showView('lobby'); // Start in lobby view
    resizeCanvas(); // Initial resize for canvas (even if hidden)
    window.addEventListener('resize', resizeCanvas);

    // Remove direct game initialization. Game starts on 'gameStarting' event.
    // if (!localSnake) {
    //     initializeGame(); // This was for default initialization, not needed with lobby
    // }

    socket = io();

    // Socket.IO Event Handlers
    socket.on('connect', () => {
        console.log('Connected to Socket.IO server! Socket ID:', socket.id);
    });

    socket.on('lobbyUpdate', (data) => {
        console.log('Lobby update received:', data);
        const lobbyPlayers = data.players;
        const newMode = data.gamemode;

        if (currentView === 'lobby') {
            updateLobbyUI(lobbyPlayers);
            if (currentModeDisplayEl) {
                currentModeDisplayEl.textContent = newMode.charAt(0).toUpperCase() + newMode.slice(1);
            }
        }
        // currentGameMode = newMode; // Update local understanding of lobby's current mode selection
                                 // This helps if UI needs to react to mode changes while in lobby
    });

    socket.on('gameStarting', (gameStartingData) => {
        console.log('Game is starting with data:', gameStartingData);
        const allPlayersData = gameStartingData.players;
        const serverFoodData = gameStartingData.food;
        currentGameMode = gameStartingData.gamemode; // Set the mode for this game session

        const localPlayerData = allPlayersData[socket.id];
        if (!localPlayerData) {
            console.error("Local player data not found in gameStarting event!");
            showView('lobby');
            alert("Error starting game: Your player data was not found.");
            return;
        }

        if (food && serverFoodData) {
            food.x = serverFoodData.x;
            food.y = serverFoodData.y;
        }

        // Show/hide team score display based on mode
        if (gameInfoDisplayEl && teamScoreDisplayEl) {
            gameInfoDisplayEl.classList.remove('hidden');
            if (currentGameMode === 'cooperative') {
                teamScoreDisplayEl.classList.remove('hidden');
                teamScoreValueEl.textContent = '0'; // Reset on game start
            } else {
                teamScoreDisplayEl.classList.add('hidden');
            }
        }

        showView('game');
        initializeGame(localPlayerData, allPlayersData, currentGameMode);
    });

    socket.on('playerDisconnected', (playerId) => {
        console.log('Player disconnected during game:', playerId);
        if (remotePlayers[playerId]) {
            delete remotePlayers[playerId];
        }
        // If game should end or state change due to disconnect, server handles that first
    });

    socket.on('gameStateUpdate', (gameStateFromServer) => {
        if (currentView !== 'game') return;

        const serverPlayers = gameStateFromServer.players;
        const serverFood = gameStateFromServer.food;
        const serverTeamScore = gameStateFromServer.teamScore;
        const modeOfThisUpdate = gameStateFromServer.gamemode; // Gamemode of the current game state

        // Update food state
        if (food && serverFood) {
            food.x = serverFood.x;
            food.y = serverFood.y;
        }

        // Update team score display if in cooperative mode
        if (modeOfThisUpdate === 'cooperative') {
            if (teamScoreValueEl) teamScoreValueEl.textContent = serverTeamScore;
            if (teamScoreDisplayEl) teamScoreDisplayEl.classList.remove('hidden');
            if (gameInfoDisplayEl) gameInfoDisplayEl.classList.remove('hidden');
        } else {
            if (teamScoreDisplayEl) teamScoreDisplayEl.classList.add('hidden');
            // gameInfoDisplay might still be useful for individual scores or other info in competitive
        }

        // Update all players (local and remote) based on server state
        for (const id in serverPlayers) {
            const playerData = serverPlayers[id];
            if (id === socket.id) {
                if (localSnake) {
                    localSnake.update(playerData);
                }
            } else {
                if (remotePlayers[id]) {
                    remotePlayers[id].update(playerData);
                } else {
                    console.warn(`GameStateUpdate: Remote player ${id} not found. Creating.`);
                    remotePlayers[id] = new Snake(playerData.x, playerData.y, playerData.body.length, playerData.color, playerData.id, playerData.isAlive);
                }
            }
        }
    });

    socket.on('gameOverToLobby', (finalGameState) => {
        console.log("Game Over! Returning to lobby. Final state:", finalGameState);
        let summary = "Game Over!\n";
        if (finalGameState.gamemode === 'cooperative') {
            summary += `Team Score: ${finalGameState.teamScore}\n`;
        }
        summary += "Individual Scores:\n";
        for(const playerId in finalGameState.players){
            const p = finalGameState.players[playerId];
            summary += `Player ${playerId.substring(0,6)}... : ${p.score}\n`;
        }
        alert(summary);

        if(gameInfoDisplayEl) gameInfoDisplayEl.classList.add('hidden'); // Hide game info on game over
        if(teamScoreDisplayEl) teamScoreDisplayEl.classList.add('hidden');
        showView('lobby');
        // Server will send a lobbyUpdate with fresh player readiness & current lobby mode.
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from Socket.IO server. Reason:', reason);
        if (currentView === 'game') {
            alert("Disconnected from server. Returning to lobby.");
        }
        showView('lobby'); // Or a specific "disconnected" screen
        // Clear remote players as their state is no longer valid
        for (const id in remotePlayers) delete remotePlayers[id];
        if (localSnake) localSnake = null; // Clear local snake
        if (gameInterval) clearInterval(gameInterval);
        // Update lobby UI if possible, or server will send new lobbyUpdate on reconnect if that's supported
    });

    // Remove or adapt old listeners like 'currentPlayers', 'newPlayer' if they are fully replaced
    // socket.on('currentPlayers', ...);
    // socket.on('newPlayer', ...);

    // Event Listeners for UI
    if (readyButtonEl) {
        readyButtonEl.addEventListener('click', () => {
            console.log('Ready button clicked');
            if (socket) socket.emit('playerReadyToggle');
        });
    } else {
        console.error("Ready button not found!");
    }

    if (changeModeButtonEl) {
        changeModeButtonEl.addEventListener('click', () => {
            console.log('Change Mode button clicked');
            if (socket) socket.emit('requestChangeGamemode');
        });
    } else {
        console.error("Change Mode button not found!");
    }
});

// console.log('game.js loaded');
