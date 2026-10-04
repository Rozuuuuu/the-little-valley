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
const SLEEP := &"sleep"          ## home (building id or -1), stage walk|sleep

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
