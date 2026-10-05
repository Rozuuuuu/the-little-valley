class_name RealmWindow
extends PanelContainer
## The Realm window: the crown, land, other kingdoms, news, the army and war. It only reads the
## simulation and sends commands through Game; everything shown is what the player has been told
## (reports, not hidden truth).

const TABS: Array[String] = ["Crown", "Land", "Kingdoms", "News", "Army", "War"]
const TREATY_KINDS: Array[String] = ["trade", "passage", "nonAggression", "defensiveAlliance", "truce", "peace"]

var hud: Hud
var tab := "Crown"
var _tabs := HBoxContainer.new()
var _body := VBoxContainer.new()
var _scroll := ScrollContainer.new()
var _key := ""


func setup(h: Hud) -> void:
	hud = h
	set_anchors_preset(Control.PRESET_TOP_RIGHT)
	offset_right = -8
	offset_top = 64
	grow_horizontal = Control.GROW_DIRECTION_BEGIN
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(520, 0)
	add_child(v)
	for t in TABS:
		_tabs.add_child(hud._button(t, func() -> void:
			tab = t
			_key = ""
			refresh()))
	v.add_child(_tabs)
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_body)
	v.add_child(_scroll)
	visible = false


func _sim() -> Simulation:
	return hud.game.sim


func _text(t: String, dim: bool = false) -> RichTextLabel:
	var l := RichTextLabel.new()
	l.bbcode_enabled = true
	l.fit_content = true
	l.scroll_active = false
	l.custom_minimum_size = Vector2(500, 0)
	l.text = "[color=%s]%s[/color]" % [hud._c("textDim").to_html(), t] if dim else t
	return l


func _row(buttons: Array) -> HFlowContainer:
	var r := HFlowContainer.new()
	for b: Control in buttons:
		r.add_child(b)
	return r


func _cmd(cmd: Dictionary) -> Dictionary:
	var r := hud.game.command(cmd)
	_key = ""
	refresh()
	return r


## Rebuilds the open tab when what it shows has changed (checked a few times a second).
func refresh() -> void:
	if not visible or hud.game.sim == null:
		return
	var sim := _sim()
	var me := Kingdoms.player(sim)
	var key := "%s|%s|%d|%d|%d|%d|%d|%d|%d|%s|%d|%d" % [tab, me["crowned"], int(me["treasury"]), int(me["trust"]), sim.kingdoms.size(), sim.offers.size(), sim.reports.size(),
		sim.warnings.size(), sim.incidents.size(), str(me["council"]), sim.claims.size(), hud.game.selected.size()]
	for o: Dictionary in sim.offers:
		key += str(o["state"])
	for c: Dictionary in me["companies"]:
		key += "%s%d%d" % [c.get("state", ""), int(c.get("readiness", 100)), (c.get("members", []) as Array).size()]
	for c: Dictionary in sim.commitments:
		key += str(c["state"])
	key += str(sim.wars.size()) + str(sim.war_plans.size())
	if key == _key:
		return
	_key = key
	for c in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	match tab:
		"Crown":
			_crown(sim, me)
		"Land":
			_land(sim, me)
		"Kingdoms":
			_kingdoms(sim, me)
		"News":
			_news(sim)
		"Army":
			_army(sim, me)
		"War":
			_war(sim, me)
	_fit.call_deferred()


func _fit() -> void:
	await get_tree().process_frame
	var vh := get_viewport().get_visible_rect().size.y / maxf(0.1, hud._root.scale.y)
	_scroll.custom_minimum_size.y = minf(_body.get_combined_minimum_size().y + 4, maxf(200.0, vh - 260.0))
	reset_size()


# ---- crown -------------------------------------------------------------------------------------

