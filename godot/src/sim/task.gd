class_name Task
extends RefCounted
## What a settler is doing now. One class for every kind; each kind uses the fields listed in
## its comment. Tasks are never saved: after loading, settlers choose work again, so no
## reservation can outlive the task that held it (as in the browser game).

const MOVE := &"move"            ## x, y
const WANDER := &"wander"        ## x, y
const GATHER := &"gather"        ## x, y, stage walk|work, timer
const DELIVER := &"deliver"      ## target (building id or -1)
const HAUL := &"haul"            ## src, dst, res, amount, stage toSrc|toDst
const BUILD := &"build"          ## site, slot, stage walk|work
const FARM := &"farm"            ## field, action, stage walk|work, timer
const EAT := &"eat"              ## src
const CRAFT := &"craft"          ## site (the recipe building), stage walk|work
const ORCHARD := &"orchard"      ## field (the orchard), action tend|pick, stage walk|work, timer
const SLEEP := &"sleep"          ## home (building id or -1), stage walk|sleep
const HUNT := &"hunt"            ## animal, site (lodge or -1), target (area or -1), direct, x, y (last seen), stage stalk|aim, timer
const HERD := &"herd"            ## site (the pen), stage walk|work, timer
const SURVEY := &"survey"        ## x, y, stage walk|work, timer
const EXTRACT := &"extract"      ## site (quarry, mine or fisher's hut), slot, amount (ore promised), stage walk|work, timer

var kind: StringName
var stage: StringName = &"walk"
var x := 0
var y := 0
var target := -1
var src := -1
var dst := -1
var res := ""
var amount := 0
var site := -1
var slot := 0
var field := -1
var action: StringName = &""
var home := -1
var timer := 0.0
var animal := -1
var direct := false


static func move(tx: int, ty: int, wander: bool = false) -> Task:
	var t := Task.new()
	t.kind = WANDER if wander else MOVE
	t.x = tx
	t.y = ty
	return t


static func gather(tx: int, ty: int) -> Task:
	var t := Task.new()
	t.kind = GATHER
	t.x = tx
	t.y = ty
	return t


static func deliver(to: int = -1) -> Task:
	var t := Task.new()
	t.kind = DELIVER
	t.target = to
	return t


static func haul(from_id: int, to_id: int, resource: String, n: int) -> Task:
	var t := Task.new()
	t.kind = HAUL
	t.src = from_id
	t.dst = to_id
	t.res = resource
	t.amount = n
	t.stage = &"toSrc"
	return t


static func build(site_id: int, slot_index: int) -> Task:
	var t := Task.new()
	t.kind = BUILD
	t.site = site_id
	t.slot = slot_index
	return t


static func farm(field_id: int, what: StringName) -> Task:
	var t := Task.new()
	t.kind = FARM
	t.field = field_id
	t.action = what
	return t


static func craft(ws_id: int) -> Task:
	var t := Task.new()
	t.kind = CRAFT
	t.site = ws_id
	return t


static func orchard_job(orchard_id: int, what: StringName) -> Task:
	var t := Task.new()
	t.kind = ORCHARD
	t.field = orchard_id
	t.action = what
	return t


static func eat(from_id: int) -> Task:
	var t := Task.new()
	t.kind = EAT
	t.src = from_id
	return t


static func sleep(home_id: int) -> Task:
	var t := Task.new()
	t.kind = SLEEP
	t.home = home_id
	return t


static func hunt(animal_id: int, lodge_id: int, area_id: int, is_direct: bool, tx: int, ty: int) -> Task:
	var t := Task.new()
	t.kind = HUNT
	t.animal = animal_id
	t.site = lodge_id
	t.target = area_id
	t.direct = is_direct
	t.x = tx
	t.y = ty
	t.stage = &"stalk"
	return t


static func herd(pen_id: int) -> Task:
	var t := Task.new()
	t.kind = HERD
	t.site = pen_id
	return t


static func survey(tx: int, ty: int) -> Task:
	var t := Task.new()
	t.kind = SURVEY
	t.x = tx
	t.y = ty
	return t


static func extract(site_id: int, slot_index: int, promised: int) -> Task:
	var t := Task.new()
	t.kind = EXTRACT
	t.site = site_id
	t.slot = slot_index
	t.amount = promised
	return t
