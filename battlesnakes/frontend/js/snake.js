class Snake {
    constructor(startX = 10, startY = 10, initialLength = 3, color = 'lime', id = null) {
        this.id = id; // Can be null for local player initially, or set for remote players
        this.body = [];
        this.dx = 1; // Initial direction: right
        this.dy = 0;
        this.color = color;
        this.canChangeDirection = true; // To prevent multiple direction changes in one game tick

        // Initialize snake body
        for (let i = 0; i < initialLength; i++) {
            // Ensure body segments are created correctly if startX is already part of the body
            this.body.push({ x: startX - i, y: startY });
        }
        // If using the constructor for the local player, x/y might refer to head
        // For remote players, x/y from server is usually head.
        this.x = this.body[0].x; // Head x
        this.y = this.body[0].y; // Head y
    }

    move() {
        // Create new head position based on current direction
        const head = { x: this.body[0].x + this.dx, y: this.body[0].y + this.dy };

        // Add new head to the beginning of the body
        this.body.unshift(head);

        // Remove the tail (unless the snake just grew)
        // Growth is handled by the grow() method not popping the tail
        // So, by default, snake moves by adding a head and removing a tail
        this.body.pop();
        this.canChangeDirection = true; // Allow direction change for the next frame
        this.x = this.body[0].x; // Update head x
        this.y = this.body[0].y; // Update head y
    }

    grow() {
        // To grow, we simply don't remove the tail in the next move().
        // However, the current move() always pops. So, let's adjust.
        // A common way to handle growth is to add a segment at the tail's current position.
        // The move() method will then shift everything forward.
        // For simplicity here, let's just add a new segment at the head's new position,
        // and the move() method will effectively make the snake longer because it won't pop
        // if a flag is set, or we can duplicate the tail.

        // Let's use the "duplicate tail" approach for now.
        // The new segment will be added where the current tail is.
        // In the next `move` cycle, the head moves, and the duplicated tail segment stays, effectively lengthening the snake.
        const tail = this.body[this.body.length - 1];
        this.body.push({ ...tail }); // Add a new segment at the same position as the current tail
    }

    checkCollision(tileCountX, tileCountY) {
        const head = this.body[0];

        // Wall collision
        if (head.x < 0 || head.x >= tileCountX || head.y < 0 || head.y >= tileCountY) {
            console.log("Wall collision detected");
            return true;
        }

        // Self-collision (check if head collides with any part of its body)
        for (let i = 1; i < this.body.length; i++) {
            if (head.x === this.body[i].x && head.y === this.body[i].y) {
                console.log("Self-collision detected");
                return true;
            }
        }

        return false;
    }

    changeDirection(newDx, newDy) {
        if (!this.canChangeDirection) return;

        const isMovingHorizontally = this.dx !== 0;
        const isMovingVertically = this.dy !== 0;

        // Prevent immediate reversal
        if (isMovingHorizontally && newDx !== 0 && this.dx === -newDx) {
            return;
        }
        if (isMovingVertically && newDy !== 0 && this.dy === -newDy) {
            return;
        }

        // Prevent changing to current direction
        if (this.dx === newDx && this.dy === newDy) {
            return;
        }

        // Prevent moving diagonally / changing axis if already moving on that axis
        if (isMovingHorizontally && newDx !== 0) return;
        if (isMovingVertically && newDy !== 0) return;


        this.dx = newDx;
        this.dy = newDy;
        this.canChangeDirection = false; // Prevent another change in the same game tick/frame
    }

    // Update method for remote snakes based on server data
    update(data) {
        this.body = data.body || this.body;
        this.x = data.x || this.body[0].x; // Head x
        this.y = data.y || this.body[0].y; // Head y
        this.color = data.color || this.color;
        // Note: dx/dy are not directly updated here for remote snakes,
        // as their movement is dictated by the server's `gameStateUpdate` body positions.
    }

    draw(ctx, gridSize) {
        ctx.fillStyle = this.color;
        this.body.forEach(segment => {
            ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 1, gridSize - 1); // -1 for grid line effect
        });

        // Optionally, draw the head differently or not needed if color is distinct
        // if (this.body.length > 0) {
        //     ctx.fillStyle = darkenColor(this.color); // Example: a function to darken the base color
        //     ctx.fillRect(this.body[0].x * gridSize, this.body[0].y * gridSize, gridSize - 1, gridSize - 1);
        // }
    }
}

// console.log('snake.js loaded');