func _crown(sim: Simulation, me: Dictionary) -> void:
	var posts: Dictionary = Kingdoms.value("COUNCIL_POSTS")
	if me["crowned"]:
		_body.add_child(_text("[b]%s[/b], ruled by %s" % [me["name"], me["ruler"]["name"] if me["ruler"] != null else "?"]))
	else:
		_body.add_child(_text("[b]%s[/b] — not yet a crowned kingdom" % me["name"]))
	_body.add_child(_text("Treasury %d coins · public trust %s/100 · taxes: %s" % [int(me["treasury"]), Diplomacy._num(float(me["trust"])), Kingdoms.policy(me["policy"])["name"]]))
	if not me["crowned"]:
		if sim.reached.has("region"):
			var rn := LineEdit.new()
			rn.placeholder_text = "Ruler's crowned name"
			rn.text = sim.ruler().name if sim.ruler() != null else ""
			var kn := LineEdit.new()
			kn.placeholder_text = "Kingdom's name"
			var color := OptionButton.new()
			for c: String in Kingdoms.value("BANNER_COLORS"):
				color.add_item(c)
			var emblem := OptionButton.new()
			for e: String in Kingdoms.value("EMBLEMS"):
				emblem.add_item(e)
			_body.add_child(_row([rn, kn]))
			_body.add_child(_row([color, emblem, hud._button("Crown", func() -> void:
				_cmd({"type": "coronate", "rulerName": rn.text, "kingdomName": kn.text, "banner": {"color": color.get_item_text(color.selected), "emblem": emblem.get_item_text(emblem.selected)}}),
				"Crown your ruler. The homeland is fixed now: %d sectors." % Territory.homeland_preview(sim).size())]))
		else:
			_body.add_child(_text("Coronation comes with the Region milestone. Your homeland would be %d sectors today." % Territory.homeland_preview(sim).size(), true))
	var policies: Array = []
	for pid: String in Kingdoms.value("POLICY_IDS"):
		var p := Kingdoms.policy(pid)
		var b := hud._button(str(p["name"]), func() -> void: _cmd({"type": "setPolicy", "policy": pid}), str(p["description"]))
		b.disabled = me["policy"] == pid
		policies.append(b)
	_body.add_child(_row(policies))
	_body.add_child(_text("[b]Council[/b]"))
	for post: String in Kingdoms.value("COUNCIL_POST_IDS"):
		var holder: Variant = me["council"][post]
		var who := sim.settler(int(holder)).name if holder != null and sim.settler(int(holder)) != null else "empty"
		var line: Array = [hud._text_label("%s: %s" % [posts[post]["name"], who], str(posts[post]["duty"]))]
		if hud.game.selected.size() == 1:
			var sid: int = hud.game.selected[0]
			line.append(hud._button("Appoint selected", func() -> void: _cmd({"type": "appointCouncil", "post": post, "settlerId": sid})))
		if holder != null:
			line.append(hud._button("Dismiss", func() -> void: _cmd({"type": "appointCouncil", "post": post, "settlerId": null})))
		_body.add_child(_row(line))


# ---- land ---------------------------------------------------------------------------------------

func _land(sim: Simulation, me: Dictionary) -> void:
	var home := (me["homeland"] as Array).size() if me["homeland"] != null else 0
	var mine := 0
	var held := 0
	for k: String in sim.claims:
		if int(sim.claims[k]["legalOwner"]) == 0:
			mine += 1
		if sim.claims[k]["occupyingKingdom"] != null and int(sim.claims[k]["occupyingKingdom"]) == 0:
			held += 1
	_body.add_child(_text("Homeland %d sectors (protected%s) · frontier %d · held by your soldiers %d" % [home, ", unless full conquest" if me["conflictMode"] == "full-conquest" else "", mine, held]))
	_body.add_child(_text("Claiming a sector costs %d coins; it must touch your land or hold a supplied settlement. Borders show on the map while this window is open." % int(Kingdoms.value("CLAIM_COST")), true))
	_body.add_child(_row([hud._button("Claim a sector…", func() -> void: hud.game.start_placing("claim"), "Click a sector on the map")]))
	var modes: Array = []
	for m: String in ["protected-frontier", "full-conquest"]:
		var b := hud._button("Protected frontier" if m == "protected-frontier" else "Full conquest", func() -> void: _cmd({"type": "setConflictMode", "mode": m}))
		b.disabled = me["modeLocked"] or me["conflictMode"] == m
		modes.append(b)
	_body.add_child(_row(modes))
	if not me["frontierActive"]:
		_body.add_child(_row([hud._button("Open the frontier to conflict", func() -> void: _cmd({"type": "activateFrontier"}), "Border incidents and war become possible (Civilization)")]))
	else:
		_body.add_child(_text("The frontier is open: incidents and war are possible.", true))


# ---- kingdoms -----------------------------------------------------------------------------------

