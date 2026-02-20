# The Battle of Polytopia - Complete Deep Dive

A comprehensive breakdown of every system in Polytopia for building a clone optimized for AI agent competition.

---

## GAME SETUP

### Map Generation
- Grid-based square tiles, typically 11x11, 13x13, or 15x15
- Each tile is one terrain type with possible resources
- Map wraps (can be toggled) or has boundaries
- Tile ownership extends from cities - each tile belongs to a city's territory
- Starting spawn is balanced - each player gets roughly equal starting resources

### Terrain Types
1. **Grass/Field** - Basic passable terrain, 1 movement cost
2. **Forest** - Blocks vision, 1 movement, provides game animals (hunting resource)
3. **Mountain** - Impassable except for specific units, provides ore/metal
4. **Water/Ocean** - Requires boats, provides fish
5. **Shallow Water** - Appears near coasts, can be made passable with ports

### Player Start
Each player spawns with:
- 1 capital city (level 1)
- 1 warrior unit adjacent to capital
- Small amount of starting stars (varies by difficulty)
- Fog of war covering entire map except ~2 tile radius from capital

### Tribes (Factions)
Each has unique starting tech and special unit:
- **Xin-Xi** - Starts with Climbing (can cross mountains), gets swordsmen
- **Imperius** - Starts with Organization (cheaper units), basic all-rounder
- **Bardur** - Starts with Hunting (can harvest forest game), forested spawn
- **Oumaji** - Starts with Riding (cavalry early), plains spawn
- **Kickoo** - Starts with Fishing (boats), coastal spawn
- **Hoodrick** - Starts with Archery (archers), forest spawn
- **Luxidoor** - Premium tribe, starts with tons of stars and extra tech
- **Vengir** - Starts with Smithing (swords), difficult spawn, cheaper swordsmen
- And 10+ more with various gimmicks

This creates asymmetry - some tribes rush early, some turtle and boom economically.

---

## CORE RESOURCE: STARS

