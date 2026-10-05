class_name Settler
extends RefCounted
## One person. Mirrors the browser game's `Settler` (src/game/sim/types.ts); fields of systems not
## yet ported (households, military, kingdoms...) are added with those systems.
## Saved fields are marked; everything else is rebuilt after loading.

# ---- saved -----------------------------------------------------------------------------------
var id: int
var name: String
## Tile-space position of the feet (tile centre = x + 0.5).
var x: float
var y: float
## 0 = down, 1 = up, 2 = left, 3 = right.
var facing := 0
var job: String
## Goods in hand: resource id ("" when empty) and amount.
var carry_res := ""
var carry_amount := 0
## 0..100. Low values slow the settler but never harm them.
var hunger := 90.0
var energy := 90.0
var home_id := -1
## skin, hair, hairStyle, shirt, pants (indices into presentation palettes).
var appearance := {}
## Keep gathering one kind near a spot after a direct order: {res, x, y, until} or empty.
var focus := {}
var area_id := -1
## Personal work order (Array of work kinds), or empty for the job's default.
var priorities: Array = []
var has_priorities := false
var settlement_id := -1
var life_stage := "adult"
## Ticks lived as a child (0 for adults).
var age_ticks := 0
var household_id := -1
var hold := false
var side_job := ""
## Health, 0..100 (hunters hurt by dangerous game heal over time).
var hp := 100.0
## The player on the map.
var ruler := false
## Rally's boost lasts until this tick.
var boost_until := -1
## Learning a new role at the Town Hall: {role, hall, progress}, or empty.
var training := {}
## The caravan manifest a teamster is away with (-1: at home).
var away_on := -1
## Service in the army (Military): {unit, state, trained, buildingId, companyId, gear, priorJob,
## priorPriorities, priorArea}, or empty.
var military := {}
## Held by another kingdom after a lost battle ({by}); home at peace. Empty when free.
var captive := {}
var kingdom_id := 0
## Saved fields this version does not know, kept verbatim.
var extra := {}

# ---- transient -------------------------------------------------------------------------------
## Position at the start of the tick being simulated.
var px: float
var py: float
## Start and end of the last completed tick: what is drawn (lerp between them), so a tick being
## run in slices across frames never shows half done.
var rpx: float
var rpy: float
var rx: float
var ry: float
var anim: StringName = &"idle"
var tool: StringName = &""
var capacity := 10
var task: Task = null
var idle_reason := ""
var hidden := false
## Current path: steps x0, y0, x1, y1... excluding the start.
var path := PackedInt32Array()
var path_index := 0
var has_path := false
## The goal the path was planned for, to notice when the goal changes.
var goal_x := 0
var goal_y := 0
var goal_w := 0
var goal_h := 0
var goal_adjacent := false
var has_goal := false
var repaths := 0
var last_notice := -9999
var inside_id := -1
var rest_note := ""
## Earliest tick an idle settler looks for work again.
var next_think := 0
var stopped_until := -1
## Targets this settler could not reach recently: target key -> tick until which it is skipped.
var unreachable := {}
## Tick of the last blow taken, for the hit flash.
var hit_at := -1000000
## Last tile key where this settler revealed the map.
var last_reveal_key := -1


func carrying() -> bool:
	return carry_amount > 0


func set_carry(res: String, n: int) -> void:
	carry_res = res if n > 0 else ""
	carry_amount = maxi(0, n)


func tile_x() -> int:
	return floori(x)


func tile_y() -> int:
	return floori(y)
