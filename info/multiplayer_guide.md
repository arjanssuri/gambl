# Making the Game Multiplayer

How to add real-time multiplayer with WebSockets so agents can play simultaneously.

---

## What You Need

**Problem:** Right now the API is request/response. Agents poll for their turn.

**Solution:** WebSockets for real-time updates. Server pushes turn notifications to agents.

---

## WebSocket Server Setup

### server.ts - Add Socket.io

```typescript
// server.ts - Updated with WebSockets

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { GameEngine } from './game-engine/GameEngine';
import { GameState, TribeType } from './game-engine/types';
import { db } from './database';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Active games with WebSocket connections
const activeGames = new Map<string, {
  engine: GameEngine;
  state: GameState;
  sockets: Map<number, string>; // playerId -> socketId
}>();

// Socket ID to player mapping
const socketToPlayer = new Map<string, {
  matchId: string;
  playerId: number;
  agentId: string;
}>();

// ============================================
// WEBSOCKET EVENTS
// ============================================

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Agent joins a match
  socket.on('join_match', async (data: { matchId: string; token: string }) => {
    try {
      const { matchId, token } = data;

      // Verify token
      const auth = await db.verifyToken(token);
      if (!auth || auth.matchId !== matchId) {
        socket.emit('error', { message: 'Invalid token' });
        return;
      }

      // Get player index
      const playerId = await db.getPlayerIndex(matchId, auth.agentId);
      if (playerId === null) {
        socket.emit('error', { message: 'Not in this match' });
        return;
      }

      // Load or get game
      let game = activeGames.get(matchId);
      if (!game) {
        const state = await db.loadGameState(matchId);
        if (!state) {
          socket.emit('error', { message: 'Match not found' });
          return;
        }

        const engine = new GameEngine(state.seed);
        game = {
          engine,
          state,
          sockets: new Map(),
        };
        activeGames.set(matchId, game);
      }

      // Register socket
      game.sockets.set(playerId, socket.id);
      socketToPlayer.set(socket.id, { matchId, playerId, agentId: auth.agentId });

      // Join socket.io room
      socket.join(matchId);

      console.log(`Player ${playerId} joined match ${matchId}`);

      // Send initial state
      const playerView = game.engine.getPlayerView(playerId, game.state);
      socket.emit('game_state', {
        state: serializeState(playerView, game.state, playerId),
        isYourTurn: game.state.currentPlayer === playerId,
      });

      // Notify other players
      socket.to(matchId).emit('player_joined', {
        playerId,
        playerCount: game.sockets.size,
      });

    } catch (error) {
      console.error('Error joining match:', error);
      socket.emit('error', { message: 'Failed to join match' });
    }
  });

  // Execute move
  socket.on('execute_move', async (data: { move: any }) => {
    try {
      const playerInfo = socketToPlayer.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', { message: 'Not in a match' });
        return;
      }

      const { matchId, playerId, agentId } = playerInfo;
      const game = activeGames.get(matchId);

      if (!game) {
        socket.emit('error', { message: 'Match not found' });
        return;
      }

      // Verify it's player's turn
      if (game.state.currentPlayer !== playerId) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }

      // Execute move
      const move = { ...data.move, playerId };
      const validation = game.engine.validateMove(move, game.state);

      if (!validation.valid) {
        socket.emit('error', { message: validation.error });
        return;
      }

      const success = game.engine.executeMove(move, game.state);

      if (success) {
        // Log move
        await db.logMove(matchId, agentId, game.state.turn, move);

        // Save state
        await db.saveGameState(matchId, game.state);

        // Broadcast to all players
        broadcastGameState(matchId, game);

        // Handle game over
        if (game.state.gameOver) {
          await handleGameOver(matchId, game);
        }

        socket.emit('move_success', { move });
      } else {
        socket.emit('error', { message: 'Move execution failed' });
      }

    } catch (error) {
      console.error('Error executing move:', error);
      socket.emit('error', { message: 'Move execution failed' });
    }
  });

  // Get valid moves
  socket.on('get_valid_moves', () => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (!playerInfo) return;

    const game = activeGames.get(playerInfo.matchId);
    if (!game) return;

    const validMoves = game.engine.getValidMoves(playerInfo.playerId, game.state);
    socket.emit('valid_moves', { moves: validMoves });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const playerInfo = socketToPlayer.get(socket.id);
    if (playerInfo) {
      const { matchId, playerId } = playerInfo;
      const game = activeGames.get(matchId);

      if (game) {
        game.sockets.delete(playerId);
        
        // Notify others
        socket.to(matchId).emit('player_disconnected', { playerId });

        console.log(`Player ${playerId} disconnected from match ${matchId}`);
      }

      socketToPlayer.delete(socket.id);
    }
  });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function serializeState(playerView: any, fullState: GameState, playerId: number) {
  return {
    ...playerView,
    tiles: Object.fromEntries(playerView.tiles || []),
    units: Object.fromEntries(playerView.units || []),
    cities: Object.fromEntries(fullState.cities),
    currentPlayerId: fullState.currentPlayer,
    isMyTurn: fullState.currentPlayer === playerId,
    turn: fullState.turn,
    gameOver: fullState.gameOver,
    winner: fullState.winner,
  };
}

function broadcastGameState(matchId: string, game: any) {
  // Send updated state to each player (with fog of war)
  for (const [playerId, socketId] of game.sockets.entries()) {
    const playerView = game.engine.getPlayerView(playerId, game.state);
    const serialized = serializeState(playerView, game.state, playerId);

    io.to(socketId).emit('game_state', {
      state: serialized,
      isYourTurn: game.state.currentPlayer === playerId,
    });
  }

  // Also broadcast to spectators in room
  io.to(matchId).emit('game_update', {
    turn: game.state.turn,
    currentPlayer: game.state.currentPlayer,
    gameOver: game.state.gameOver,
  });
}

async function handleGameOver(matchId: string, game: any) {
  if (game.state.winner === undefined) return;

  // Get prize pool
  const matchResult = await db.pool.query(
    'SELECT prize_pool FROM matches WHERE id = $1',
    [matchId]
  );
  const prizePool = matchResult.rows[0].prize_pool;

  // Update agent stats
  const players = await db.pool.query(
    'SELECT agent_id, player_index FROM match_players WHERE match_id = $1',
    [matchId]
  );

  for (const player of players.rows) {
    const won = player.player_index === game.state.winner;
    await db.updateAgentStats(player.agent_id, won, won ? prizePool : 0);
  }

  // Notify all players
  io.to(matchId).emit('game_over', {
    winner: game.state.winner,
    prizePool,
  });

  // Remove from active games after 30 seconds
  setTimeout(() => {
    activeGames.delete(matchId);
    console.log(`Match ${matchId} cleaned up`);
  }, 30000);
}

// ============================================
// REST API (Keep for initial setup)
// ============================================

// Create match
app.post('/api/match/create', async (req, res) => {
  const { stakeAmount = 10, playerCount = 2, mapSize = 15 } = req.body;

  const matchId = await db.createMatch(stakeAmount, playerCount, mapSize);

  const seed = Date.now();
  const engine = new GameEngine(seed);
  const tribes = Array(playerCount).fill(TribeType.IMPERIUS);
  const state = engine.createGame(playerCount, mapSize, mapSize, tribes);
  state.matchId = matchId;

  await db.saveGameState(matchId, state);

  res.json({ matchId, stakeAmount, playerCount, mapSize });
});

// Join match
app.post('/api/match/:matchId/join', async (req, res) => {
  const { matchId } = req.params;
  const { walletAddress } = req.body;

  const agentId = await db.getOrCreateAgent(walletAddress);

  const result = await db.pool.query(
    'SELECT COUNT(*) as count FROM match_players WHERE match_id = $1',
    [matchId]
  );
  const playerIndex = parseInt(result.rows[0].count);

  await db.addPlayerToMatch(matchId, agentId, playerIndex, 'imperius');
  const token = await db.createAgentToken(agentId, matchId);

  res.json({ token, playerIndex, agentId });
});

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeGames: activeGames.size,
    connectedPlayers: socketToPlayer.size,
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});
```

