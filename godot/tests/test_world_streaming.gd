extends TestCase
## The streamed World: queries never generate, generation (threaded or not) is bit-identical to
## WorldGen, nothing explored is lost on unload, modified chunks stay loaded.

const SEED := 12345


func _same_chunk(a: Chunk, b: Chunk, where: String) -> void:
	check_eq(WorldNoise.fnv(a.terrain), WorldNoise.fnv(b.terrain), where + " terrain")
	check_eq(WorldNoise.fnv(a.obj), WorldNoise.fnv(b.obj), where + " objects")
	check_eq(WorldNoise.fnv(a.amt), WorldNoise.fnv(b.amt), where + " amounts")


func test_queries_never_generate() -> void:
	var w := World.new(SEED)
	for y in range(-200, 200, 7):
		for x in range(-200, 200, 7):
			w.terrain(x, y)
			w.obj(x, y)
			w.naturally_walkable(x, y)
			w.explored(x, y)
	check_eq(w.loaded_count(), 0, "chunks loaded by queries")
	check_eq(w.terrain(5, 5), World.UNKNOWN, "unloaded terrain is UNKNOWN")
	check(not w.naturally_walkable(5, 5), "unloaded tiles are not walkable")


func test_ensure_matches_generator() -> void:
	var w := World.new(SEED, 4, "forest")
	for p: Vector2i in [Vector2i(0, 0), Vector2i(-1, 2), Vector2i(3, -4)]:
		_same_chunk(w.ensure(p.x, p.y), WorldGen.generate_chunk(SEED, p.x, p.y, 4, "forest"), "chunk %s" % p)
	check_eq(w.loaded_count(), 3, "loaded after ensure")


func test_threaded_and_budgeted_generation_match() -> void:
	for threaded: bool in [true, false]:
		var w := World.new(SEED)
		w.threaded = threaded
		for cy in range(-1, 2):
			for cx in range(-1, 2):
				w.request(cx, cy)
		w.request(0, 0)
		check_eq(w.pending_count(), 9, "duplicate requests are ignored (threaded=%s)" % threaded)
		w.finish_pending()
		check_eq(w.loaded_count(), 9, "all requested chunks installed (threaded=%s)" % threaded)
		_same_chunk(w.peek(1, -1), WorldGen.generate_chunk(SEED, 1, -1, 4, "valley"), "threaded=%s chunk 1,-1" % threaded)


func test_reveal_into_unloaded_land_keeps_exploration() -> void:
	var w := World.new(SEED)
	w.threaded = false
	var n := w.reveal(40.0, 40.0, 6.0)
	check(n > 100, "tiles revealed: %d" % n)
	check_eq(w.loaded_count(), 0, "revealing does not generate synchronously")
	check(w.explored(40, 40), "explored before the chunk is loaded")
	check(w.pending_count() > 0, "revealed chunks are requested")
	w.finish_pending()
	check(w.explored(40, 40), "explored after the chunk loads")
	check_eq(w.reveal(40.0, 40.0, 6.0), 0, "revealing again finds nothing new")


func test_evict_keeps_modified_chunks_and_exploration() -> void:
	var w := World.new(SEED)
	var a := w.ensure(0, 0)
	w.ensure(1, 0)
	w.ensure(2, 0)
	w.reveal(40.0, 10.0, 5.0)
	w.set_obj(70, 5, Tiles.O_STUMP, 0)
	var explored_before := w.explored_bits(1, 0)
	var dropped := w.evict({World.key(0, 0): true})
	check_eq(dropped, 1, "only the unmodified, unkept chunk is dropped")
	check(w.peek(0, 0) == a, "kept chunk stays")
	check(w.is_loaded(2, 0), "modified chunk stays")
	check(not w.is_loaded(1, 0), "unmodified chunk is unloaded")
	check(w.explored(40, 10), "exploration survives unloading")
	var again := w.ensure(1, 0)
	_same_chunk(again, WorldGen.generate_chunk(SEED, 1, 0, 4, "valley"), "regenerated chunk")
	check_eq(World.pack_bits(again.explored), explored_before, "exploration restored on reload")


func test_bitset_layout_matches_browser_saves() -> void:
	var flags := PackedByteArray()
	flags.resize(Chunk.AREA)
	flags[0] = 1
	flags[9] = 1
	flags[1023] = 1
	var bits := World.pack_bits(flags)
	check_eq(bits.size(), 128, "bitset size")
	check_eq([bits[0], bits[1], bits[127]], [1, 2, 128], "lowest bit first")
	var back := PackedByteArray()
	back.resize(Chunk.AREA)
	check_eq(World.unpack_bits(bits, back), 3, "unpacked count")
	check_eq(back, flags, "round trip")


func test_install_saved_chunk() -> void:
	var w := World.new(SEED)
	var g := WorldGen.generate_chunk(SEED, 5, 5, 4, "valley")
	g.terrain[0] = Tiles.ROAD
	var bits := PackedByteArray()
	bits.resize(128)
	bits[0] = 1
	w.install_saved(5, 5, g.terrain, g.obj, g.amt, bits)
	check_eq(w.terrain(160, 160), Tiles.ROAD, "saved terrain kept")
	check(w.explored(160, 160), "saved exploration kept")
	check(w.peek(5, 5).modified, "saved chunk is modified")
	check_eq(w.evict({}), 0, "a saved (modified) chunk is never evicted")