func _kingdoms(sim: Simulation, me: Dictionary) -> void:
	var rivals := sim.kingdoms.filter(func(k: Dictionary) -> bool: return not k["player"])
	if rivals.is_empty():
		_body.add_child(_text("No other kingdom is known yet. Merchants from distant towns bring word of them (build an inn).", true))
	for k: Dictionary in rivals:
		var kid := int(k["id"])
		var c: Dictionary = sim.concern_states.get("%d>0" % kid, {})
		_body.add_child(_text("[b]%s[/b] (%s) — %s · their trust in you %s/100 · %s about you" % [k["name"], Regions.direction(float(k["capital"]["x"]), float(k["capital"]["y"])),
			Diplomacy.stance_of(sim, 0, kid), Diplomacy._num(Diplomacy.trust_of(sim, kid, 0)), c.get("band", "calm")]))
		var acts: Array = []
		var kind := OptionButton.new()
		for t in TREATY_KINDS:
			kind.add_item(str(Diplomacy.treaty(t)["name"]))
		acts.append(kind)
		acts.append(hud._button("Propose (8 days)", func() -> void:
			_cmd({"type": "proposeTreaty", "kind": TREATY_KINDS[kind.selected], "to": kid, "terms": {"durationDays": 8, "payment": 0}}), "Your envoy carries the offer; they answer with reasons"))
		for o: Dictionary in sim.offers:
			if o["state"] == "active" and ((int(o["proposer"]) == 0 and int(o["recipient"]) == kid) or (int(o["proposer"]) == kid and int(o["recipient"]) == 0)):
				var oid := int(o["id"])
				acts.append(hud._button("End %s" % str(Diplomacy.treaty(o["kind"])["name"]).to_lower(), func() -> void: _cmd({"type": "cancelTreaty", "offerId": oid}), str(Diplomacy.treaty(o["kind"])["breach"])))
		_body.add_child(_row(acts))
	# Offers to answer, answers received.
	for o: Dictionary in sim.offers:
		var oid := int(o["id"])
		if int(o["recipient"]) == 0 and o["state"] == "proposed" and sim.tick < int(o["expiresTick"]):
			_body.add_child(_text("%s offers a %s for %d days%s." % [Kingdoms.name_of(sim, int(o["proposer"]), "?"), str(Diplomacy.treaty(o["kind"])["name"]).to_lower(), int(o["terms"]["durationDays"]),
				" with %d coins" % int(o["terms"]["payment"]) if int(o["terms"]["payment"]) > 0 else ""]))
			_body.add_child(_row([hud._button("Accept", func() -> void: _cmd({"type": "respondToOffer", "offerId": oid, "accept": true})),
				hud._button("Decline", func() -> void: _cmd({"type": "respondToOffer", "offerId": oid, "accept": false}))]))
		elif int(o["proposer"]) == 0 and (o["state"] == "active" or o["state"] == "rejected") and not (o["reasons"] as Array).is_empty() and sim.tick - int(o.get("createdTick", 0)) < 4 * Defs.DAY_TICKS:
			_body.add_child(_text("%s %s your %s: %s" % [Kingdoms.name_of(sim, int(o["recipient"]), "?"), "accepted" if o["state"] == "active" else "declined",
				str(Diplomacy.treaty(o["kind"])["name"]).to_lower(), "; ".join(PackedStringArray(o["reasons"]))], true))
	for inc: Dictionary in sim.incidents:
		if int(inc["to"]) != 0 or inc["state"] != "open":
			continue
		var iid := int(inc["id"])
		_body.add_child(_text("[color=%s]%s: %s at sector %d,%d[/color]" % [hud._c("accent").to_html(), Kingdoms.name_of(sim, int(inc["from"]), "?"), inc["kind"], int(inc["sector"]["x"]), int(inc["sector"]["y"])]))
		var opts: Array = []
		for resp: String in ["allow", "askWithdraw", "protest"]:
			opts.append(hud._button({"allow": "Allow", "askWithdraw": "Ask to withdraw", "protest": "Protest"}[resp], func() -> void: _cmd({"type": "respondToIncident", "incidentId": iid, "response": resp})))
		_body.add_child(_row(opts))
	for w: Dictionary in sim.warnings:
		if int(w["to"]) != 0 or w["state"] != "open":
			continue
		var wid := int(w["id"])
		_body.add_child(_text("[color=%s]%s is %s about you:[/color] %s" % [hud._c("accent").to_html(), Kingdoms.name_of(sim, int(w["from"]), "?"), w["band"], "; ".join(PackedStringArray(w["reasons"]))]))
		var acts2: Array = []
		for a: String in w["actions"]:
			acts2.append(hud._button(a.capitalize(), func() -> void: _cmd({"type": "respondToWarning", "warningId": wid, "action": a})))
		_body.add_child(_row(acts2))


# ---- news ---------------------------------------------------------------------------------------

