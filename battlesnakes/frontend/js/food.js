class Food {
    constructor(tileCountX, tileCountY, snakeBodyInitial) {
        this.x = 0;
        this.y = 0;
        // It's good practice for spawn to know about game boundaries and snake
        // So, we might not need to pass them to constructor if spawn is always called with them.
        // However, having them for an initial spawn could be useful.
        if (tileCountX && tileCountY && snakeBodyInitial) {
            this.spawn(tileCountX, tileCountY, snakeBodyInitial);
        }
    }

    spawn(tileCountX, tileCountY, snakeBody = []) {
        let newX, newY, onSnake;
        do {
            onSnake = false;
            newX = Math.floor(Math.random() * tileCountX);
            newY = Math.floor(Math.random() * tileCountY);

            // Check if the new food position is on the snake
            for (const segment of snakeBody) {
                if (segment.x === newX && segment.y === newY) {
                    onSnake = true;
                    break;
                }
            }
        } while (onSnake); // Keep trying until a valid position is found

        this.x = newX;
        this.y = newY;
        // console.log(`Food spawned at: ${this.x}, ${this.y}`);
    }

    draw(ctx, gridSize) {
        ctx.fillStyle = 'red'; // Food color

        const centerX = this.x * gridSize + gridSize / 2;
        const centerY = this.y * gridSize + gridSize / 2;
        const radius = (gridSize / 2) - (gridSize * 0.1); // Radius with small padding

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true); // Draw a full circle
        ctx.fill();
    }
}

// console.log('food.js loaded');
