class Snake {
    constructor(startX = 10, startY = 10, initialLength = 3, color = 'lime', id = null, isAlive = true) {
        this.id = id;
        this.body = [];
        this.dx = 1;
        this.dy = 0;
        this.color = color;
        this.isAlive = isAlive; // Added isAlive property
        this.canChangeDirection = true;

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

    // Method to update snake state from server data, including isAlive
    updateFromServer(data) {
        this.body = data.body || this.body;
        this.x = data.x || (this.body.length > 0 ? this.body[0].x : 0);
        this.y = data.y || (this.body.length > 0 ? this.body[0].y : 0);
        this.color = data.color || this.color;
        this.isAlive = data.isAlive; // Update isAlive status
        // dx/dy for remote snakes are less important as server dictates body positions
        if (this.id !== null && data.dx !== undefined) this.dx = data.dx; // localSnake might use this
        if (this.id !== null && data.dy !== undefined) this.dy = data.dy; // localSnake might use this
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
    update(data) { // Renamed to 'update' from 'updateFromServer' to match existing call sites for remotePlayers
        this.body = data.body || this.body;
        this.x = data.x || (this.body.length > 0 ? this.body[0].x : 0);
        this.y = data.y || (this.body.length > 0 ? this.body[0].y : 0);
        this.color = data.color || this.color;
        this.isAlive = data.isAlive !== undefined ? data.isAlive : this.isAlive; // Update isAlive status
        // dx/dy for remote snakes are primarily for local visual interpolation if implemented,
        // or for local player if server sends back its dx/dy.
        // For remote players, body array from server is the source of truth for positions.
        if (data.dx !== undefined) this.dx = data.dx;
        if (data.dy !== undefined) this.dy = data.dy;
    }

    draw(ctx, gridSize) {
        if (!this.isAlive) {
            // Draw dead snake differently (e.g., greyed out)
            ctx.fillStyle = 'grey'; // Or a faded version of this.color
            this.body.forEach(segment => {
                ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 1, gridSize - 1);
            });
            return; // Stop further drawing for dead snake
        }

        this.body.forEach((segment, index) => {
            if (index === 0) {
                // Head of the snake
                ctx.fillStyle = 'gold';
            } else {
                // Body segments
                ctx.fillStyle = this.color;
            }
            ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 1, gridSize - 1);
        });

        // Draw eyes on the head if alive
        if (this.body.length > 0) { // No need to check isAlive again, already done
            const head = this.body[0];
            const eyeSize = gridSize / 5;
            const eyeOffset = gridSize / 4;

            ctx.fillStyle = 'white';

            // Default eye positions
            let eye1X = head.x * gridSize + eyeOffset; // Default for moving right or up/down looking "forward"
            let eye1Y = head.y * gridSize + eyeOffset;
            let eye2X = head.x * gridSize + gridSize - eyeOffset - eyeSize; // Default for moving right or up/down looking "forward"
            let eye2Y = head.y * gridSize + eyeOffset;


            // Simplified eye placement: Assume eyes are on top relative to movement direction
            // More accurate would be to rotate the eye pair based on dx/dy
            if (this.dx === 1) { // Moving Right
                eye1X = head.x * gridSize + gridSize - eyeOffset - eyeSize; eye1Y = head.y * gridSize + eyeOffset;
                eye2X = head.x * gridSize + gridSize - eyeOffset - eyeSize; eye2Y = head.y * gridSize + gridSize - eyeOffset - eyeSize;
            } else if (this.dx === -1) { // Moving Left
                eye1X = head.x * gridSize + eyeOffset; eye1Y = head.y * gridSize + eyeOffset;
                eye2X = head.x * gridSize + eyeOffset; eye2Y = head.y * gridSize + gridSize - eyeOffset - eyeSize;
            } else if (this.dy === -1) { // Moving Up
                eye1X = head.x * gridSize + eyeOffset; eye1Y = head.y * gridSize + eyeOffset;
                eye2X = head.x * gridSize + gridSize - eyeOffset - eyeSize; eye2Y = head.y * gridSize + eyeOffset;
            } else if (this.dy === 1) { // Moving Down
                eye1X = head.x * gridSize + eyeOffset; eye1Y = head.y * gridSize + gridSize - eyeOffset - eyeSize;
                eye2X = head.x * gridSize + gridSize - eyeOffset - eyeSize; eye2Y = head.y * gridSize + gridSize - eyeOffset - eyeSize;
            }

            ctx.beginPath();
            ctx.arc(eye1X + eyeSize / 2, eye1Y + eyeSize / 2, eyeSize / 2, 0, Math.PI * 2, true);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(eye2X + eyeSize / 2, eye2Y + eyeSize / 2, eyeSize / 2, 0, Math.PI * 2, true);
            ctx.fill();
        }
    }
}

// console.log('snake.js loaded');