func _news(sim: Simulation) -> void:
	var items := News.knowledge_of(sim, 0)
	if items.is_empty():
		_body.add_child(_text("No news yet. Merchants, envoys, scouts and allies bring it — never the hidden truth, and never maps.", true))
	var words := {"military-buildup": "raised soldiers", "border-forces": "has troops at a border", "claim": "claimed land", "conquest": "conquered land",
		"treaty-broken": "broke a treaty", "prosperity": "is prospering", "alliance": "made an alliance", "war-declared": "declared war"}
	for r: Dictionary in items.slice(0, 30):
		var where := "place unknown" if r["location"] == null else "near sector %d,%d" % [int(r["location"]["x"]), int(r["location"]["y"])]
		var age := roundi(float(sim.tick - int(r["eventTick"])) / Defs.DAY_TICKS)
		_body.add_child(_text("%s %s (%s) — %s, from %s, %s" % [Kingdoms.name_of(sim, int(r["subjectKingdomId"]), "Someone") if int(r["subjectKingdomId"]) != 0 else "We",
			words.get(r["kind"], r["kind"]), where, r["certainty"], r["sourceKind"], "today" if age == 0 else "%d day%s ago" % [age, "" if age == 1 else "s"]]))
	var older := int(sim.news_summaries.get(0, 0))
	if older > 0:
		_body.add_child(_text("…and %d older reports." % older, true))


# ---- army ---------------------------------------------------------------------------------------

func _army(sim: Simulation, me: Dictionary) -> void:
	var companies: Array = me["companies"]
	if companies.is_empty():
		_body.add_child(_text("No soldiers yet. Build a barracks or archery range, select adults and enlist them from the building's panel. Their gear leaves the stores at once.", true))
	for c: Dictionary in companies:
		var cid := int(c["id"])
		var members: Array = c.get("members", [])
		var ready := members.filter(func(id: Variant) -> bool:
			var s := sim.settler(int(id))
			return s != null and not s.military.is_empty() and s.military["state"] != "training").size()
		_body.add_child(_text("[b]%s company[/b] — %d soldiers (%d ready) · %s · readiness %d · food %d · %s" % [str(Military.unit(c["kind"])["name"]), members.size(), ready,
			c.get("state", "home"), int(c.get("readiness", 100)), int(c.get("supplies", 0)), Military.company_where(sim, c)]))
		var acts: Array = [hud._button("March to…", func() -> void: hud.game.start_placing("company:%d" % cid), "Click where to go (they take 2 days of food)")]
		if c.get("state", "home") != "home":
			acts.append(hud._button("Hold", func() -> void: _cmd({"type": "orderCompany", "companyId": cid, "order": "hold"})))
			acts.append(hud._button("Come home", func() -> void: _cmd({"type": "orderCompany", "companyId": cid, "order": "retreat"})))
		else:
			acts.append(hud._button("Stand down", func() -> void: _cmd({"type": "demobilize", "companyId": cid}), "Everyone goes back to their old work; gear returns to store"))
		_body.add_child(_row(acts))
	if hud.game.selected.size() == 1:
		var s := sim.settler(hud.game.selected[0])
		if s != null and not s.military.is_empty() and s.military["state"] == "training":
			var sid := s.id
			_body.add_child(_row([hud._button("Stop %s's training" % s.name, func() -> void: _cmd({"type": "cancelTraining", "settlerId": sid}))]))


# ---- war ----------------------------------------------------------------------------------------

