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
const players = {}; // Store player states, keyed by socket.id
const gridSize = 20; // Assuming same grid size as client for now for position logic

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function initializeNewPlayer(socketId) {
    // For simplicity, ensure new players don't spawn on top of each other (basic check)
    let startX, startY, collision;
    do {
        collision = false;
        startX = Math.floor(Math.random() * (800 / gridSize)); // Assuming canvas width 800
        startY = Math.floor(Math.random() * (600 / gridSize)); // Assuming canvas height 600
        for (const playerId in players) {
            if (players[playerId].x === startX && players[playerId].y === startY) {
                collision = true;
                break;
            }
        }
    } while (collision);

    const newPlayer = {
        id: socketId,
        x: startX,
        y: startY,
        body: [{ x: startX, y: startY }, { x: startX - 1, y: startY }, { x: startX - 2, y: startY }], // Initial 3 segments
        dx: 1, // Initial direction: right
        dy: 0,
        color: getRandomColor(),
        // Add other necessary properties like score, etc. later
    };
    players[socketId] = newPlayer;
    return newPlayer;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    const newPlayer = initializeNewPlayer(socket.id);

    // Send the current state of all players to the newly connected client
    socket.emit('currentPlayers', players);

    // Broadcast the new player's data to all other clients
    socket.broadcast.emit('newPlayer', newPlayer);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        // Broadcast that this player has disconnected
        io.emit('playerDisconnected', socket.id);
    });

    socket.on('playerDirectionChange', (directionData) => {
        const player = players[socket.id];
        if (player) {
            // Basic validation: ensure dx and dy are -1, 0, or 1 and not reversing direction
            const newDx = directionData.dx;
            const newDy = directionData.dy;

            const isMovingHorizontally = player.dx !== 0;
            const isMovingVertically = player.dy !== 0;

            // Prevent immediate reversal
            if (isMovingHorizontally && newDx !== 0 && player.dx === -newDx) return;
            if (isMovingVertically && newDy !== 0 && player.dy === -newDy) return;

            // Prevent moving diagonally or no change
            if ((newDx === 0 && newDy === 0) || (newDx !== 0 && newDy !== 0)) return;


            player.dx = newDx;
            player.dy = newDy;
        }
    });

    // Example: Listen for a message from client (can be removed if not needed)
    socket.on('clientMessage', (data) => {
        console.log('Message from client (' + socket.id + '):', data);
        io.emit('serverMessage', `Server got message: ${data.message} from ${socket.id}`);
    });
});

// Game state broadcasting loop (server-side game logic will go here eventually)
setInterval(() => {
    // For now, we'll just broadcast the current state.
    // Later, server-side snake movement and collision detection would happen here.
    // For this step, client still has authority over its own snake for responsiveness.
    // The server essentially relays positions. More advanced models would have server authoritative movement.

    // Simple movement update on server (can be more complex later)
    for (const playerId in players) {
        const player = players[playerId];
        const head = { ...player.body[0] }; // Current head

        head.x += player.dx;
        head.y += player.dy;

        player.body.unshift(head); // Add new head
        player.body.pop();      // Remove tail

        // Update player's main x, y for simplicity (head position)
        player.x = head.x;
        player.y = head.y;

        // Basic boundary wrapping (example, can be game over later)
        // if (head.x >= 800 / gridSize) head.x = 0;
        // if (head.x < 0) head.x = (800 / gridSize) - 1;
        // if (head.y >= 600 / gridSize) head.y = 0;
        // if (head.y < 0) head.y = (600 / gridSize) - 1;
    }

    io.emit('gameStateUpdate', players);
}, 100); // Broadcast every 100ms


httpServer.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log(`Socket.IO initialized and listening for connections.`);
    console.log(`Serving files from: ${frontendPath}`);
});
