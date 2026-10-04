class_name Seasons
## The calendar (src/game/sim/seasons.ts): seasons follow the saved day, so they need no state.
## Day 1 is the first day of spring; each season lasts SEASON_DAYS days.


## {id, def, day (1-based within the season), year, progress 0..1}.
static func of(sim: Simulation) -> Dictionary:
	var season_days: int = Content.get_value("seasons", "SEASON_DAYS")
	var order: Array = Content.get_value("seasons", "SEASON_ORDER")
	var day_index := sim.day() - 1
	var id: String = order[(day_index / season_days) % 4]
	return {
		"id": id,
		"def": Defs.season(id),
		"day": (day_index % season_days) + 1,
		"year": day_index / (season_days * 4) + 1,
		"progress": ((day_index % season_days) + sim.time_of_day()) / season_days,
	}


## Announces a new season once, when it begins.
static func update(sim: Simulation) -> void:
	var s := of(sim)
	var id: String = s["id"]
	if sim.last_season == id:
		return
	var first := sim.last_season == ""
	sim.last_season = id
	if first:
		return
	var d: Dictionary = s["def"]
	sim.toast(d["arrival"], "warn" if id == "winter" else "info")
	sim.record("season", "%s began (year %d)" % [d["name"], int(s["year"])])
	sim.emit({"type": "season", "id": id})
	sim.emit({"type": "important"})
