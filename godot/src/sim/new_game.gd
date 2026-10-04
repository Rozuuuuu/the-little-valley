class_name NewGame
## A fresh valley: a Town Hall in the clearing, five settlers and a little food
## (src/game/sim/newGame.ts).
##
## Not yet ported: the ruler, deliberate growth (visitors and households), wildlife, kingdoms.

const STARTING_GOODS := {"food": 30, "wood": 15, "stone": 5}
const STARTING_JOBS: Array[String] = ["farmer", "gatherer", "builder", "laborer", "laborer"]
const SPOTS: Array[Vector2i] = [Vector2i(-1, 2), Vector2i(0, 2), Vector2i(1, 2), Vector2i(-2, 1), Vector2i(2, 1)]
## Chunks generated before play starts: the navigation window around the hall.
const START_CHUNKS := 3


static func create(seed_value: int, gen: int = WorldGen.CURRENT_GEN, habitat: String = "valley") -> Simulation:
	var sim := Simulation.new(seed_value, 0, gen, habitat)
	# New valleys grow through families and welcomed travellers.
	sim.growth_mode = "deliberate"
	sim.next_visitor = int(Content.get_value("kingdomBalance", "FIRST_VISITOR_TICK"))
	# The land around the hall is generated up front (on worker threads where available).
	for cy in range(-START_CHUNKS, START_CHUNKS):
		for cx in range(-START_CHUNKS, START_CHUNKS):
			sim.world.request(cx, cy)
	sim.world.finish_pending()
	# Newer worlds reveal enough to see their near mountain range from the start.
	sim.world.reveal(0.5, 0.5, 24.0 if gen >= 4 else 15.0)
	sim.setup_nav(0, 0)
	var hall := BuildingOps.place(sim, "townHall", -2, -2)
	BuildingOps.complete(sim, hall, true)
	hall.inventory = STARTING_GOODS.duplicate()
	sim.settlements = [{"id": hall.id, "name": "Home"}]
	for i in Simulation.STARTING_SETTLERS:
		sim.add_settler(SPOTS[i].x, SPOTS[i].y, STARTING_JOBS[i])
	BuildingOps.assign_homes(sim)
	sim.start_session()
	sim.drain_events()
	return sim