func _war(sim: Simulation, me: Dictionary) -> void:
	for ws: Dictionary in sim.war_states.values():
		var other := int(ws["defender"]) if int(ws["attacker"]) == 0 else int(ws["attacker"])
		if int(ws["attacker"]) != 0 and int(ws["defender"]) != 0:
			continue
		var captives := sim.settlers.filter(func(s: Settler) -> bool: return not s.captive.is_empty() and int(s.captive["by"]) == other).map(func(s: Settler) -> String: return s.name)
		var siege: Dictionary = sim.sieges.get(other, {})
		_body.add_child(_text("[b]At war with %s[/b] (%s)%s%s" % [Kingdoms.name_of(sim, other, "?"), ws["objective"], " · captives: %s" % ", ".join(PackedStringArray(captives)) if not captives.is_empty() else "",
			" · siege %d%%" % int(siege["progress"]) if not siege.is_empty() else ""]))
		_body.add_child(_row([hud._button("Propose a truce", func() -> void: _cmd({"type": "proposeTreaty", "kind": "truce", "to": other, "terms": {"durationDays": 4}})),
			hud._button("Propose peace", func() -> void: _cmd({"type": "proposeTreaty", "kind": "peace", "to": other, "terms": {"durationDays": 16}}), "Land your soldiers hold is not asked for here")]))
	# Move civilians out of a threatened settlement (War.tsx): settlers who are not soldiers walk to
	# the other settlement's hall and live there.
	var at_war := false
	for ws: Dictionary in sim.war_states.values():
		at_war = at_war or int(ws["attacker"]) == 0 or int(ws["defender"]) == 0
	if at_war and sim.settlements.size() >= 2:
		_body.add_child(_text("[b]Move civilians out[/b]: everyone who is not a soldier walks to the other settlement and lives there.", true))
		var moves: Array = []
		for a: Dictionary in sim.settlements:
			for b: Dictionary in sim.settlements:
				if int(a["id"]) == int(b["id"]):
					continue
				var fa := int(a["id"])
				var tb := int(b["id"])
				moves.append(hud._button("%s to %s" % [Settlements.name_of(sim, fa), Settlements.name_of(sim, tb)], func() -> void: _cmd({"type": "evacuate", "from": fa, "to": tb})))
		_body.add_child(_row(moves.slice(0, 6)))
	for k: Dictionary in sim.kingdoms:
		if k["player"] or Diplomacy.at_war(sim, 0, int(k["id"])):
			continue
		var kid := int(k["id"])
		var p := Combat.declare_preview(sim, kid)
		var blockers: Array = p["blockers"]
		var line := "%s — %s" % [k["name"], "; ".join(PackedStringArray(blockers)) if not blockers.is_empty() else "war possible%s" % (" (breaks %s)" % ", ".join(PackedStringArray(p["breaches"])) if not (p["breaches"] as Array).is_empty() else "")]
		_body.add_child(_text(line, not blockers.is_empty()))
		if blockers.is_empty():
			_body.add_child(_row([hud._button("Declare war (raid)", func() -> void: _cmd({"type": "declareWar", "target": kid, "objective": "raid", "confirmBreach": true}), "Others will hear of it"),
				hud._button("Plan a campaign", func() -> void: _cmd({"type": "createWarPlan", "target": kid, "objective": "raid"}), "Private until you ask an ally")]))
	for plan: Dictionary in sim.war_plans:
		if not ["drafting", "mobilizing"].has(plan["state"]):
			continue
		var pid := int(plan["id"])
		var asmt := Campaigns.assess(sim, pid)
		_body.add_child(_text("[b]Campaign against %s[/b] (%s) · allies proposed %d, pledged %d, arrived %d · food for %d days%s" % [asmt["target"], plan["state"], int(asmt["allies"]["proposed"]),
			int(asmt["allies"]["pledged"]), int(asmt["allies"]["arrived"]), int(asmt["supplyDays"]), "\n" + "; ".join(PackedStringArray(asmt["blockers"])) if not (asmt["blockers"] as Array).is_empty() else ""]))
		var acts: Array = []
		if plan["state"] == "drafting":
			for k: Dictionary in sim.kingdoms:
				if k["player"] or int(k["id"]) == int(plan["target"]):
					continue
				var aid := int(k["id"])
				acts.append(hud._button("Ask %s for 1 company" % k["name"], func() -> void:
					_cmd({"type": "requestCampaignSupport", "planId": pid, "ally": aid, "terms": {"companies": 1, "coinFee": 30, "supplyPayer": "shared", "serviceDays": 4, "commandRights": "coordinated", "rewardSectors": [], "reciprocalDefenseDays": 0}}),
					"30 coins, shared supplies, 4 days, under their own command"))
			acts.append(hud._button("Muster", func() -> void: _cmd({"type": "mobilizeCampaign", "planId": pid})))
			acts.append(hud._button("Shelve", func() -> void: _cmd({"type": "cancelWarPlan", "planId": pid})))
		else:
			acts.append(hud._button("Launch", func() -> void: _cmd({"type": "launchCampaign", "planId": pid, "confirmBreach": true}), "Declares war if needed"))
		_body.add_child(_row(acts))
	for c: Dictionary in sim.commitments:
		if c["state"] == "countered":
			var cmid := int(c["id"])
			_body.add_child(_text("%s would come for %d coins, %d days: %s" % [Kingdoms.name_of(sim, int(c["contributor"]), "?"), int(c["terms"]["coinFee"]), int(c["terms"]["serviceDays"]), "; ".join(PackedStringArray(c["reasons"]))]))
			_body.add_child(_row([hud._button("Accept their terms", func() -> void: _cmd({"type": "acceptCampaignOffer", "commitmentId": cmid}))]))
	if sim.war_states.is_empty() and sim.war_plans.is_empty():
		_body.add_child(_text("War is limited and explicit: it needs a crown, the Civilization milestone and an open frontier. Homelands stay protected unless you chose full conquest.", true))