### Star Generation
- Cities produce stars at the START of your turn
- Base production = city level
- Bonuses from buildings, roads, ports, customs houses
- Formula: `stars_per_turn = city_level + building_bonuses + connections`
- **Stars accumulate** - they bank between turns (you don't lose unspent stars)

### City Levels
Cities level up when you gather ALL available resources in their territory:
- Level 1 → Level 2: Gather all visible resources (fruit, animals, fish, ore, crops)
- Level 2 → Level 3: More resources appear, gather those too
- Max level varies (usually 3-5)

### Resources on Tiles
- **Fruit** - Appears on grass, harvest for population
- **Game (Animals)** - In forests, requires Hunting tech to harvest
- **Fish** - In water, requires Fishing tech to harvest  
- **Ore/Metal** - In mountains, requires Mining tech to harvest
- **Crops** - Appears when you clear forest on grass, requires Organization
- **Whales** - Ocean resource, requires Whaling tech

When you harvest a resource, the tile transforms and the city grows closer to next level.

### Star Spending
- Build units (2-20 stars depending on type)
- Research tech (5-24 stars)
- Upgrade units (5 stars to promote to veteran, changes type)
- Heal units (free, but they can't move that turn)

---

## UNITS - DETAILED BREAKDOWN

### Movement
- Each unit has movement points (usually 1-2)
- Roads increase movement (move 2 tiles on road for 1 movement point)
- Units can move THEN attack OR attack THEN move, but total movement is split
- Example: Rider with 2 movement can move 1, attack, move 1 more to escape

### Unit Stats
Every unit has:
- **Attack** - Damage dealt
- **Defense** - Damage reduction
- **HP** - Health points (usually 10-20)
- **Movement** - Tiles per turn
- **Range** - Melee (1) or Ranged (1-3)
- **Special abilities**

### Tier 1 Units (Basic)

**Warrior** - 2 stars
- Attack: 2, Defense: 2, HP: 10, Move: 1, Range: 1
- Basic melee unit
- Can "Dash" ability if promoted (attack + move after)

**Rider** - 3 stars, requires Riding tech
- Attack: 2, Defense: 1, HP: 10, Move: 2, Range: 1
- Fast cavalry
- "Escape" ability - can move after attacking
- Weak defense, hit-and-run tactics

**Archer** - 3 stars, requires Archery tech
- Attack: 2, Defense: 1, HP: 10, Move: 1, Range: 2
- Ranged attack, doesn't trigger counterattack
- Weak in melee
- "Dash" when promoted

**Defender** - 3 stars, requires Shields tech
- Attack: 1, Defense: 3, HP: 15, Move: 1, Range: 1
- Tank unit
- "Fortify" - can boost defense to 4 when stationary
- Slow but durable

**Mind Bender** - 5 stars, requires Philosophy tech
- Attack: 0, Defense: 1, HP: 10, Move: 1, Range: 1
- Can "convert" enemy units (take control)
- Very fragile, needs protection

### Tier 2 Units (Advanced)

**Swordsman** - 5 stars, requires Smithing tech
- Attack: 3, Defense: 3, HP: 15, Move: 1, Range: 1
- Upgraded warrior, solid all-arounder
- "Dash" ability

**Catapult** - 8 stars, requires Mathematics tech
- Attack: 4, Defense: 0, HP: 10, Move: 1, Range: 3
- Long-range siege
- Can't move and attack same turn
- Fragile, needs escort

**Knight** - 8 stars, requires Chivalry tech (requires Riding)
- Attack: 3.5, Defense: 1, HP: 15, Move: 3, Range: 1
- Heavy cavalry, fastest unit
- "Persist" - extra movement after kill
- Dominates open terrain

### Tier 3 Units (Endgame)

**Giant** - 20 stars, special (capture enemy city OR Gaami conversion)
- Attack: 5, Defense: 4, HP: 40, Move: 1, Range: 1
- Slow but devastating
- Can destroy cities (removes city, becomes ruins)
- "Stomp" - damages everything adjacent when moving

**Battleship** - 15 stars, requires Navigation tech
- Attack: 4, Defense: 3, HP: 30, Move: 2, Range: 2
- Naval superweapon
- Can bombard coastal cities
- Dominates water

### Naval Units

**Boat** - 5 stars, requires Sailing tech
- Attack: 1, Defense: 1, HP: 15, Move: 2, Range: 1
- Transport for land units
- Can carry 1 unit
- Weak combat

**Ship** - 10 stars, requires Navigation tech  
- Attack: 2, Defense: 2, HP: 20, Move: 3, Range: 2
- Combat vessel
- Can carry 1 unit
- Strong vs boats

### Special Units (Tribe-Specific)

Examples:
- **Polytaur** (Polaris tribe) - Ice-based melee, freezes enemies
- **Amphibian** (Aquarion tribe) - Walks on water
- **Tridention** (Aquarion) - Aquatic only, strong in water
- **Mooni** (Elyrion) - Flying dragon unit

---

## COMBAT SYSTEM

### Attack Resolution
```
Base Damage = Attacker's Attack - Defender's Defense
Actual Damage = Base Damage × (Random 0.8 to 1.2 multiplier) × Bonuses
```

### Attack Bonuses
- **Defense Bonus** - Unit on defense gets +50% to defense stat if fortified
- **Wall Bonus** - Unit in city with walls gets +4 defense  
- **Veteran Status** - Promoted units get +50% attack and defense
- **Terrain** - Forests provide small defense bonus

### Combat Flow
1. Attacker declares attack on target
2. Damage calculated: Attacker's attack - Defender's defense = base damage
3. RNG applied (80-120% of base)
4. Defender takes damage
5. If defender survives and it's melee, defender counterattacks (same formula)
6. Attacker takes counterattack damage
7. If either unit hits 0 HP, it dies

### Key Rules
- Ranged units DON'T trigger counterattack
- Catapults can't be counterattacked
- You can attack the same enemy multiple times per turn with different units
- Overkill damage is wasted
- Units heal 4 HP per turn when idle (not moving or attacking)

### Example Combat
- Warrior (Attack 2) attacks Defender (Defense 3)
- Base damage = 2 - 3 = -1, BUT minimum damage is 1
- RNG roll: 0.9x, so 1 damage × 0.9 = 0.9 → rounds to 1 damage
- Defender takes 1 damage (9/10 HP)
- Defender counterattacks: Attack 1 - Defense 2 = -1, minimum 1
- Warrior takes 1 damage (9/10 HP)

So bad matchups still do chip damage.

---

## TECH TREE (Complete)

Techs cost 5-24 stars depending on tier. No prerequisites except a few special cases.

### Tier 1 (5 stars each)
- **Climbing** - Can traverse mountains
- **Fishing** - Unlock fishing boats, harvest fish
- **Hunting** - Harvest game from forests  
- **Organization** - Unlock farming, cheaper units in cities (-1 star cost)
- **Riding** - Unlock Riders (cavalry)
- **Archery** - Unlock Archers

### Tier 2 (7 stars each)
- **Sailing** - Unlock boats for water transport
- **Shields** - Unlock Defenders (tanks)
- **Mining** - Harvest ore from mountains
- **Roads** - Build roads, boost city connections (+1 star per connected city)
- **Spiritualism** - Can see all resources on map (fog of war for terrain remains)

### Tier 3 (10 stars each)
- **Smithing** - Unlock Swordsmen
- **Philosophy** - Unlock Mind Benders (converter units)
- **Mathematics** - Unlock Catapults
- **Trade** - Unlock Customs Houses (economic building)
- **Free Spirit** - (Polaris tribe only) Special ice mechanics

### Tier 4 (12-15 stars)
- **Chivalry** - Unlock Knights (requires Riding first)
- **Navigation** - Unlock Ships and Battleships (requires Sailing first)
- **Construction** - Can build city walls (doesn't unlock unit)

### Tier 5 (18-24 stars)
- **Whaling** - Harvest whales from ocean
- **Aquatism** - (Aquarion tribe) Unlock special water mechanics

### City Improvements (unlocked by techs)
- **Sawmill** - Placed on forest, produces 1 star/turn
- **Windmill** - Placed on farm tile, produces 1 star/turn  
- **Mine** - Placed on ore, produces 2 stars/turn
- **Customs House** - End of road, produces stars based on road length
- **Port** - Placed on water tile, connects city to ocean cities
- **Forge** - Population increases faster
- **Lumber Hut** - (Forest production boost)

---

## CITIES - DEEP MECHANICS

### City Territory
- Each city controls tiles around it (typically 7-9 tiles)
- Territory expands as city levels up
- Tiles can be transferred between cities
- Resources within territory contribute to that city

### City Growth
Cities level up by collecting resources:
- **Level 1 → 2**: Collect all basic resources (fruit, game, fish, ore visible)
- **Level 2 → 3**: More resources become visible, collect those
- **Level 3 → 4**: (if map is big enough)

Each level:
- +1 base star production
- +1 population (cosmetic, cities look bigger)
- Territory might expand

### City Production
```
Total Stars = City Level + Building Bonuses + Road Connections + Ports
```

Example:
- Level 3 city = 3 stars
- Has mine (+2 stars) and sawmill (+1 star) in territory = +3
- Connected to 2 other cities via roads = +2
- **Total: 8 stars per turn**

### Buildings in City Territory
You don't build these in the city center - they're placed on resource tiles:
- Harvest fruit → becomes Farm → can build Windmill (+1 star)
- Harvest forest game → becomes Lumber Hut → can build Sawmill (+1 star)
- Harvest ore → becomes Mine (+2 stars)
- Fish tiles → can build Port (connects ocean trade routes)

### City Walls
- Unlocked with Construction tech
- Costs 5 stars to build per city
- Units in the city get +4 defense
- Walls can be destroyed by Giants or heavy bombardment
- Repairable (costs stars)

### Capturing Cities
- Move any unit into enemy city tile
- City converts to your control
- Keeps its level and buildings
- Produces stars for you next turn
- Enemy loses that city's production

### Capital Cities
- Your first city is the capital
- If capital is captured, you lose (in domination mode)
- In multiplayer, you can keep playing if you have other cities (depends on game rules)

### Border Expansion
Cities slowly claim neutral tiles (tiles not owned by any city). Priority is tiles adjacent to existing territory with resources.

---

## VICTORY CONDITIONS (Detailed)

### 1. Domination (Most Common)
- Capture all enemy capital cities
- Last player with a capital standing wins
- In multiplayer, capturing someone's capital eliminates them
- Can be drawn if all capitals destroyed on same turn (rare)

### 2. Score Victory (Timed Games)
- Game ends at Turn 30 (configurable)
- Score = (Cities × 100) + (Tech count × 50) + (Population × 10)
- Highest score wins
- Used in ranked multiplayer

### 3. Perfection (Single Player)
- Achieve 100% domination + max score before turn 30
- Extremely difficult
- Unlocks cosmetic rewards

---

## ADVANCED MECHANICS

### Ruins
- Destroyed cities become ruins
- Can explore ruins with units
- Gives random reward: stars, tech, unit spawn, super unit (Giant)
- One-time bonus

### Villages
- Scattered on map, unclaimed
- Capture by moving unit onto village
- Village becomes a new city for you (Level 1)
- Strategic - expands territory and production

### Ports & Naval Trade
- Port built on water tile adjacent to city
- Connects that city to other cities with ports
- Each connection = +1 star per turn (same as road)
- Allows cross-ocean trade routes

### Roads
- Unlocked with Roads tech
- Automatically built when you connect cities
- Cities connected by road each get +1 star per connection
- Units move 2 tiles per 1 movement point on roads
- Strategic - boost economy and unit mobility

### Ice & Special Terrain (Polaris tribe)
- Polaris can freeze water tiles
- Frozen water becomes walkable
- Freezes enemy units (stun for 1 turn)
- Creates unique map control

### Gaami (Neutral Super Units)
- Rare spawn in ruins or special events
- Extremely powerful neutral units
- Can be converted with Mind Benders
- Becomes yours if converted (Giant-tier unit)

### Unit Veterancy
- Units that survive multiple combats gain XP
- At threshold, can promote to "Veteran"
- Veterans get +50% attack and defense
- Star-based promotion costs 5 stars
- Changes unit appearance (cosmetic)

### Diplomacy (Multiplayer)
- Can form alliances (can't attack each other)
- Can trade embassies (reveal capitals)
- Can declare war (break alliance)
- Trust system - breaking deals hurts reputation

---

## TURN STRUCTURE (Exact Order)

### 1. Start of Turn
- All cities produce stars
- All units refresh (can move again)
- Units heal if they were idle last turn

### 2. Player Actions (simultaneous in multiplayer)
- Move units
- Attack with units
- Build units in cities
- Research techs
- Build improvements
- Capture villages/cities

### 3. Combat Resolution (if attacks happened)
- All attacks resolve
- Counterattacks resolve
- Units die if HP reaches 0

### 4. End of Turn
- Check victory conditions
- AI takes turn (if single-player)
- Turn counter increments

---

## STRATEGY ARCHETYPES

### Early Rush
- Build warriors/riders immediately
- Capture nearby villages fast
- Attack enemy capital before they build defense
- High risk - if fails, you're behind economically

### Economic Boom
- Focus on capturing villages for more cities
- Research Organization → Roads → Trade
- Build up star production
- Turtle with Defenders
- Overwhelm with superior economy late game

### Tech Rush
- Prioritize expensive techs (Chivalry, Navigation)
- Get Knights or Battleships before enemy has counters
- Requires safe early game (not getting rushed)

### Naval Control
- Water-heavy maps
- Rush Sailing → Navigation
- Battleships dominate
- Control ocean trade routes

### Giant Play
- Capture enemy city to get Giant
- Use Giant to destroy enemy production
- Very late game, swing mechanic

---

## AI BEHAVIOR (Important for Your Clone)

The Polytopia AI has difficulty tiers:

### Easy AI
- Makes random moves
- Doesn't optimize production
- Won't coordinate attacks

### Normal AI  
- Builds balanced economy
- Defends cities
- Attacks when it has advantage
- Basic tech priority (Organization → Riding → Smithing)

### Hard AI ("Crazy" difficulty)
- Gets resource cheats (+stars per turn)
- Aggressive expansion
- Prioritizes player harassment
- Coordinates multi-unit attacks
- Tech rushes Knights/Giants

### For AI Agents (Your LLM Use Case)
- State space is the full visible board
- Decision is which move to make (out of valid_moves array)
- Needs to evaluate: threats, opportunities, economy, military strength
- Time pressure (30 second turn limit) means heuristics over deep search

---

## MAP SIZES & GAME LENGTH

**Tiny (11x11)** - 2 players, ~10 turns, quick match
**Small (13x13)** - 2-4 players, ~15 turns
**Medium (15x15)** - 4 players, ~20-25 turns
**Large (17x17+)** - 4-8 players, ~30+ turns

This determines:
- Number of villages spawned
- Resource density
- Distance between players
- Game duration

---

## WHY THIS WORKS FOR YOUR AI GAMBLING APP

### Perfect Qualities

1. **Deterministic** - Same inputs = same outputs (small RNG in combat doesn't change this much)
2. **Complete information** - No hidden card draws, just fog of war (which adds strategy)
3. **Fast games** - 10-30 turns = 5-15 minutes with agents
4. **Clear win condition** - Capture capitals, no ambiguity
5. **Strategic depth** - Multiple viable strategies (rush, boom, tech)
6. **Asymmetric balance** - Different tribes create variety
7. **Small state space** - LLMs can reason about 15×15 grid + ~20 units total
8. **Discrete actions** - Move/attack/build, not continuous inputs
9. **Snowball mechanics** - Early advantage compounds (makes games decisive)
10. **Spectator-friendly** - Easy to visualize, understand who's winning

### For LLM Agents

- GPT-4/Claude can parse JSON game state in <2 seconds
- Strategy can be encoded in prompts
- Valid moves are pre-computed (no illegal move attempts)
- Pattern matching works (threats, opportunities)
- Time pressure encourages heuristics over perfect play (more fun to watch)

**This is why Polytopia >> Chess for AI gambling.** Chess has been solved by traditional AI (Stockfish), but Polytopia's strategic variety and faster pace make LLM agents competitive and entertaining.

---

## IMPLEMENTATION NOTES FOR YOUR CLONE

### Critical Systems to Build

1. **Game State Manager**
   - Track all tiles, units, cities, resources
   - Validate moves server-side
   - Calculate damage deterministically
   - Handle fog of war per player

2. **Move Validation**
   - Pre-compute valid_moves array each turn
   - Check movement range, attack range, resource availability
   - Prevent illegal moves (moving through mountains without climbing, etc.)

3. **Combat Calculator**
   - Implement exact damage formula with RNG
   - Handle counterattacks
   - Track unit HP and death

4. **City Manager**
   - Level up cities when resources collected
   - Calculate star production
   - Handle territory expansion
   - Manage buildings

5. **Tech Tree System**
   - Track unlocked techs per player
   - Enable/disable units based on tech
   - Handle tech costs

6. **Win Condition Checker**
   - Detect capital captures
   - Calculate scores for timed games
   - Handle elimination

### API Design for Agents

**getGameState(match_id, player_id)**
Returns complete game state visible to that player (fog of war applied)

**executeMove(match_id, player_id, move_code)**
Validates and executes move, returns success/failure

**getValidMoves(match_id, player_id)**
Returns array of all legal moves for current turn

### Performance Considerations

- Cache valid moves calculation (expensive)
- Use spatial indexing for unit/tile lookups
- Minimize JSON payload size (only send visible tiles)
- Pre-compute pathfinding for movement ranges

### Balance for AI Agents

- Disable tribes with weird mechanics (Polaris ice, Aquarion water)
- Start with symmetric maps (all players equidistant)
- Use medium map size (15x15) - big enough for strategy, small enough for LLMs
- 30 second turn limit enforced strictly
- Domination only (no score victory - harder to evaluate)

---

## TESTING STRATEGY FOR AI AGENTS

1. **Unit tests** - Combat calculations, move validation
2. **Integration tests** - Full game simulations
3. **Agent vs Agent** - Let LLMs play each other, check for crashes
4. **Performance tests** - Ensure <30s turn time
5. **Determinism tests** - Same input state = same output moves

Good luck building this! The simplicity of Polytopia's systems (one resource, clear actions) makes it perfect for AI agents while maintaining deep strategic gameplay.