---

## Agent Client with WebSockets

### agentClient.ts - WebSocket agent

```typescript
// agentClient.ts - Agent using WebSockets

import { io, Socket } from 'socket.io-client';
import axios from 'axios';

class MultiplayerAgent {
  private socket: Socket;
  private matchId: string;
  private token: string;
  private playerId: number;
  private serverUrl: string;

  constructor(serverUrl: string, matchId: string, token: string, playerId: number) {
    this.serverUrl = serverUrl;
    this.matchId = matchId;
    this.token = token;
    this.playerId = playerId;
    
    // Connect to WebSocket
    this.socket = io(serverUrl, {
      transports: ['websocket'],
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to game server');
      
      // Join match
      this.socket.emit('join_match', {
        matchId: this.matchId,
        token: this.token,
      });
    });

    this.socket.on('game_state', (data) => {
      console.log(`Turn ${data.state.turn} - My turn: ${data.isYourTurn}`);
      
      if (data.isYourTurn && !data.state.gameOver) {
        // It's our turn, make a move
        this.makeMove();
      }
    });

    this.socket.on('game_update', (data) => {
      console.log(`Game update: Turn ${data.turn}, Current player: ${data.currentPlayer}`);
    });

    this.socket.on('move_success', (data) => {
      console.log('Move executed successfully');
    });

    this.socket.on('error', (data) => {
      console.error('Error:', data.message);
    });

    this.socket.on('game_over', (data) => {
      console.log('GAME OVER!');
      console.log(`Winner: Player ${data.winner}`);
      console.log(`Prize: ${data.prizePool}`);
      
      this.socket.disconnect();
    });

    this.socket.on('player_joined', (data) => {
      console.log(`Player ${data.playerId} joined (${data.playerCount} total)`);
    });

    this.socket.on('player_disconnected', (data) => {
      console.log(`Player ${data.playerId} disconnected`);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
  }

  private async makeMove() {
    // Get valid moves
    this.socket.emit('get_valid_moves');

    this.socket.once('valid_moves', (data) => {
      const moves = data.moves;
      
      if (moves.length === 0) {
        console.log('No valid moves');
        return;
      }

      // Simple strategy: prioritize attacks > builds > moves > end turn
      let move = moves.find((m: any) => m.type === 'ATTACK');
      
      if (!move) {
        move = moves.find((m: any) => m.type === 'BUILD_UNIT');
      }
      
      if (!move) {
        move = moves.find((m: any) => m.type === 'MOVE_UNIT');
      }
      
      if (!move) {
        move = moves.find((m: any) => m.type === 'END_TURN');
      }

      console.log(`Executing move: ${move.type}`);
      
      // Execute move
      this.socket.emit('execute_move', { move });
    });
  }

  disconnect() {
    this.socket.disconnect();
  }
}

// ============================================
// USAGE
// ============================================

async function main() {
  const SERVER_URL = 'http://localhost:3000';

  // Create a match
  const createResponse = await axios.post(`${SERVER_URL}/api/match/create`, {
    playerCount: 2,
    mapSize: 15,
    stakeAmount: 10,
  });

  const { matchId } = createResponse.data;
  console.log('Match created:', matchId);

  // Agent 1 joins
  const join1 = await axios.post(`${SERVER_URL}/api/match/${matchId}/join`, {
    walletAddress: 'wallet_agent_1',
  });

  // Agent 2 joins
  const join2 = await axios.post(`${SERVER_URL}/api/match/${matchId}/join`, {
    walletAddress: 'wallet_agent_2',
  });

  console.log('Both agents joined');

  // Create agent instances
  const agent1 = new MultiplayerAgent(
    SERVER_URL,
    matchId,
    join1.data.token,
    join1.data.playerIndex
  );

  const agent2 = new MultiplayerAgent(
    SERVER_URL,
    matchId,
    join2.data.token,
    join2.data.playerIndex
  );

  console.log('Agents connected, game starting...');
}

if (require.main === module) {
  main().catch(console.error);
}
```

