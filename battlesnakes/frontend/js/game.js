// Get canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Define game parameters
const gridSize = 20; // Size of each grid cell in pixels
const tileCountX = canvas.width / gridSize;
const tileCountY = canvas.height / gridSize;

// Initialize game elements
let localSnake; // Renamed from snake to localSnake for clarity
let food;
let gameSpeed = 100; // milliseconds per game update for local simulation
let gameInterval;
let socket; // To be initialized in DOMContentLoaded
const remotePlayers = {}; // Store other players' Snake instances

// Main game loop function
function gameLoop() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Local snake movement and logic (client-side prediction)
    if (localSnake) {
        localSnake.move();

        // Check food collision for local snake
        if (food && localSnake.body[0].x === food.x && localSnake.body[0].y === food.y) {
            localSnake.grow();
            // TODO: In multiplayer, food spawning should be server-authoritative
            // For now, client spawns food and should probably notify server.
            food.spawn(tileCountX, tileCountY, localSnake.body);
            // Example: socket.emit('foodEaten', { foodPosition: {x: food.x, y: food.y} });
        }

        // Check game over for local snake (wall collision)
        // Self-collision is already handled in localSnake.checkCollision
        if (localSnake.checkCollision(tileCountX, tileCountY)) {
            console.log('Game Over for local player!');
            // TODO: Notify server, handle game over state properly
            clearInterval(gameInterval);
            alert('Game Over! Refresh to play again.'); // Or a more graceful game over screen
            // socket.emit('gameOver'); // Notify server
            return; // Stop the game loop for this client
        }

        localSnake.draw(ctx, gridSize);
    }

    // Draw remote players
    for (const id in remotePlayers) {
        if (remotePlayers[id]) {
            remotePlayers[id].draw(ctx, gridSize);
        }
    }

    // Draw food
    if (food) {
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

// --- Functions to initialize and start the game ---
function initializeGame(playerDataFromServer) {
    if (typeof Snake === 'undefined' || typeof Food === 'undefined') {
        console.error('Snake or Food class not defined.');
        return;
    }

    if (playerDataFromServer) {
        console.log("Initializing local player with data from server:", playerDataFromServer);
        localSnake = new Snake(playerDataFromServer.x, playerDataFromServer.y, playerDataFromServer.body.length, playerDataFromServer.color, playerDataFromServer.id);
        localSnake.body = playerDataFromServer.body;
        localSnake.dx = playerDataFromServer.dx;
        localSnake.dy = playerDataFromServer.dy;
    } else {
        console.log("Initializing local player with default values.");
        // Default initialization if no server data (e.g. server down, or before connection)
        localSnake = new Snake(10, 10, 3, '#00FF00', null); // Default green color, no ID yet
    }

    food = new Food();
    if (localSnake && localSnake.body) {
         food.spawn(tileCountX, tileCountY, localSnake.body);
    } else { // Should not happen if Snake constructor works
        console.error("Local snake body not available for food spawn");
        food.spawn(tileCountX, tileCountY, []);
    }

    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, gameSpeed);
    console.log("Game initialized. Local snake:", localSnake);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded. Setting up Socket.IO.");

    // Attempt to initialize game with defaults first, in case socket connection is slow.
    // Server data will override this once 'currentPlayers' is received.
    if (!localSnake) {
        initializeGame();
    }

    socket = io();

    socket.on('connect', () => {
        console.log('Connected to Socket.IO server! Socket ID:', socket.id);
        // No longer sending 'clientMessage' automatically.
        // Server will send 'currentPlayers' to this client.
    });

    socket.on('currentPlayers', (playersFromServer) => {
        console.log('Received currentPlayers:', playersFromServer);
        let localPlayerData = null;
        for (const id in playersFromServer) {
            const playerData = playersFromServer[id];
            if (id === socket.id) {
                localPlayerData = playerData;
            } else {
                remotePlayers[id] = new Snake(playerData.x, playerData.y, playerData.body.length, playerData.color, playerData.id);
                remotePlayers[id].body = playerData.body; // Ensure body is accurate
                console.log(`Created remote player ${id}:`, remotePlayers[id]);
            }
        }

        if (localPlayerData) {
            if (!localSnake || localSnake.id === null) { // If localSnake is default or needs server ID
                console.log("Updating local player with server data:", localPlayerData);
                initializeGame(localPlayerData); // Re-initialize with server data
            } else { // If localSnake was already initialized by server (should not happen often here)
                 localSnake.id = localPlayerData.id; // Ensure ID is set
                 localSnake.update(localPlayerData); // Update existing local snake
            }
        } else if (!localSnake) {
            // This case means the server didn't send data for this new client immediately in currentPlayers.
            // This might happen if initializeNewPlayer on server happens after emitting currentPlayers.
            // For now, rely on the initial default initializeGame() call.
            console.warn("Local player data not found in currentPlayers. Using defaults. Server might send it as a 'newPlayer' event or gameStateUpdate later.");
        }
    });

    socket.on('newPlayer', (playerData) => {
        console.log('New player connected:', playerData);
        if (playerData.id === socket.id) {
            // If this is the local player, ensure it's properly initialized
            if (!localSnake || localSnake.id === null) {
                 console.log("Local player data received via newPlayer event:", playerData);
                 initializeGame(playerData);
            }
            return;
        }
        remotePlayers[playerData.id] = new Snake(playerData.x, playerData.y, playerData.body.length, playerData.color, playerData.id);
        remotePlayers[playerData.id].body = playerData.body;
        console.log(`Created new remote player ${playerData.id}:`, remotePlayers[playerData.id]);
    });

    socket.on('playerDisconnected', (playerId) => {
        console.log('Player disconnected:', playerId);
        if (remotePlayers[playerId]) {
            delete remotePlayers[playerId];
        }
    });

    socket.on('gameStateUpdate', (serverPlayers) => {
        for (const id in serverPlayers) {
            const playerData = serverPlayers[id];
            if (id === socket.id) { // This is the local player
                // Server state can be used for reconciliation/correction if needed.
                // For now, local client has high authority over its own snake for responsiveness.
                // Example: if (localSnake) localSnake.update(playerData); // if server is fully authoritative
            } else { // This is a remote player
                if (remotePlayers[id]) {
                    remotePlayers[id].update(playerData);
                } else {
                    // If a player appears in gameStateUpdate but not yet in remotePlayers
                    // (e.g., if 'newPlayer' event was missed or processed after first gameStateUpdate)
                    console.warn(`Received game state for unknown remote player ${id}. Creating now.`);
                    remotePlayers[id] = new Snake(playerData.x, playerData.y, playerData.body.length, playerData.color, playerData.id);
                    // remotePlayers[id].body = playerData.body; // update will set this
                    remotePlayers[id].update(playerData);
                    console.log(`Late creation of remote player ${id}:`, remotePlayers[id]);
                }
            }
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from Socket.IO server. Reason:', reason);
        // Consider clearing remotePlayers or showing a "disconnected" overlay
        // for (const id in remotePlayers) delete remotePlayers[id];
    });

    socket.on('serverMessage', (data) => { // Example listener from before
        console.log('Message from server:', data);
    });
});

// console.log('game.js loaded');