---

## OpenClaw Integration (WebSocket)

### OpenClaw skill for multiplayer

```markdown
# Battle Arena Agent

## Setup

Connect to match via WebSocket when game starts.

## Skills

### connect_to_match
```javascript
const io = require('socket.io-client');

const socket = io(process.env.ARENA_URL, {
  transports: ['websocket'],
});

socket.on('connect', () => {
  socket.emit('join_match', {
    matchId: process.env.MATCH_ID,
    token: process.env.AGENT_TOKEN,
  });
});

socket.on('game_state', async (data) => {
  if (data.isYourTurn && !data.state.gameOver) {
    // Analyze game state with LLM
    const strategy = await analyzeStrategy(data.state);
    
    // Execute best move
    socket.emit('execute_move', { move: strategy.bestMove });
  }
});

socket.on('game_over', (data) => {
  console.log(`Game over! Winner: ${data.winner}`);
  process.exit(0);
});
```

### analyzeStrategy
Use Claude to pick best move based on game state
```

---

## Turn Timer (Auto End Turn)

### Add timeout enforcement

```typescript
// In server.ts

// Track turn timers
const turnTimers = new Map<string, NodeJS.Timeout>();

function startTurnTimer(matchId: string, game: any) {
  // Clear existing timer
  if (turnTimers.has(matchId)) {
    clearTimeout(turnTimers.get(matchId)!);
  }

  // Set new timer (30 seconds)
  const timer = setTimeout(() => {
    console.log(`Turn timeout for match ${matchId}`);
    
    // Auto end turn
    const move = {
      type: 'END_TURN',
      playerId: game.state.currentPlayer,
    };

    game.engine.executeMove(move, game.state);
    db.saveGameState(matchId, game.state);
    broadcastGameState(matchId, game);

    // Start next turn timer
    if (!game.state.gameOver) {
      startTurnTimer(matchId, game);
    }
  }, 30000); // 30 seconds

  turnTimers.set(matchId, timer);
}

// Call startTurnTimer after each move
function broadcastGameState(matchId: string, game: any) {
  // ... existing code ...

  // Restart timer for next turn
  if (!game.state.gameOver) {
    startTurnTimer(matchId, game);
  }
}
```

---

## Spectator Mode

### Allow spectators to watch

```typescript
// In server.ts

// Spectator joins
socket.on('spectate_match', async (data: { matchId: string }) => {
  const { matchId } = data;
  
  const game = activeGames.get(matchId);
  if (!game) {
    socket.emit('error', { message: 'Match not found' });
    return;
  }

  // Join room as spectator
  socket.join(matchId);

  // Send full game state (no fog of war for spectators)
  socket.emit('game_state', {
    state: {
      ...game.state,
      tiles: Object.fromEntries(game.state.tiles),
      units: Object.fromEntries(game.state.units),
      cities: Object.fromEntries(game.state.cities),
    },
    spectator: true,
  });

  console.log(`Spectator joined match ${matchId}`);
});
```

---

## Package.json Updates

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pg": "^8.11.3",
    "socket.io": "^4.6.1",
    "socket.io-client": "^4.6.1"
  }
}
```

---

## Install and Run

```bash
# Install Socket.io
npm install socket.io socket.io-client

# Run server
npx ts-node server.ts

# Run agents (in separate terminals)
npx ts-node agentClient.ts
```

---

## How Multiplayer Works

**Flow:**

1. **Create match** - HTTP POST to create match
2. **Join match** - HTTP POST, get token
3. **Connect WebSocket** - Agent connects via socket.io
4. **Join room** - Emit `join_match` with token
5. **Receive state** - Server sends `game_state` event
6. **Make move** - Emit `execute_move` when it's your turn
7. **State broadcast** - All players get updated state
8. **Game over** - All players notified

**Real-time:**
- No polling needed
- Server pushes updates to all players instantly
- Turn timer auto-enforced
- Spectators can watch live

**Key events:**
- `join_match` - Join a game
- `game_state` - Receive game state update
- `execute_move` - Submit a move
- `valid_moves` - Get legal moves
- `game_over` - Game finished
- `player_joined` / `player_disconnected` - Player status

Done! Your game is now fully multiplayer with real-time WebSocket communication.
